import { MarkdownWriter } from "../../../classes/Writer";
import {
  IStrategyTickResult,
  IStrategyTickResultClosed,
  StrategyName,
} from "../../../interfaces/Strategy.interface";
import { inject } from "../../../lib/core/di";
import LoggerService, { TLoggerService } from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { memoize, singleshot, str } from "functools-kit";
import { signalEmitter } from "../../../config/emitters";
import { IHeatmapRow } from "../../../interfaces/Heatmap.interface";
import { HeatmapStatisticsModel } from "../../../model/HeatmapStatistics.model";
import { ColumnModel } from "../../../model/Column.model";
import { COLUMN_CONFIG } from "../../../config/columns";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";
import { getContextTimestamp } from "../../../helpers/getContextTimestamp";
import { GLOBAL_CONFIG } from "../../../config/params";

/**
 * Type alias for column configuration used in heatmap markdown reports.
 * 
 * Represents a column model specifically designed to format and display
 * per-symbol portfolio statistics in markdown tables.
 * 
 * @typeParam IHeatmapRow - The heatmap row data type containing aggregated
 *   statistics per symbol (PNL, Sharpe Ratio, Max Drawdown, trade counts)
 * 
 * @example
 * ```typescript
 * // Column to display symbol name
 * const symbolColumn: Columns = {
 *   key: "symbol",
 *   label: "Symbol",
 *   format: (row) => row.symbol,
 *   isVisible: () => true
 * };
 * 
 * // Column to display portfolio PNL
 * const pnlColumn: Columns = {
 *   key: "totalPnl",
 *   label: "Total PNL %",
 *   format: (row) => row.totalPnl !== null ? row.totalPnl.toFixed(2) + '%' : 'N/A',
 *   isVisible: () => true
 * };
 * ```
 * 
 * @see ColumnModel for the base interface
 * @see IHeatmapRow for the row data structure
 */
export type Columns = ColumnModel<IHeatmapRow>;

/**
 * Creates a unique key for memoizing HeatmapStorage instances.
 * Key format: "exchangeName:frameName:backtest" or "exchangeName:live"
 * @param exchangeName - Exchange name
 * @param frameName - Frame name
 * @param backtest - Whether running in backtest mode
 * @returns Unique string key for memoization
 */
const CREATE_KEY_FN = (
  exchangeName: ExchangeName,
  frameName: FrameName,
  backtest: boolean
): string => {
  const parts = [exchangeName];
  if (frameName) parts.push(frameName);
  parts.push(backtest ? "backtest" : "live");
  return parts.join(":");
};

/**
 * Creates a filename for markdown report based on memoization key components.
 * Filename format: "strategyName_exchangeName_frameName-timestamp.md"
 */
const CREATE_FILE_NAME_FN = (
  strategyName: StrategyName,
  exchangeName: ExchangeName,
  frameName: FrameName,
  timestamp: number
): string => {
  const parts = [strategyName, exchangeName];
  if (frameName) { parts.push(frameName); parts.push("backtest"); }
  else parts.push("live");
  return `${parts.join("_")}-${timestamp}.md`;
};

const HEATMAP_METHOD_NAME_GET_DATA = "HeatMarkdownService.getData";
const HEATMAP_METHOD_NAME_GET_REPORT = "HeatMarkdownService.getReport";
const HEATMAP_METHOD_NAME_DUMP = "HeatMarkdownService.dump";
const HEATMAP_METHOD_NAME_CLEAR = "HeatMarkdownService.clear";

/**
 * Checks if a value is unsafe for display (not a number, NaN, or Infinity).
 *
 * @param value - Value to check
 * @returns true if value is unsafe, false otherwise
 */
function isUnsafe(value: number | null): boolean {
  if (typeof value !== "number") {
    return true;
  }
  if (isNaN(value)) {
    return true;
  }
  if (!isFinite(value)) {
    return true;
  }
  return false;
}

/** Minimum closed signals required to annualize Sharpe / yearly returns / Calmar. */
const MIN_SIGNALS_FOR_ANNUALIZATION = 10;
/** Minimum signals required for ANY ratio metric (Sharpe / Sortino / stdDev). Below this,
 *  sample size is too small to estimate variance meaningfully. */
const MIN_SIGNALS_FOR_RATIOS = 10;
/** Minimum calendar span (days) for trade-frequency extrapolation. */
const MIN_CALENDAR_SPAN_DAYS = 14;
/** Hard cap on tradesPerYear — prevents absurd extrapolation from short windows / clustered trades. */
const MAX_TRADES_PER_YEAR = 365;
/** Hard cap on |expectedYearlyReturns| percent. Compound interest on high avgPnl × frequency
 *  blows up to mathematically correct but business-unrealistic values. ±100% = 2x equity —
 *  anything above this we suspect is a noisy estimate, not a genuine edge. Above the cap → null. */
const MAX_EXPECTED_YEARLY_RETURNS = 100;
/** Hard cap on |calmarRatio|. Prevents explosion when equityMaxDrawdown is near zero. */
const MAX_CALMAR_RATIO = 1000;
/** Minimum stdDev required for Sharpe/Sortino. Identical-returns series produce
 *  float-artifact stdDev (~1e-17) that's > 0 but spuriously inflates sharpe to
 *  astronomical magnitudes (avgPnl / epsilon). */
const STDDEV_EPSILON = 1e-9;


/**
 * Storage class for accumulating closed signals per strategy and generating heatmap.
 * Maintains symbol-level statistics and provides portfolio-wide metrics.
 */
class HeatmapStorage {
  /** Internal storage of closed signals per symbol */
  private symbolData: Map<string, IStrategyTickResultClosed[]> = new Map();

  constructor(
    readonly exchangeName: ExchangeName,
    readonly frameName: FrameName,
    readonly backtest: boolean
  ) {}

  /**
   * Adds a closed signal to the per-symbol queue.
   *
   * New signals are prepended (most recent first). Once the queue exceeds
   * `GLOBAL_CONFIG.CC_MAX_HEATMAP_MARKDOWN_ROWS` (250) entries for a given
   * symbol, the oldest entry is dropped from the tail to cap memory usage.
   *
   * @param data - Closed signal result containing `symbol` and `pnl.pnlPercentage`
   */
  public addSignal(data: IStrategyTickResultClosed) {
    const { symbol } = data;

    if (!this.symbolData.has(symbol)) {
      this.symbolData.set(symbol, []);
    }

    const signals = this.symbolData.get(symbol)!;
    signals.unshift(data);

    // Trim queue if exceeded GLOBAL_CONFIG.CC_MAX_HEATMAP_MARKDOWN_ROWS per symbol
    if (signals.length > GLOBAL_CONFIG.CC_MAX_HEATMAP_MARKDOWN_ROWS) {
      signals.pop();
    }
  }


  /**
   * Calculates all aggregated trading statistics for a single symbol.
   *
   * Metrics computed (all guard-checked via `isUnsafe` — set to `null` on
   * NaN / Infinity / non-number):
   * - **totalPnl** — sum of `pnlPercentage` across all signals
   * - **avgPnl** — arithmetic mean of `pnlPercentage`
   * - **stdDev** — population standard deviation of `pnlPercentage`
   * - **sharpeRatio** — per-trade Sharpe: `avgPnl / stdDev`; requires ≥ 2 signals and `stdDev > 0`
   * - **maxDrawdown** — largest cumulative loss streak (absolute value of peak negative equity)
   * - **profitFactor** — `sumWins / |sumLosses|`; requires at least one win and one loss
   * - **avgWin / avgLoss** — mean of positive / negative trades respectively
   * - **winRate** — `winCount / totalTrades * 100`
   * - **maxWinStreak / maxLossStreak** — longest unbroken run of consecutive wins/losses
   * - **expectancy** — `(winRate/100)*avgWin + (lossRate/100)*avgLoss`
   *
   * @param symbol - Trading pair symbol (e.g. `"BTCUSDT"`)
   * @param signals - Array of closed signals for this symbol (newest first)
   * @returns `IHeatmapRow` with all aggregated statistics; unavailable metrics are `null`
   */
  private calculateSymbolStats(
    symbol: string,
    signals: IStrategyTickResultClosed[]
  ): IHeatmapRow {
    const totalTrades = signals.length;
    const winCount = signals.filter((s) => s.pnl.pnlPercentage > 0).length;
    const lossCount = signals.filter((s) => s.pnl.pnlPercentage < 0).length;

    // Win rate excludes break-even trades from both numerator and denominator —
    // they are neither wins nor losses.
    let winRate: number | null = null;
    const decisiveTrades = winCount + lossCount;
    if (decisiveTrades > 0) {
      winRate = (winCount / decisiveTrades) * 100;
    }

    // Calculate total PNL
    let totalPnl: number | null = null;
    if (signals.length > 0) {
      totalPnl = signals.reduce((acc, s) => acc + s.pnl.pnlPercentage, 0);
    }

    // Calculate average PNL
    let avgPnl: number | null = null;
    if (signals.length > 0) {
      avgPnl = totalPnl! / signals.length;
    }

    // Sample standard deviation (Bessel correction: divide by N-1, not N).
    // Per-symbol ratios are gated by MIN_SIGNALS_FOR_RATIOS — variance estimates from
    // tiny samples are too noisy to publish.
    const canComputeRatios = signals.length >= MIN_SIGNALS_FOR_RATIOS;
    let stdDev: number | null = null;
    if (canComputeRatios && avgPnl !== null) {
      const variance =
        signals.reduce(
          (acc, s) => acc + Math.pow(s.pnl.pnlPercentage - avgPnl!, 2),
          0
        ) / (signals.length - 1);
      stdDev = Math.sqrt(variance);
    }

    // Per-trade Sharpe Ratio
    let sharpeRatio: number | null = null;
    // STDDEV_EPSILON guard — protects against float-artifact stdDev producing
    // spuriously astronomical sharpe on identical-returns symbols.
    if (avgPnl !== null && stdDev !== null && stdDev > STDDEV_EPSILON) {
      sharpeRatio = avgPnl / stdDev;
    }

    // Equity-curve max drawdown via compounded equity ("as-if 100% allocation per trade").
    // Signals are stored newest-first (unshift in addSignal), so iterate in reverse.
    // If equity ≤ 0 — account blown, fix DD at 100%. equityFinal feeds expectedYearlyReturns.
    let maxDrawdown: number | null = null;
    let equityFinal = 1;
    let blown = false;
    if (signals.length > 0) {
      let equity = 1;
      let peak = 1;
      let maxDD = 0;
      for (let i = signals.length - 1; i >= 0; i--) {
        equity *= 1 + signals[i].pnl.pnlPercentage / 100;
        if (equity <= 0) {
          maxDD = 100;
          blown = true;
          break;
        }
        if (equity > peak) peak = equity;
        const dd = (peak - equity) / peak * 100;
        if (dd > maxDD) maxDD = dd;
      }
      maxDrawdown = maxDD;
      equityFinal = blown ? 0 : equity;
    }

    // Calculate Profit Factor
    let profitFactor: number | null = null;
    if (winCount > 0 && lossCount > 0) {
      const sumWins = signals
        .filter((s) => s.pnl.pnlPercentage > 0)
        .reduce((acc, s) => acc + s.pnl.pnlPercentage, 0);
      const sumLosses = Math.abs(
        signals
          .filter((s) => s.pnl.pnlPercentage < 0)
          .reduce((acc, s) => acc + s.pnl.pnlPercentage, 0)
      );
      // STDDEV_EPSILON guard — float-artifact losses (≈1e-15) would otherwise
      // produce spurious astronomical profitFactor (≈1e14).
      if (sumLosses > STDDEV_EPSILON) {
        profitFactor = sumWins / sumLosses;
      }
    }

    // Calculate Average Win / Average Loss
    let avgWin: number | null = null;
    let avgLoss: number | null = null;
    if (winCount > 0) {
      avgWin =
        signals
          .filter((s) => s.pnl.pnlPercentage > 0)
          .reduce((acc, s) => acc + s.pnl.pnlPercentage, 0) / winCount;
    }
    if (lossCount > 0) {
      avgLoss =
        signals
          .filter((s) => s.pnl.pnlPercentage < 0)
          .reduce((acc, s) => acc + s.pnl.pnlPercentage, 0) / lossCount;
    }

    // Calculate Win/Loss Streaks
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let currentWinStreak = 0;
    let currentLossStreak = 0;

    for (const signal of signals) {
      if (signal.pnl.pnlPercentage > 0) {
        currentWinStreak++;
        currentLossStreak = 0;
        if (currentWinStreak > maxWinStreak) {
          maxWinStreak = currentWinStreak;
        }
      } else if (signal.pnl.pnlPercentage < 0) {
        currentLossStreak++;
        currentWinStreak = 0;
        if (currentLossStreak > maxLossStreak) {
          maxLossStreak = currentLossStreak;
        }
      }
    }

    // Expectancy — probabilities from observed win/loss counts (break-evens contribute 0).
    let expectancy: number | null = null;
    if (totalTrades > 0 && avgWin !== null && avgLoss !== null) {
      const winProb = winCount / totalTrades;
      const lossProb = lossCount / totalTrades;
      expectancy = winProb * avgWin + lossProb * avgLoss;
    } else if (totalTrades > 0 && avgWin !== null && avgLoss === null) {
      // No losing trades — expectancy is just average win frequency × avgWin
      expectancy = (winCount / totalTrades) * avgWin;
    } else if (totalTrades > 0 && avgWin === null && avgLoss !== null) {
      expectancy = (lossCount / totalTrades) * avgLoss;
    }

    // Average only over signals that have the value — do not dilute the mean with zeros.
    let avgPeakPnl: number | null = null;
    let avgFallPnl: number | null = null;
    if (signals.length > 0) {
      const peakValues = signals
        .map((s) => s.signal.peakProfit?.pnlPercentage)
        .filter((v): v is number => typeof v === "number");
      const fallValues = signals
        .map((s) => s.signal.maxDrawdown?.pnlPercentage)
        .filter((v): v is number => typeof v === "number");
      avgPeakPnl = peakValues.length > 0
        ? peakValues.reduce((sum, v) => sum + v, 0) / peakValues.length
        : null;
      avgFallPnl = fallValues.length > 0
        ? fallValues.reduce((sum, v) => sum + v, 0) / fallValues.length
        : null;
    }

    // Sortino (canonical, Sortino 1991): (avgPnl - MAR) / downside deviation, where
    // downsideDev = √( Σ min(0, r - MAR)² / N_total ). We use MAR = 0 (risk-free target),
    // so the numerator reduces to avgPnl and the squared term to r² for r < 0.
    // Dividing by N_total (not N_negative) properly penalises strategies with frequent
    // losses; the "modified" form (N_negative) hides frequency risk in catastrophic-tail
    // strategies.
    let sortinoRatio: number | null = null;
    if (canComputeRatios && avgPnl !== null) {
      const negativeReturns = signals
        .map((s) => s.pnl.pnlPercentage)
        .filter((r) => r < 0);
      if (negativeReturns.length > 0) {
        const downsideVariance = negativeReturns.reduce((acc, r) => acc + r * r, 0) / signals.length;
        const downsideDeviation = Math.sqrt(downsideVariance);
        // Same epsilon guard as Sharpe — protects against float-artifact downsideDev.
        if (downsideDeviation > STDDEV_EPSILON) {
          sortinoRatio = avgPnl / downsideDeviation;
        }
      }
    }

    // Expected yearly returns via geometric mean of equity curve.
    // equityFinal^(tradesPerYear / N) - 1 — accounts for volatility drag.
    // Gated by sample size and calendar span; if account blown → full loss.
    let expectedYearlyReturns: number | null = null;
    let tradesPerYear: number | null = null;
    if (signals.length >= MIN_SIGNALS_FOR_ANNUALIZATION) {
      let firstPendingAt = Infinity;
      let lastCloseAt = -Infinity;
      for (const s of signals) {
        if (s.signal.pendingAt < firstPendingAt) firstPendingAt = s.signal.pendingAt;
        if (s.closeTimestamp > lastCloseAt) lastCloseAt = s.closeTimestamp;
      }
      const calendarSpanDays = (lastCloseAt - firstPendingAt) / (1000 * 60 * 60 * 24);
      if (calendarSpanDays >= MIN_CALENDAR_SPAN_DAYS) {
        // tradesPerYear uses RAW observed frequency — no clipping. If the raw value
        // exceeds MAX_TRADES_PER_YEAR the sample is too clustered for reliable
        // annualization, and we leave the annualized metric null instead of silently
        // understating it with a clipped frequency.
        const rawTradesPerYear = (signals.length / calendarSpanDays) * 365;
        if (rawTradesPerYear <= MAX_TRADES_PER_YEAR) {
          tradesPerYear = rawTradesPerYear;
          if (blown) {
            expectedYearlyReturns = -100;
          } else {
            // If raw value exceeds MAX_EXPECTED_YEARLY_RETURNS, leave null rather than
            // show the cap — capped numbers mislead users into trusting them.
            const raw = (Math.pow(equityFinal, tradesPerYear / signals.length) - 1) * 100;
            expectedYearlyReturns = Math.abs(raw) > MAX_EXPECTED_YEARLY_RETURNS ? null : raw;
          }
        }
      }
    }

    // Calmar = annualized return / equity-curve max drawdown, capped at ±MAX_CALMAR_RATIO.
    // Recovery Factor uses the compounded total return (equityFinal-1)*100, not arithmetic
    // totalPnl — denominator is compounded so numerator must match. Null when account blown.
    let calmarRatio: number | null = null;
    let recoveryFactor: number | null = null;
    if (maxDrawdown !== null && maxDrawdown > 0) {
      if (expectedYearlyReturns !== null) {
        const raw = expectedYearlyReturns / maxDrawdown;
        calmarRatio = Math.max(-MAX_CALMAR_RATIO, Math.min(MAX_CALMAR_RATIO, raw));
      }
      if (!blown && canComputeRatios) {
        // Gated below MIN_SIGNALS_FOR_RATIOS like Sharpe — a Recovery Factor on
        // a handful of trades is statistically meaningless, so don't surface it
        // per-symbol while Sharpe is N/A.
        // Same MAX_CALMAR_RATIO clamp as Calmar — both compounded-profit/DD ratios.
        const rawRec = ((equityFinal - 1) * 100) / maxDrawdown;
        recoveryFactor = Math.max(-MAX_CALMAR_RATIO, Math.min(MAX_CALMAR_RATIO, rawRec));
      }
    }

    // Apply safe math checks
    if (isUnsafe(winRate)) winRate = null;
    if (isUnsafe(totalPnl)) totalPnl = null;
    if (isUnsafe(avgPnl)) avgPnl = null;
    if (isUnsafe(stdDev)) stdDev = null;
    if (isUnsafe(sharpeRatio)) sharpeRatio = null;
    if (isUnsafe(maxDrawdown)) maxDrawdown = null;
    if (isUnsafe(profitFactor)) profitFactor = null;
    if (isUnsafe(avgWin)) avgWin = null;
    if (isUnsafe(avgLoss)) avgLoss = null;
    if (isUnsafe(expectancy)) expectancy = null;
    if (isUnsafe(avgPeakPnl)) avgPeakPnl = null;
    if (isUnsafe(avgFallPnl)) avgFallPnl = null;
    if (isUnsafe(sortinoRatio)) sortinoRatio = null;
    if (isUnsafe(calmarRatio)) calmarRatio = null;
    if (isUnsafe(recoveryFactor)) recoveryFactor = null;

    return {
      symbol,
      totalPnl,
      sharpeRatio,
      maxDrawdown,
      totalTrades,
      winCount,
      lossCount,
      winRate,
      avgPnl,
      stdDev,
      profitFactor,
      avgWin,
      avgLoss,
      maxWinStreak,
      maxLossStreak,
      expectancy,
      avgPeakPnl,
      avgFallPnl,
      sortinoRatio,
      calmarRatio,
      recoveryFactor,
    };
  }

  /**
   * Builds the full `HeatmapStatisticsModel` for this storage instance.
   *
   * Steps:
   * 1. Calls `calculateSymbolStats` for every tracked symbol.
   * 2. Sorts symbols by `sharpeRatio` descending — best performers first,
   *    symbols with `null` sharpeRatio placed at the end.
   * 3. Computes portfolio-wide aggregates:
   *    - `portfolioTotalPnl` — sum of per-symbol `totalPnl` values, skipping `null` entries
   *      (so a symbol with no data does not silently contribute 0). If every symbol's
   *      `totalPnl` is null, the portfolio value is null.
   *    - `portfolioTotalTrades` — sum of per-symbol `totalTrades`
   *    - `portfolioSharpeRatio` — POOLED Sharpe over all trades across symbols (sample
   *      stddev, N-1). NOT a Markowitz portfolio Sharpe — ignores cross-symbol
   *      correlations and capital allocation. Rendered as "Pooled Sharpe" in the report.
   *      Gated by `MIN_SIGNALS_FOR_RATIOS` on the pooled count.
   *    - `portfolioAvgPeakPnl` / `portfolioAvgFallPnl` — trade-count-weighted means
   *      over symbols that have non-null values.
   *
   * @returns Promise resolving to `HeatmapStatisticsModel`
   */
  public async getData(): Promise<HeatmapStatisticsModel> {
    const symbols: IHeatmapRow[] = [];

    // Calculate per-symbol statistics
    for (const [symbol, signals] of this.symbolData.entries()) {
      const row = this.calculateSymbolStats(symbol, signals);
      symbols.push(row);
    }

    // Sort by Sharpe Ratio descending (best performers first, nulls last)
    symbols.sort((a, b) => {
      if (a.sharpeRatio === null && b.sharpeRatio === null) return 0;
      if (a.sharpeRatio === null) return 1;
      if (b.sharpeRatio === null) return -1;
      return b.sharpeRatio - a.sharpeRatio;
    });

    // Portfolio totals — sum only over symbols with non-null totalPnl. `s.totalPnl || 0`
    // would silently treat a missing value as zero and hide that some symbols had no data.
    const totalSymbols = symbols.length;
    let portfolioTotalPnl: number | null = null;
    let portfolioTotalTrades = 0;

    if (symbols.length > 0) {
      const validTotalPnls = symbols.filter((s) => s.totalPnl !== null);
      portfolioTotalPnl = validTotalPnls.length > 0
        ? validTotalPnls.reduce((acc, s) => acc + s.totalPnl!, 0)
        : null;
      portfolioTotalTrades = symbols.reduce((acc, s) => acc + s.totalTrades, 0);
    }

    // Pooled metrics over all returns across symbols. NOT a Markowitz portfolio —
    // ignores cross-symbol correlations, treats trades as a single pooled sample.
    // Gated by MIN_SIGNALS_FOR_RATIOS so a tiny pool can't produce noisy ratios.
    let portfolioSharpeRatio: number | null = null;
    let portfolioStdDev: number | null = null;
    let portfolioSortinoRatio: number | null = null;
    let portfolioExpectancy: number | null = null;
    let portfolioCalmarRatio: number | null = null;
    let portfolioRecoveryFactor: number | null = null;
    const allReturns: number[] = [];
    for (const signals of this.symbolData.values()) {
      for (const s of signals) {
        allReturns.push(s.pnl.pnlPercentage);
      }
    }
    if (allReturns.length >= MIN_SIGNALS_FOR_RATIOS) {
      const portfolioAvg = allReturns.reduce((acc, r) => acc + r, 0) / allReturns.length;
      const portfolioVariance =
        allReturns.reduce((acc, r) => acc + Math.pow(r - portfolioAvg, 2), 0) /
        (allReturns.length - 1);
      const stdDev = Math.sqrt(portfolioVariance);
      // STDDEV_EPSILON guard — same protection as per-symbol Sharpe.
      portfolioStdDev = stdDev;
      if (stdDev > STDDEV_EPSILON) {
        portfolioSharpeRatio = portfolioAvg / stdDev;
      }

      // Canonical Sortino: downside dev = √( Σ min(0, r)² / N_total ), MAR=0.
      const negativeReturns = allReturns.filter((r) => r < 0);
      if (negativeReturns.length > 0) {
        const downsideVariance =
          negativeReturns.reduce((acc, r) => acc + r * r, 0) / allReturns.length;
        const downsideDeviation = Math.sqrt(downsideVariance);
        if (downsideDeviation > STDDEV_EPSILON) {
          portfolioSortinoRatio = portfolioAvg / downsideDeviation;
        }
      }

      // Pooled Expectancy: per-trade EV = winProb*avgWin + lossProb*avgLoss.
      // Break-even trades contribute 0 (excluded from both probs).
      const wins = allReturns.filter((r) => r > 0);
      const losses = allReturns.filter((r) => r < 0);
      const total = allReturns.length;
      const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
      const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
      if (wins.length > 0 || losses.length > 0) {
        portfolioExpectancy = (wins.length / total) * avgWin + (losses.length / total) * avgLoss;
      }

      // Pooled equity-curve max drawdown (compounded).
      let equity = 1;
      let peak = 1;
      let maxDD = 0;
      let blown = false;
      for (const r of allReturns) {
        equity *= 1 + r / 100;
        if (equity <= 0) {
          maxDD = 100;
          blown = true;
          break;
        }
        if (equity > peak) peak = equity;
        const dd = ((peak - equity) / peak) * 100;
        if (dd > maxDD) maxDD = dd;
      }
      const equityFinal = blown ? 0 : equity;

      // Pooled Calmar / Recovery, both clamped at ±MAX_CALMAR_RATIO and using
      // compounded total return / DD. Same shape as per-symbol formula.
      if (maxDD > 0) {
        if (!blown) {
          const rawCalmar = ((equityFinal - 1) * 100) / maxDD;
          portfolioCalmarRatio = Math.max(
            -MAX_CALMAR_RATIO,
            Math.min(MAX_CALMAR_RATIO, rawCalmar),
          );
          const rawRec = ((equityFinal - 1) * 100) / maxDD;
          portfolioRecoveryFactor = Math.max(
            -MAX_CALMAR_RATIO,
            Math.min(MAX_CALMAR_RATIO, rawRec),
          );
        } else {
          // Blown — full loss is the only meaningful value; recovery undefined.
          portfolioCalmarRatio = -1; // -100 / 100
        }
      }
    }

    // Portfolio-wide weighted average peak/fall PNL. Denominator must include only
    // symbols that contributed a value — otherwise trade-count-weighted mean is diluted
    // by symbols without the metric.
    let portfolioAvgPeakPnl: number | null = null;
    let portfolioAvgFallPnl: number | null = null;
    const validPeak = symbols.filter((s) => s.avgPeakPnl !== null);
    const validFall = symbols.filter((s) => s.avgFallPnl !== null);
    const peakTradesTotal = validPeak.reduce((acc, s) => acc + s.totalTrades, 0);
    const fallTradesTotal = validFall.reduce((acc, s) => acc + s.totalTrades, 0);
    if (validPeak.length > 0 && peakTradesTotal > 0) {
      portfolioAvgPeakPnl = validPeak.reduce((acc, s) => acc + s.avgPeakPnl! * s.totalTrades, 0) / peakTradesTotal;
    }
    if (validFall.length > 0 && fallTradesTotal > 0) {
      portfolioAvgFallPnl = validFall.reduce((acc, s) => acc + s.avgFallPnl! * s.totalTrades, 0) / fallTradesTotal;
    }

    // Apply safe math
    if (isUnsafe(portfolioTotalPnl)) portfolioTotalPnl = null;
    if (isUnsafe(portfolioSharpeRatio)) portfolioSharpeRatio = null;
    if (isUnsafe(portfolioAvgPeakPnl)) portfolioAvgPeakPnl = null;
    if (isUnsafe(portfolioAvgFallPnl)) portfolioAvgFallPnl = null;
    if (isUnsafe(portfolioStdDev)) portfolioStdDev = null;
    if (isUnsafe(portfolioSortinoRatio)) portfolioSortinoRatio = null;
    if (isUnsafe(portfolioCalmarRatio)) portfolioCalmarRatio = null;
    if (isUnsafe(portfolioRecoveryFactor)) portfolioRecoveryFactor = null;
    if (isUnsafe(portfolioExpectancy)) portfolioExpectancy = null;

    return {
      symbols,
      totalSymbols,
      portfolioTotalPnl,
      portfolioSharpeRatio,
      portfolioTotalTrades,
      portfolioAvgPeakPnl,
      portfolioAvgFallPnl,
      portfolioStdDev,
      portfolioSortinoRatio,
      portfolioCalmarRatio,
      portfolioRecoveryFactor,
      portfolioExpectancy,
    };
  }

  /**
   * Renders a markdown heatmap report for this storage instance.
   *
   * Output structure (when data is available):
   * ```
   * # Portfolio Heatmap: {strategyName}
   *
   * **Total Symbols:** N | **Portfolio PNL:** X% | **Pooled Sharpe:** Y | **Total Trades:** Z
   *
   * | col1 | col2 | ... |
   * | ---  | ---  | ... |
   * | ...  | ...  | ... |
   * ```
   * When no signals have been recorded, returns a minimal header with `*No data available*`.
   *
   * Only columns whose `isVisible()` returns `true` are included in the table.
   * Rows are ordered by `sharpeRatio` descending (same order as `getData()`).
   *
   * @param strategyName - Strategy name rendered in the `# Portfolio Heatmap:` heading
   * @param columns - Column definitions controlling which fields appear and how they are
   *   formatted; defaults to `COLUMN_CONFIG.heat_columns`
   * @returns Promise resolving to the full markdown string
   */
  public async getReport(
    strategyName: StrategyName,
    columns: Columns[] = COLUMN_CONFIG.heat_columns
  ): Promise<string> {
    const data = await this.getData();

    if (data.symbols.length === 0) {
      return [
        `# Portfolio Heatmap: ${strategyName}`,
        "",
        "*No data available*"
      ].join("\n");
    }

    const visibleColumns = [];
    for (const col of columns) {
      if (await col.isVisible()) {
        visibleColumns.push(col);
      }
    }
    const header = visibleColumns.map((col) => col.label);
    const separator = visibleColumns.map(() => "---");
    const rows = await Promise.all(
      data.symbols.map(async (row, index) =>
        Promise.all(visibleColumns.map((col) => col.format(row, index)))
      )
    );

    const tableData = [header, separator, ...rows];
    const table = tableData.map((row) => `| ${row.join(" | ")} |`).join("\n");

    return [
      `# Portfolio Heatmap: ${strategyName}`,
      "",
      `**Total Symbols:** ${data.totalSymbols} | **Portfolio PNL:** ${data.portfolioTotalPnl !== null ? str(data.portfolioTotalPnl, "%") : "N/A"} | **Pooled Sharpe:** ${data.portfolioSharpeRatio !== null ? str(data.portfolioSharpeRatio) : "N/A"} | **Total Trades:** ${data.portfolioTotalTrades} | **Avg Peak PNL:** ${data.portfolioAvgPeakPnl !== null ? str(data.portfolioAvgPeakPnl, "%") : "N/A"} | **Avg Max Drawdown PNL:** ${data.portfolioAvgFallPnl !== null ? str(data.portfolioAvgFallPnl, "%") : "N/A"}`,
      `**Standard Deviation:** ${data.portfolioStdDev !== null ? str(data.portfolioStdDev, "%") : "N/A"} | **Sortino Ratio:** ${data.portfolioSortinoRatio !== null ? str(data.portfolioSortinoRatio) : "N/A"} | **Calmar Ratio:** ${data.portfolioCalmarRatio !== null ? str(data.portfolioCalmarRatio) : "N/A"} | **Recovery Factor:** ${data.portfolioRecoveryFactor !== null ? str(data.portfolioRecoveryFactor) : "N/A"} | **Expectancy:** ${data.portfolioExpectancy !== null ? str(data.portfolioExpectancy, "%") : "N/A"}`,
      "",
      table,
      "",
      `*Win Rate: reliable above 200+ signals; below 30 signals a single streak can shift it by 10-20%.*`,
      `*Pooled Sharpe: Sharpe computed over all trades across symbols treated as one sample. NOT a Markowitz portfolio Sharpe — ignores cross-symbol correlations and capital allocation. N/A unless ≥${MIN_SIGNALS_FOR_RATIOS} pooled trades.*`,
      `*Sharpe Ratio: below 1.0 is poor, 1.0-2.0 is acceptable, above 2.0 is strong. Requires 30+ signals per symbol.*`,
      `*Sortino Ratio: below 1.0 is poor, 1.0-2.0 is acceptable, above 2.0 is strong. Requires 30+ signals. N/A when no losing trades — Sortino is mathematically undefined (infinite) and we cannot distinguish "truly flawless" from "lucky streak so far".*`,
      `*Certainty Ratio: below 1.0 means average loss exceeds average win. Above 1.5 is considered good.*`,
      `*Profit Factor: below 1.0 means strategy is losing overall. Above 1.5 is considered good.*`,
      `*Calmar Ratio: below 0.5 is poor, 0.5-1.0 is acceptable, above 1.0 is strong. Denominator is compounded equity-curve max drawdown. N/A unless ≥${MIN_SIGNALS_FOR_ANNUALIZATION} signals per symbol and span ≥${MIN_CALENDAR_SPAN_DAYS} days. Capped at ±${MAX_CALMAR_RATIO}.*`,
      `*Recovery Factor: below 1.0 means total profit does not cover max drawdown. Above 3.0 is considered good. Uses compounded total return as numerator.*`,
      `*All metrics require 100+ signals per symbol to be statistically reliable. Annualized metrics assume the observed trading frequency persists year-round.*`,
      `*IMPORTANT: Per-symbol equity curve, Expected Yearly Returns, Calmar, Recovery and Max Drawdown all assume **100% capital allocation per trade** (no sizing, no portfolio fraction). If your strategy risks X% of capital per trade, the realized return / drawdown will be roughly X/100 of the reported figures. The framework does not track portfolio-level sizing, so these metrics represent a theoretical upper bound under full allocation.*`,
      `*Negative values for Sharpe / Sortino / Calmar / Recovery indicate a losing symbol (avgPnl < 0 or totalPnl < 0). "Higher is better" still applies — closer to zero is less bad, positive is profitable.*`,
    ].join("\n");
  }

  /**
   * Generates the markdown report and persists it via `MarkdownWriter.writeData`.
   *
   * The filename is built by `CREATE_FILE_NAME_FN`:
   * - Backtest: `{strategyName}_{exchangeName}_{frameName}_backtest-{timestamp}.md`
   * - Live:     `{strategyName}_{exchangeName}_live-{timestamp}.md`
   *
   * The timestamp comes from `getContextTimestamp()` — the backtest execution
   * context clock when inside a backtest, or the real clock aligned to the
   * nearest minute when running live.
   *
   * @param strategyName - Strategy name used in the report heading and filename
   * @param path - Directory to write the file into; defaults to `"./dump/heatmap"`
   * @param columns - Column definitions for table formatting;
   *   defaults to `COLUMN_CONFIG.heat_columns`
   */
  public async dump(
    strategyName: StrategyName,
    path = "./dump/heatmap",
    columns: Columns[] = COLUMN_CONFIG.heat_columns
  ): Promise<void> {
    const markdown = await this.getReport(strategyName, columns);
    const timestamp = getContextTimestamp();
    const filename = CREATE_FILE_NAME_FN(strategyName, this.exchangeName, this.frameName, timestamp);
    await MarkdownWriter.writeData("heat", markdown, {
      path,
      file: filename,
      symbol: "",
      strategyName: "",
      signalId: "",
      exchangeName: this.exchangeName,
      frameName: this.frameName
    });
  }
}

/**
 * Portfolio Heatmap Markdown Service.
 *
 * Subscribes to signalEmitter and aggregates statistics across all symbols per strategy.
 * Provides portfolio-wide metrics and per-symbol breakdowns.
 *
 * Features:
 * - Real-time aggregation of closed signals
 * - Per-symbol statistics (Total PNL, Sharpe Ratio, Max Drawdown, Trades)
 * - Portfolio-wide aggregated metrics per strategy
 * - Markdown table report generation
 * - Safe math (handles NaN/Infinity gracefully)
 * - Strategy-based navigation using memoized storage
 *
 * @example
 * ```typescript
 * const service = new HeatMarkdownService();
 *
 * // Service automatically tracks all closed signals per strategy
 * const stats = await service.getData("my-strategy");
 * console.log(`Portfolio Total PNL: ${stats.portfolioTotalPnl}%`);
 *
 * // Generate and save report
 * await service.dump("my-strategy", "./reports");
 * ```
 */
export class HeatMarkdownService {
  /** Logger service for debug output */
  private readonly loggerService = inject<TLoggerService>(TYPES.loggerService);

  /**
   * Memoized function to get or create HeatmapStorage for exchange, frame and backtest mode.
   * Each exchangeName + frameName + backtest mode combination gets its own isolated heatmap storage instance.
   */
  private getStorage = memoize<(exchangeName: ExchangeName, frameName: FrameName, backtest: boolean) => HeatmapStorage>(
    ([exchangeName, frameName, backtest]) => CREATE_KEY_FN(exchangeName, frameName, backtest),
    (exchangeName, frameName, backtest) => new HeatmapStorage(exchangeName, frameName, backtest)
  );

  /**
   * Subscribes to signal emitter to receive tick events.
   * Protected against multiple subscriptions.
   * Returns an unsubscribe function to stop receiving events.
   *
   * @example
   * ```typescript
   * const service = new HeatMarkdownService();
   * const unsubscribe = service.subscribe();
   * // ... later
   * unsubscribe();
   * ```
   */
  public subscribe = singleshot(() => {
    this.loggerService.log("heatMarkdownService init");
    const unsubscribe = signalEmitter.subscribe(this.tick);
    return () => {
      this.subscribe.clear();
      this.clear();
      unsubscribe();
    }
  });

  /**
   * Unsubscribes from signal emitter to stop receiving tick events.
   * Calls the unsubscribe function returned by subscribe().
   * If not subscribed, does nothing.
   *
   * @example
   * ```typescript
   * const service = new HeatMarkdownService();
   * service.subscribe();
   * // ... later
   * service.unsubscribe();
   * ```
   */
  public unsubscribe = async () => {
    this.loggerService.log("heatMarkdownService unsubscribe");
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };

  /**
   * Handles a single tick event emitted by `signalEmitter`.
   *
   * Filters out every action except `"closed"` — idle, scheduled, waiting,
   * opened, active, and cancelled ticks are silently ignored.
   * For closed signals, routes the payload to the appropriate `HeatmapStorage`
   * via `getStorage(exchangeName, frameName, backtest)` and calls `addSignal`.
   *
   * @param data - Union tick result from `signalEmitter`; only
   *   `IStrategyTickResultClosed` payloads are processed
   */
  private tick = async (data: IStrategyTickResult) => {
    this.loggerService.log("heatMarkdownService tick", {
      data,
    });

    if (data.action !== "closed") {
      return;
    }

    const storage = this.getStorage(data.exchangeName, data.frameName, data.backtest);
    storage.addSignal(data);
  };

  /**
   * Returns aggregated portfolio heatmap statistics for the given context.
   *
   * Delegates to the `HeatmapStorage` instance identified by
   * `(exchangeName, frameName, backtest)`. If no signals have been accumulated
   * yet for that combination, the returned `symbols` array will be empty and
   * portfolio-level fields will be `null` / `0`.
   *
   * @param exchangeName - Exchange identifier (e.g. `"binance"`)
   * @param frameName - Backtest frame identifier (e.g. `"1m-btc"`)
   * @param backtest - `true` for backtest mode, `false` for live mode
   * @returns Promise resolving to `HeatmapStatisticsModel` with per-symbol rows
   *   sorted by `sharpeRatio` descending and portfolio-wide aggregates
   * @throws {Error} If `subscribe()` has not been called before this method
   *
   * @example
   * ```typescript
   * const service = new HeatMarkdownService();
   * const stats = await service.getData("binance", "frame1", true);
   *
   * console.log(`Total symbols: ${stats.totalSymbols}`);
   * console.log(`Portfolio PNL: ${stats.portfolioTotalPnl}%`);
   *
   * stats.symbols.forEach(row => {
   *   console.log(`${row.symbol}: ${row.totalPnl}% (${row.totalTrades} trades)`);
   * });
   * ```
   */
  public getData = async (
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean
  ): Promise<HeatmapStatisticsModel> => {
    this.loggerService.log(HEATMAP_METHOD_NAME_GET_DATA, {
      exchangeName,
      frameName,
      backtest,
    });
    if (!this.subscribe.hasValue()) {
      throw new Error("HeatMarkdownService not initialized. Call subscribe() before getting data.");
    }
    const storage = this.getStorage(exchangeName, frameName, backtest);
    return storage.getData();
  };

  /**
   * Generates a markdown heatmap report for the given context.
   *
   * Delegates to `HeatmapStorage.getReport`. The resulting string includes a
   * portfolio summary line followed by a markdown table with one row per
   * symbol, ordered by `sharpeRatio` descending.
   *
   * @param strategyName - Strategy name rendered in the report heading
   * @param exchangeName - Exchange identifier (e.g. `"binance"`)
   * @param frameName - Backtest frame identifier (e.g. `"1m-btc"`)
   * @param backtest - `true` for backtest mode, `false` for live mode
   * @param columns - Column definitions controlling the table layout;
   *   defaults to `COLUMN_CONFIG.heat_columns`
   * @returns Promise resolving to the full markdown string
   * @throws {Error} If `subscribe()` has not been called before this method
   *
   * @example
   * ```typescript
   * const service = new HeatMarkdownService();
   * const markdown = await service.getReport("my-strategy", "binance", "frame1", true);
   * console.log(markdown);
   * // # Portfolio Heatmap: my-strategy
   * //
   * // **Total Symbols:** 5 | **Portfolio PNL:** +45.3% | **Pooled Sharpe:** 1.85 | **Total Trades:** 120
   * //
   * // | Symbol | Total PNL | Sharpe | Max DD | Trades |
   * // | ---    | ---       | ---    | ---    | ---    |
   * // | BTCUSDT | +15.5%  | 2.10   | -2.5%  | 45     |
   * // | ETHUSDT | +12.3%  | 1.85   | -3.1%  | 38     |
   * ```
   */
  public getReport = async (
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
    columns: Columns[] = COLUMN_CONFIG.heat_columns
  ): Promise<string> => {
    this.loggerService.log(HEATMAP_METHOD_NAME_GET_REPORT, {
      strategyName,
      exchangeName,
      frameName,
      backtest,
    });
    if (!this.subscribe.hasValue()) {
      throw new Error("HeatMarkdownService not initialized. Call subscribe() before generating reports.");
    }
    const storage = this.getStorage(exchangeName, frameName, backtest);
    return storage.getReport(strategyName, columns);
  };

  /**
   * Generates the heatmap report and writes it to disk.
   *
   * Delegates to `HeatmapStorage.dump`. The filename follows the pattern:
   * - Backtest: `{strategyName}_{exchangeName}_{frameName}_backtest-{timestamp}.md`
   * - Live:     `{strategyName}_{exchangeName}_live-{timestamp}.md`
   *
   * @param strategyName - Strategy name used in the report heading and filename
   * @param exchangeName - Exchange identifier (e.g. `"binance"`)
   * @param frameName - Backtest frame identifier (e.g. `"1m-btc"`)
   * @param backtest - `true` for backtest mode, `false` for live mode
   * @param path - Directory to write the file into; defaults to `"./dump/heatmap"`
   * @param columns - Column definitions for table formatting;
   *   defaults to `COLUMN_CONFIG.heat_columns`
   * @throws {Error} If `subscribe()` has not been called before this method
   *
   * @example
   * ```typescript
   * const service = new HeatMarkdownService();
   *
   * // Save to default path
   * await service.dump("my-strategy", "binance", "frame1", true);
   *
   * // Save to custom path
   * await service.dump("my-strategy", "binance", "frame1", true, "./reports");
   * ```
   */
  public dump = async (
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
    path = "./dump/heatmap",
    columns: Columns[] = COLUMN_CONFIG.heat_columns
  ): Promise<void> => {
    this.loggerService.log(HEATMAP_METHOD_NAME_DUMP, {
      strategyName,
      exchangeName,
      frameName,
      backtest,
      path,
    });
    if (!this.subscribe.hasValue()) {
      throw new Error("HeatMarkdownService not initialized. Call subscribe() before dumping reports.");
    }
    const storage = this.getStorage(exchangeName, frameName, backtest);
    await storage.dump(strategyName, path, columns);
  };

  /**
   * Evicts memoized `HeatmapStorage` instances, releasing all accumulated signal data.
   *
   * - With `payload` — clears only the storage bucket identified by
   *   `(payload.exchangeName, payload.frameName, payload.backtest)`;
   *   subsequent calls to `getData` / `getReport` / `dump` for that combination
   *   will start from an empty state.
   * - Without `payload` — clears **all** storage buckets across every
   *   exchange / frame / mode combination.
   *
   * Also called internally by the unsubscribe closure returned from `subscribe()`.
   *
   * @param payload - Optional scope to restrict which bucket is cleared;
   *   omit to clear everything
   *
   * @example
   * ```typescript
   * // Clear one specific context
   * await service.clear({ exchangeName: "binance", frameName: "frame1", backtest: true });
   *
   * // Clear all contexts
   * await service.clear();
   * ```
   */
  public clear = async (payload?: { exchangeName: ExchangeName; frameName: FrameName; backtest: boolean }) => {
    this.loggerService.log(HEATMAP_METHOD_NAME_CLEAR, {
      payload,
    });
    if (payload) {
      const key = CREATE_KEY_FN(payload.exchangeName, payload.frameName, payload.backtest);
      this.getStorage.clear(key);
    } else {
      this.getStorage.clear();
    }
  };

}

export default HeatMarkdownService;

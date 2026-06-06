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
    //
    // MARK-TO-MARKET DD: each trade's worst intra-trade excursion (signal.maxDrawdown,
    // the `_fall` snapshot, ≤ 0) is applied as a trough BEFORE booking the realized close.
    // Without it the curve only steps at close, so a trade that dipped to -18% and
    // recovered to +2% would register zero drawdown — understating DD and inflating
    // Calmar/Recovery.
    let maxDrawdown: number | null = null;
    let equityFinal = 1;
    let blown = false;
    if (signals.length > 0) {
      let equity = 1;
      let peak = 1;
      let maxDD = 0;
      for (let i = signals.length - 1; i >= 0; i--) {
        const fallPct = signals[i].signal.maxDrawdown?.pnlPercentage;
        if (typeof fallPct === "number" && fallPct < 0) {
          const trough = equity * (1 + fallPct / 100);
          if (trough <= 0) {
            maxDD = 100;
            blown = true;
            break;
          }
          const troughDd = (peak - trough) / peak * 100;
          if (troughDd > maxDD) maxDD = troughDd;
        }
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

    // Calculate Win/Loss Streaks AND per-streak pnl sums.
    // A streak is a run of same-signed trades; break-even (pnl=0) ends both runs.
    // The sign sequence is invariant under reversal, so iterating signals (newest
    // first) gives the same streak boundaries as chronological order.
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let currentWinStreak = 0;
    let currentLossStreak = 0;
    let currentWinStreakSum = 0;
    let currentLossStreakSum = 0;
    const winStreakSums: number[] = [];
    const lossStreakSums: number[] = [];

    for (const signal of signals) {
      const pnl = signal.pnl.pnlPercentage;
      if (pnl > 0) {
        if (currentLossStreak > 0) {
          lossStreakSums.push(currentLossStreakSum);
          currentLossStreak = 0;
          currentLossStreakSum = 0;
        }
        currentWinStreak++;
        currentWinStreakSum += pnl;
        if (currentWinStreak > maxWinStreak) {
          maxWinStreak = currentWinStreak;
        }
      } else if (pnl < 0) {
        if (currentWinStreak > 0) {
          winStreakSums.push(currentWinStreakSum);
          currentWinStreak = 0;
          currentWinStreakSum = 0;
        }
        currentLossStreak++;
        currentLossStreakSum += pnl;
        if (currentLossStreak > maxLossStreak) {
          maxLossStreak = currentLossStreak;
        }
      } else {
        // Break-even closes both runs (it's neither a win nor a loss).
        if (currentWinStreak > 0) {
          winStreakSums.push(currentWinStreakSum);
          currentWinStreak = 0;
          currentWinStreakSum = 0;
        }
        if (currentLossStreak > 0) {
          lossStreakSums.push(currentLossStreakSum);
          currentLossStreak = 0;
          currentLossStreakSum = 0;
        }
      }
    }
    // Flush trailing streak.
    if (currentWinStreak > 0) winStreakSums.push(currentWinStreakSum);
    if (currentLossStreak > 0) lossStreakSums.push(currentLossStreakSum);

    let avgConsecutiveWinPnl: number | null = winStreakSums.length > 0
      ? winStreakSums.reduce((a, b) => a + b, 0) / winStreakSums.length
      : null;
    let avgConsecutiveLossPnl: number | null = lossStreakSums.length > 0
      ? lossStreakSums.reduce((a, b) => a + b, 0) / lossStreakSums.length
      : null;

    // Trade duration metrics. Source: closeTimestamp - signal.pendingAt, in minutes
    // (synchronized with strategy `minuteEstimatedTime`). A signal missing either
    // timestamp is excluded from the corresponding average — silent zeros would
    // otherwise pull the mean towards zero.
    let avgDuration: number | null = null;
    let avgWinDuration: number | null = null;
    let avgLossDuration: number | null = null;
    {
      const durations: number[] = [];
      const winDurations: number[] = [];
      const lossDurations: number[] = [];
      for (const s of signals) {
        const pendingAt = s.signal.pendingAt;
        const closeTs = s.closeTimestamp;
        if (typeof pendingAt !== "number" || pendingAt <= 0) continue;
        if (typeof closeTs !== "number" || closeTs <= 0) continue;
        const minutes = (closeTs - pendingAt) / 60_000;
        durations.push(minutes);
        const pnl = s.pnl.pnlPercentage;
        if (pnl > 0) winDurations.push(minutes);
        else if (pnl < 0) lossDurations.push(minutes);
      }
      if (durations.length > 0) {
        avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      }
      if (winDurations.length > 0) {
        avgWinDuration = winDurations.reduce((a, b) => a + b, 0) / winDurations.length;
      }
      if (lossDurations.length > 0) {
        avgLossDuration = lossDurations.reduce((a, b) => a + b, 0) / lossDurations.length;
      }
    }

    // Median pnlPercentage — robust to outliers. Sort a copy (do not mutate signals).
    let medianPnl: number | null = null;
    if (signals.length > 0) {
      const sorted = signals.map((s) => s.pnl.pnlPercentage).sort((a, b) => a - b);
      const mid = sorted.length >> 1;
      medianPnl = sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
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
    // Extremes (peakProfitPnl / maxDrawdownPnl) are the best/worst observation
    // across all trades, surfacing tail behaviour the average hides.
    let avgPeakPnl: number | null = null;
    let avgFallPnl: number | null = null;
    let peakProfitPnl: number | null = null;
    let maxDrawdownPnl: number | null = null;
    if (signals.length > 0) {
      const peakValues = signals
        .map((s) => s.signal.peakProfit?.pnlPercentage)
        .filter((v): v is number => typeof v === "number");
      const fallValues = signals
        .map((s) => s.signal.maxDrawdown?.pnlPercentage)
        .filter((v): v is number => typeof v === "number");
      if (peakValues.length > 0) {
        avgPeakPnl = peakValues.reduce((sum, v) => sum + v, 0) / peakValues.length;
        peakProfitPnl = Math.max(...peakValues);
      }
      if (fallValues.length > 0) {
        avgFallPnl = fallValues.reduce((sum, v) => sum + v, 0) / fallValues.length;
        maxDrawdownPnl = Math.min(...fallValues);
      }
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

    // Annualized Sharpe — sharpeRatio × √tradesPerYear. Both inputs already
    // carry their own gates (sharpeRatio: N>=MIN_SIGNALS_FOR_RATIOS + STDDEV_EPSILON;
    // tradesPerYear: N>=MIN_SIGNALS_FOR_ANNUALIZATION + span>=MIN_CALENDAR_SPAN_DAYS
    // + raw frequency under MAX_TRADES_PER_YEAR), so we just propagate nulls.
    let annualizedSharpeRatio: number | null = null;
    if (sharpeRatio !== null && tradesPerYear !== null && tradesPerYear > 0) {
      annualizedSharpeRatio = sharpeRatio * Math.sqrt(tradesPerYear);
    }

    // Certainty Ratio = avgWin / |avgLoss|. Same gating shape as Backtest/Live:
    // N >= MIN_SIGNALS_FOR_RATIOS, AND |avgLoss| above STDDEV_EPSILON (float-artifact
    // losses near zero would otherwise produce spurious astronomical values).
    let certaintyRatio: number | null = null;
    if (
      canComputeRatios &&
      avgWin !== null &&
      avgLoss !== null &&
      avgLoss < 0 &&
      Math.abs(avgLoss) > STDDEV_EPSILON
    ) {
      certaintyRatio = avgWin / Math.abs(avgLoss);
    }

    // Apply safe math checks
    if (isUnsafe(winRate)) winRate = null;
    if (isUnsafe(totalPnl)) totalPnl = null;
    if (isUnsafe(avgPnl)) avgPnl = null;
    if (isUnsafe(stdDev)) stdDev = null;
    if (isUnsafe(sharpeRatio)) sharpeRatio = null;
    if (isUnsafe(annualizedSharpeRatio)) annualizedSharpeRatio = null;
    if (isUnsafe(certaintyRatio)) certaintyRatio = null;
    if (isUnsafe(expectedYearlyReturns)) expectedYearlyReturns = null;
    if (isUnsafe(tradesPerYear)) tradesPerYear = null;
    if (isUnsafe(maxDrawdown)) maxDrawdown = null;
    if (isUnsafe(profitFactor)) profitFactor = null;
    if (isUnsafe(avgWin)) avgWin = null;
    if (isUnsafe(avgLoss)) avgLoss = null;
    if (isUnsafe(expectancy)) expectancy = null;
    if (isUnsafe(avgPeakPnl)) avgPeakPnl = null;
    if (isUnsafe(avgFallPnl)) avgFallPnl = null;
    if (isUnsafe(peakProfitPnl)) peakProfitPnl = null;
    if (isUnsafe(maxDrawdownPnl)) maxDrawdownPnl = null;
    if (isUnsafe(avgDuration)) avgDuration = null;
    if (isUnsafe(medianPnl)) medianPnl = null;
    if (isUnsafe(avgConsecutiveWinPnl)) avgConsecutiveWinPnl = null;
    if (isUnsafe(avgConsecutiveLossPnl)) avgConsecutiveLossPnl = null;
    if (isUnsafe(avgWinDuration)) avgWinDuration = null;
    if (isUnsafe(avgLossDuration)) avgLossDuration = null;
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
      peakProfitPnl,
      maxDrawdownPnl,
      avgDuration,
      medianPnl,
      avgConsecutiveWinPnl,
      avgConsecutiveLossPnl,
      avgWinDuration,
      avgLossDuration,
      sortinoRatio,
      calmarRatio,
      recoveryFactor,
      annualizedSharpeRatio,
      certaintyRatio,
      expectedYearlyReturns,
      tradesPerYear,
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
    let portfolioAnnualizedSharpeRatio: number | null = null;
    let portfolioCertaintyRatio: number | null = null;
    let portfolioExpectedYearlyReturns: number | null = null;
    let portfolioTradesPerYear: number | null = null;
    // Collect every closed signal into a single chronological sequence ordered
    // by closeTimestamp. The pooled equity curve must follow real-time order:
    // a deep round-trip drawdown on a late trade should hit equity AT its
    // actual peak, not at whatever peak storage-iteration order happens to
    // expose. Using Map.values() iteration produced a peak determined by
    // symbol-add-order × per-symbol newest-first, silently understating MTM
    // drawdown by 30-60% on multi-symbol portfolios.
    type PooledTrade = { r: number; fall: number | null; closeAt: number };
    const pooledTrades: PooledTrade[] = [];
    let poolFirstPendingAt = Infinity;
    let poolLastCloseAt = -Infinity;
    for (const signals of this.symbolData.values()) {
      for (const s of signals) {
        const fall = s.signal.maxDrawdown?.pnlPercentage;
        pooledTrades.push({
          r: s.pnl.pnlPercentage,
          fall: typeof fall === "number" ? fall : null,
          closeAt: s.closeTimestamp,
        });
        if (s.signal.pendingAt < poolFirstPendingAt) poolFirstPendingAt = s.signal.pendingAt;
        if (s.closeTimestamp > poolLastCloseAt) poolLastCloseAt = s.closeTimestamp;
      }
    }
    pooledTrades.sort((a, b) => a.closeAt - b.closeAt);
    const allReturns: number[] = pooledTrades.map((t) => t.r);
    // Parallel array of intra-trade troughs (≤ 0), aligned 1:1 with allReturns,
    // used for mark-to-market DD in the pooled equity curve below.
    const allFalls: (number | null)[] = pooledTrades.map((t) => t.fall);
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

      // Pooled Certainty Ratio = pooledAvgWin / |pooledAvgLoss|. Same STDDEV_EPSILON
      // guard as per-symbol — protects against float-artifact losses producing
      // spuriously astronomical values.
      if (losses.length > 0 && Math.abs(avgLoss) > STDDEV_EPSILON && avgLoss < 0) {
        portfolioCertaintyRatio = avgWin / Math.abs(avgLoss);
      }

      // Pooled equity-curve max drawdown (compounded). MARK-TO-MARKET: each trade's
      // intra-trade trough (allFalls, ≤ 0) is applied before booking the realized close,
      // so deep round-trip dips are captured rather than understating DD.
      let equity = 1;
      let peak = 1;
      let maxDD = 0;
      let blown = false;
      for (let i = 0; i < allReturns.length; i++) {
        const fall = allFalls[i];
        if (fall !== null && fall < 0) {
          const trough = equity * (1 + fall / 100);
          if (trough <= 0) {
            maxDD = 100;
            blown = true;
            break;
          }
          const troughDd = ((peak - trough) / peak) * 100;
          if (troughDd > maxDD) maxDD = troughDd;
        }
        equity *= 1 + allReturns[i] / 100;
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

      // Pooled expected yearly returns — geometric annualization of the pooled
      // equity curve, gated exactly like the per-symbol path: requires a valid
      // calendar span (≥ MIN_CALENDAR_SPAN_DAYS) and a non-clustered trade
      // frequency (≤ MAX_TRADES_PER_YEAR). Above MAX_EXPECTED_YEARLY_RETURNS → null
      // (don't surface the cap as a real figure). This is the numerator for Calmar.
      const poolSpanDays =
        isFinite(poolFirstPendingAt) && isFinite(poolLastCloseAt)
          ? (poolLastCloseAt - poolFirstPendingAt) / (1000 * 60 * 60 * 24)
          : 0;
      if (poolSpanDays >= MIN_CALENDAR_SPAN_DAYS) {
        const rawTradesPerYear = (allReturns.length / poolSpanDays) * 365;
        if (rawTradesPerYear <= MAX_TRADES_PER_YEAR) {
          portfolioTradesPerYear = rawTradesPerYear;
          if (blown) {
            portfolioExpectedYearlyReturns = -100;
          } else {
            const raw = (Math.pow(equityFinal, rawTradesPerYear / allReturns.length) - 1) * 100;
            portfolioExpectedYearlyReturns =
              Math.abs(raw) > MAX_EXPECTED_YEARLY_RETURNS ? null : raw;
          }
        }
      }

      // Pooled Annualized Sharpe — pooledSharpe × √pooledTradesPerYear. Both
      // gates already enforced upstream; just propagate nulls.
      if (
        portfolioSharpeRatio !== null &&
        portfolioTradesPerYear !== null &&
        portfolioTradesPerYear > 0
      ) {
        portfolioAnnualizedSharpeRatio =
          portfolioSharpeRatio * Math.sqrt(portfolioTradesPerYear);
      }

      // Pooled Calmar = annualized return / max drawdown — same formula and
      // gating as per-symbol Calmar. NULL when the annualized numerator is
      // unavailable (span/frequency gate, or over the yearly cap). This is what
      // distinguishes it from Recovery, which uses the compounded TOTAL return —
      // previously both used total return, making Calmar == Recovery (a bug).
      if (maxDD > 0 && portfolioExpectedYearlyReturns !== null) {
        portfolioCalmarRatio = Math.max(
          -MAX_CALMAR_RATIO,
          Math.min(MAX_CALMAR_RATIO, portfolioExpectedYearlyReturns / maxDD),
        );
      }

      // Pooled Recovery Factor = compounded TOTAL return / max drawdown, clamped.
      // Time-independent (no annualization), so it needs no span gate — only a
      // valid DD and a non-blown account (ratio is meaningless after total loss).
      if (maxDD > 0 && !blown) {
        const rawRec = ((equityFinal - 1) * 100) / maxDD;
        portfolioRecoveryFactor = Math.max(
          -MAX_CALMAR_RATIO,
          Math.min(MAX_CALMAR_RATIO, rawRec),
        );
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

    // Portfolio-wide extremes: best best-case and worst worst-case across
    // every per-symbol extreme. Skips symbols whose extreme is null (no
    // peakProfit/maxDrawdown snapshots) — they cannot vote in either direction.
    let portfolioPeakProfitPnl: number | null = null;
    let portfolioMaxDrawdownPnl: number | null = null;
    const peakExtremes = symbols
      .map((s) => s.peakProfitPnl)
      .filter((v): v is number => typeof v === "number");
    const fallExtremes = symbols
      .map((s) => s.maxDrawdownPnl)
      .filter((v): v is number => typeof v === "number");
    if (peakExtremes.length > 0) {
      portfolioPeakProfitPnl = Math.max(...peakExtremes);
    }
    if (fallExtremes.length > 0) {
      portfolioMaxDrawdownPnl = Math.min(...fallExtremes);
    }

    // Portfolio duration metrics — pooled means over every trade with valid
    // timestamps, regardless of symbol. A signal missing pendingAt/closeTimestamp
    // is excluded from its average (the same rule as per-symbol).
    let portfolioAvgDuration: number | null = null;
    let portfolioAvgWinDuration: number | null = null;
    let portfolioAvgLossDuration: number | null = null;
    {
      const durations: number[] = [];
      const winDurations: number[] = [];
      const lossDurations: number[] = [];
      for (const signals of this.symbolData.values()) {
        for (const s of signals) {
          const pendingAt = s.signal.pendingAt;
          const closeTs = s.closeTimestamp;
          if (typeof pendingAt !== "number" || pendingAt <= 0) continue;
          if (typeof closeTs !== "number" || closeTs <= 0) continue;
          const minutes = (closeTs - pendingAt) / 60_000;
          durations.push(minutes);
          const pnl = s.pnl.pnlPercentage;
          if (pnl > 0) winDurations.push(minutes);
          else if (pnl < 0) lossDurations.push(minutes);
        }
      }
      if (durations.length > 0) {
        portfolioAvgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      }
      if (winDurations.length > 0) {
        portfolioAvgWinDuration = winDurations.reduce((a, b) => a + b, 0) / winDurations.length;
      }
      if (lossDurations.length > 0) {
        portfolioAvgLossDuration = lossDurations.reduce((a, b) => a + b, 0) / lossDurations.length;
      }
    }

    // Portfolio median — pooled over allReturns (already collected for the
    // Sharpe block). Robust to outliers like the per-symbol counterpart.
    let portfolioMedianPnl: number | null = null;
    if (allReturns.length > 0) {
      const sortedAll = allReturns.slice().sort((a, b) => a - b);
      const mid = sortedAll.length >> 1;
      portfolioMedianPnl = sortedAll.length % 2 === 0
        ? (sortedAll[mid - 1] + sortedAll[mid]) / 2
        : sortedAll[mid];
    }

    // Portfolio streak averages — trade-count-weighted mean of per-symbol
    // averages. Concatenating streaks across symbols would be wrong: trades on
    // different symbols are not "consecutive" in any meaningful sense (different
    // markets, different timeframes). Weighting by totalTrades matches the
    // weighting used for portfolioAvgPeakPnl / portfolioAvgFallPnl.
    let portfolioAvgConsecutiveWinPnl: number | null = null;
    let portfolioAvgConsecutiveLossPnl: number | null = null;
    const validWinStreak = symbols.filter((s) => s.avgConsecutiveWinPnl !== null);
    const validLossStreak = symbols.filter((s) => s.avgConsecutiveLossPnl !== null);
    const winStreakWeight = validWinStreak.reduce((acc, s) => acc + s.totalTrades, 0);
    const lossStreakWeight = validLossStreak.reduce((acc, s) => acc + s.totalTrades, 0);
    if (validWinStreak.length > 0 && winStreakWeight > 0) {
      portfolioAvgConsecutiveWinPnl =
        validWinStreak.reduce((acc, s) => acc + s.avgConsecutiveWinPnl! * s.totalTrades, 0) /
        winStreakWeight;
    }
    if (validLossStreak.length > 0 && lossStreakWeight > 0) {
      portfolioAvgConsecutiveLossPnl =
        validLossStreak.reduce((acc, s) => acc + s.avgConsecutiveLossPnl! * s.totalTrades, 0) /
        lossStreakWeight;
    }

    // Apply safe math
    if (isUnsafe(portfolioTotalPnl)) portfolioTotalPnl = null;
    if (isUnsafe(portfolioSharpeRatio)) portfolioSharpeRatio = null;
    if (isUnsafe(portfolioAvgPeakPnl)) portfolioAvgPeakPnl = null;
    if (isUnsafe(portfolioAvgFallPnl)) portfolioAvgFallPnl = null;
    if (isUnsafe(portfolioPeakProfitPnl)) portfolioPeakProfitPnl = null;
    if (isUnsafe(portfolioMaxDrawdownPnl)) portfolioMaxDrawdownPnl = null;
    if (isUnsafe(portfolioStdDev)) portfolioStdDev = null;
    if (isUnsafe(portfolioSortinoRatio)) portfolioSortinoRatio = null;
    if (isUnsafe(portfolioCalmarRatio)) portfolioCalmarRatio = null;
    if (isUnsafe(portfolioRecoveryFactor)) portfolioRecoveryFactor = null;
    if (isUnsafe(portfolioExpectancy)) portfolioExpectancy = null;
    if (isUnsafe(portfolioAvgDuration)) portfolioAvgDuration = null;
    if (isUnsafe(portfolioMedianPnl)) portfolioMedianPnl = null;
    if (isUnsafe(portfolioAvgConsecutiveWinPnl)) portfolioAvgConsecutiveWinPnl = null;
    if (isUnsafe(portfolioAvgConsecutiveLossPnl)) portfolioAvgConsecutiveLossPnl = null;
    if (isUnsafe(portfolioAvgWinDuration)) portfolioAvgWinDuration = null;
    if (isUnsafe(portfolioAvgLossDuration)) portfolioAvgLossDuration = null;
    if (isUnsafe(portfolioAnnualizedSharpeRatio)) portfolioAnnualizedSharpeRatio = null;
    if (isUnsafe(portfolioCertaintyRatio)) portfolioCertaintyRatio = null;
    if (isUnsafe(portfolioExpectedYearlyReturns)) portfolioExpectedYearlyReturns = null;
    if (isUnsafe(portfolioTradesPerYear)) portfolioTradesPerYear = null;

    return {
      symbols,
      totalSymbols,
      portfolioTotalPnl,
      portfolioSharpeRatio,
      portfolioTotalTrades,
      portfolioAvgPeakPnl,
      portfolioAvgFallPnl,
      portfolioPeakProfitPnl,
      portfolioMaxDrawdownPnl,
      portfolioStdDev,
      portfolioSortinoRatio,
      portfolioCalmarRatio,
      portfolioRecoveryFactor,
      portfolioExpectancy,
      portfolioAvgDuration,
      portfolioMedianPnl,
      portfolioAvgConsecutiveWinPnl,
      portfolioAvgConsecutiveLossPnl,
      portfolioAvgWinDuration,
      portfolioAvgLossDuration,
      portfolioAnnualizedSharpeRatio,
      portfolioCertaintyRatio,
      portfolioExpectedYearlyReturns,
      portfolioTradesPerYear,
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
      `**Total Symbols:** ${data.totalSymbols}`,
      `**Portfolio PNL:** ${data.portfolioTotalPnl !== null ? str(data.portfolioTotalPnl, "%") : "N/A"}`,
      `**Pooled Sharpe:** ${data.portfolioSharpeRatio !== null ? str(data.portfolioSharpeRatio) : "N/A"}`,
      `**Annualized Sharpe:** ${data.portfolioAnnualizedSharpeRatio !== null ? str(data.portfolioAnnualizedSharpeRatio) : "N/A"}`,
      `**Certainty Ratio:** ${data.portfolioCertaintyRatio !== null ? str(data.portfolioCertaintyRatio) : "N/A"}`,
      `**Expected Yearly Returns:** ${data.portfolioExpectedYearlyReturns !== null ? str(data.portfolioExpectedYearlyReturns, "%") : "N/A"}`,
      `**Trades Per Year:** ${data.portfolioTradesPerYear !== null ? data.portfolioTradesPerYear.toFixed(1) : "N/A"}`,
      `**Total Trades:** ${data.portfolioTotalTrades}`,
      `**Avg Peak PNL:** ${data.portfolioAvgPeakPnl !== null ? str(data.portfolioAvgPeakPnl, "%") : "N/A"}`,
      `**Avg Max Drawdown PNL:** ${data.portfolioAvgFallPnl !== null ? str(data.portfolioAvgFallPnl, "%") : "N/A"}`,
      `**Peak Profit PNL:** ${data.portfolioPeakProfitPnl !== null ? str(data.portfolioPeakProfitPnl, "%") : "N/A"}`,
      `**Max Drawdown PNL:** ${data.portfolioMaxDrawdownPnl !== null ? str(data.portfolioMaxDrawdownPnl, "%") : "N/A"}`,
      `**Median PNL:** ${data.portfolioMedianPnl !== null ? str(data.portfolioMedianPnl, "%") : "N/A"}`,
      `**Avg Duration:** ${data.portfolioAvgDuration !== null ? `${data.portfolioAvgDuration.toFixed(1)} min` : "N/A"}`,
      `**Avg Win Duration:** ${data.portfolioAvgWinDuration !== null ? `${data.portfolioAvgWinDuration.toFixed(1)} min` : "N/A"}`,
      `**Avg Loss Duration:** ${data.portfolioAvgLossDuration !== null ? `${data.portfolioAvgLossDuration.toFixed(1)} min` : "N/A"}`,
      `**Avg Consecutive Win PNL:** ${data.portfolioAvgConsecutiveWinPnl !== null ? str(data.portfolioAvgConsecutiveWinPnl, "%") : "N/A"}`,
      `**Avg Consecutive Loss PNL:** ${data.portfolioAvgConsecutiveLossPnl !== null ? str(data.portfolioAvgConsecutiveLossPnl, "%") : "N/A"}`,
      `**Standard Deviation Per Trade:** ${data.portfolioStdDev !== null ? str(data.portfolioStdDev, "%") : "N/A"}`,
      `**Sortino Ratio:** ${data.portfolioSortinoRatio !== null ? str(data.portfolioSortinoRatio) : "N/A"}`,
      `**Calmar Ratio:** ${data.portfolioCalmarRatio !== null ? str(data.portfolioCalmarRatio) : "N/A"}`,
      `**Recovery Factor:** ${data.portfolioRecoveryFactor !== null ? str(data.portfolioRecoveryFactor) : "N/A"}`,
      `**Expectancy:** ${data.portfolioExpectancy !== null ? str(data.portfolioExpectancy, "%") : "N/A"}`,
      "",
      table,
      "",
      `*Win Rate: reliable above 200+ signals; below 30 signals a single streak can shift it by 10-20%.*`,
      `*Pooled Sharpe: Sharpe computed over all trades across symbols treated as one sample. NOT a Markowitz portfolio Sharpe — ignores cross-symbol correlations and capital allocation. N/A unless ≥${MIN_SIGNALS_FOR_RATIOS} pooled trades.*`,
      `*Annualized Sharpe: per-trade Sharpe × √tradesPerYear. N/A unless the underlying Sharpe and tradesPerYear are both available (≥${MIN_SIGNALS_FOR_ANNUALIZATION} signals, span ≥${MIN_CALENDAR_SPAN_DAYS} days, raw frequency ≤${MAX_TRADES_PER_YEAR}). Assumes returns are iid — autocorrelated strategies are overstated.*`,
      `*Certainty Ratio: avgWin / |avgLoss|. Below 1.0 means average loss exceeds average win. Above 1.5 is considered good. N/A when no losing trades or |avgLoss| is sub-epsilon.*`,
      `*Expected Yearly Returns: compounded geometric return from the equity curve, annualized by tradesPerYear. Same gating as Annualized Sharpe. Capped at ±${MAX_EXPECTED_YEARLY_RETURNS}% — values above the cap return N/A.*`,
      `*Trades Per Year: observed trade frequency extrapolated to one year (signals × 365 / calendarSpanDays). N/A when too few signals or too short a calendar span; also null when the raw frequency exceeds ${MAX_TRADES_PER_YEAR} (too clustered for reliable annualization).*`,
      `*Sharpe Ratio: below 1.0 is poor, 1.0-2.0 is acceptable, above 2.0 is strong. Requires 30+ signals per symbol.*`,
      `*Sortino Ratio: below 1.0 is poor, 1.0-2.0 is acceptable, above 2.0 is strong. Requires 30+ signals. N/A when no losing trades — Sortino is mathematically undefined (infinite) and we cannot distinguish "truly flawless" from "lucky streak so far".*`,
      `*Profit Factor: below 1.0 means strategy is losing overall. Above 1.5 is considered good.*`,
      `*Calmar Ratio: below 0.5 is poor, 0.5-1.0 is acceptable, above 1.0 is strong. Denominator is the mark-to-market max drawdown (see below). N/A unless ≥${MIN_SIGNALS_FOR_ANNUALIZATION} signals per symbol and span ≥${MIN_CALENDAR_SPAN_DAYS} days. Capped at ±${MAX_CALMAR_RATIO}.*`,
      `*Recovery Factor: below 1.0 means total profit does not cover max drawdown. Above 3.0 is considered good. Uses compounded total return as numerator and the mark-to-market max drawdown as denominator.*`,
      `*Expectancy: per-trade expected value (winProb × avgWin + lossProb × avgLoss). Positive = profitable on average per trade. Break-even trades contribute 0.*`,
      `*Median PNL: middle value of the pnl distribution. Robust to outliers; compare to Average PNL — a large gap signals a skewed distribution (e.g. one whale trade dragging the mean).*`,
      `*Avg Peak PNL / Avg Max Drawdown PNL: mean of per-trade _peak.pnlPercentage / _fall.pnlPercentage. Higher avg-peak with deeper avg-drawdown means strategy needs to tolerate bigger swings to capture the upside.*`,
      `*Peak Profit PNL / Max Drawdown PNL: extremes — the best best-case and worst worst-case observed across all trades. Tail behaviour the averages hide.*`,
      `*Avg Duration / Avg Win Duration / Avg Loss Duration: mean hold time in minutes (closeTimestamp - pendingAt). Winner-shorter-than-loser is a red flag ("cut winners short, let losers run").*`,
      `*Avg Consecutive Win/Loss PNL: average sum of pnlPercentage across consecutive streaks. Pairs with max streak length to show the typical (not worst-case) streak magnitude. Portfolio uses trade-count-weighted mean of per-symbol streak averages — concatenating streaks across symbols would be meaningless (different markets, different timeframes).*`,
      `*Max Drawdown: mark-to-market — both the per-symbol and pooled equity curves apply each trade's worst intra-trade excursion (the lowest unrealized point while the position was open) before booking its realized close, so deep round-trip dips count. It is NOT realized-only (close-to-close); a realized-only curve would understate drawdown and inflate Calmar/Recovery. The pooled curve walks trades chronologically by closeTimestamp; simultaneous cross-symbol drawdowns within the same minute are still serialised (one trade applied at a time), so genuine same-instant tail correlation is not modelled.*`,
      `*All metrics require 100+ signals per symbol to be statistically reliable. Annualized metrics assume the observed trading frequency persists year-round.*`,
      `*IMPORTANT: Per-symbol equity curve, Expected Yearly Returns, Calmar, Recovery and Max Drawdown all assume **100% capital allocation per position** (no portfolio fraction). These metrics ignore the position-sizing subsystem (PositionSize / Kelly / ATR): pnlPercentage is a return on the position's own invested capital, never scaled by account balance. With DCA (commitAverageBuy) the cost basis is the sum of all entries and the entry price is dollar-cost-weighted, so per-trade % is measured against the averaged position, not a fixed stake. If your strategy risks X% of capital per trade, the realized return / drawdown will be roughly X/100 of the reported figures — these metrics represent a theoretical upper bound under full allocation.*`,
      `*Negative values for Sharpe / Annualized Sharpe / Sortino / Calmar / Recovery / Expectancy / Expected Yearly Returns indicate a losing symbol (avgPnl < 0 or totalPnl < 0). "Higher is better" still applies — closer to zero is less bad, positive is profitable.*`,
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

import {
  IStorageSignalRow,
  IStrategyTickResult,
  IStrategyTickResultClosed,
  StrategyName,
} from "../../../interfaces/Strategy.interface";
import { StorageBacktest, StorageLive } from "../../../classes/Storage";
import { inject } from "../../../lib/core/di";
import LoggerService, { TLoggerService } from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { memoize, singleshot } from "functools-kit";
import { signalBacktestEmitter } from "../../../config/emitters";
import { BacktestStatisticsModel } from "../../../model/BacktestStatistics.model";
import { ColumnModel } from "../../../model/Column.model";
import { COLUMN_CONFIG } from "../../../config/columns";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";
import { MarkdownWriter } from "../../../classes/Writer";
import { getContextTimestamp } from "../../../helpers/getContextTimestamp";
import { GLOBAL_CONFIG } from "../../../config/params";
import { getPriceProfile } from "../../../helpers/getPriceProfile";

/**
 * Type alias for column configuration used in backtest markdown reports.
 * 
 * Represents a column model specifically designed to format and display
 * closed backtest signals in markdown tables.
 * 
 * @typeParam IStrategyTickResultClosed - The closed signal data type containing
 *   PNL information, close reason, timestamps, and other trade details
 * 
 * @example
 * ```typescript
 * // Column to display signal ID
 * const signalIdColumn: Columns = {
 *   key: "signalId",
 *   label: "Signal ID",
 *   format: (signal) => signal.signal.id,
 *   isVisible: () => true
 * };
 * 
 * // Column to display PNL percentage
 * const pnlColumn: Columns = {
 *   key: "pnl",
 *   label: "PNL %",
 *   format: (signal) => `${signal.pnl.pnlPercentage.toFixed(2)}%`,
 *   isVisible: () => true
 * };
 * ```
 * 
 * @see ColumnModel for the base interface
 * @see IStrategyTickResultClosed for the signal data structure
 */
export type Columns = ColumnModel<IStrategyTickResultClosed>;

/**
 * Creates a unique key for memoizing ReportStorage instances.
 * Key format: "symbol:strategyName:exchangeName:frameName:backtest" or "symbol:strategyName:exchangeName:live"
 * @param symbol - Trading pair symbol
 * @param strategyName - Name of the strategy
 * @param exchangeName - Exchange name
 * @param frameName - Frame name
 * @param backtest - Whether running in backtest mode
 * @returns Unique string key for memoization
 */
const CREATE_KEY_FN = (
  symbol: string,
  strategyName: StrategyName,
  exchangeName: ExchangeName,
  frameName: FrameName,
  backtest: boolean
): string => {
  const parts = [symbol, strategyName, exchangeName];
  if (frameName) parts.push(frameName);
  parts.push(backtest ? "backtest" : "live");
  return parts.join(":");
};

/**
 * Creates a filename for markdown report based on memoization key components.
 * Filename format: "symbol_strategyName_exchangeName_frameName-timestamp.md"
 * @param symbol - Trading pair symbol
 * @param strategyName - Name of the strategy
 * @param exchangeName - Exchange name
 * @param frameName - Frame name
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Filename string
 */
const CREATE_FILE_NAME_FN = (
  symbol: string,
  strategyName: StrategyName,
  exchangeName: ExchangeName,
  frameName: FrameName,
  timestamp: number
): string => {
  const parts = [symbol, strategyName, exchangeName];
  if (frameName) { parts.push(frameName); parts.push("backtest"); }
  else parts.push("live");
  return `${parts.join("_")}-${timestamp}.md`;
};

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
/** Minimum stdDev required for Sharpe/Sortino computation. Identical-returns series produce
 *  float-artifact stdDev (~1e-17) that's mathematically > 0 but spuriously inflates
 *  sharpe to astronomical values. Treat any stdDev below this threshold as zero. */
const STDDEV_EPSILON = 1e-9;


/**
 * Maps a persisted closed storage row to the in-memory closed-tick shape used by
 * ReportStorage. The row already carries every IPublicSignalRow field (it extends
 * it), plus the closeReason/closeTimestamp/currentPrice mirrors persisted on close.
 *
 * @param row - Closed storage signal row read from disk
 * @param backtest - Which adapter the row came from (StorageBacktest -> true)
 * @returns Equivalent IStrategyTickResultClosed for statistics/reporting
 */
const STORAGE_ROW_TO_CLOSED_FN = (
  row: IStorageSignalRow & { status: "closed" },
  backtest: boolean
): IStrategyTickResultClosed => ({
  action: "closed",
  signal: row,
  currentPrice: row.currentPrice,
  closeReason: row.closeReason,
  closeTimestamp: row.closeTimestamp,
  pnl: row.pnl,
  strategyName: row.strategyName,
  exchangeName: row.exchangeName,
  frameName: row.frameName,
  symbol: row.symbol,
  backtest,
  createdAt: row.createdAt,
});

/**
 * Loads persisted closed signals from BOTH live and backtest storage adapters,
 * keeping only the rows matching the given report context.
 *
 * Uses the StorageLive / StorageBacktest singletons directly so the read bypasses
 * StorageAdapter.enable() — reports must work even when event capture is disabled.
 *
 * @param symbol - Trading pair symbol
 * @param strategyName - Strategy identifier
 * @param exchangeName - Exchange identifier
 * @param frameName - Frame identifier
 * @returns Closed tick results for this context, oldest first
 */
const LOAD_PERSISTED_CLOSED_FN = async (
  symbol: string,
  strategyName: StrategyName,
  exchangeName: ExchangeName,
  frameName: FrameName
): Promise<IStrategyTickResultClosed[]> => {
  const [liveRows, backtestRows] = await Promise.all([
    StorageLive.list(),
    StorageBacktest.list(),
  ]);
  const matches = (row: IStorageSignalRow): boolean =>
    row.status === "closed" &&
    row.symbol === symbol &&
    row.strategyName === strategyName &&
    row.exchangeName === exchangeName &&
    row.frameName === frameName;
  const result: IStrategyTickResultClosed[] = [];
  for (const row of liveRows) {
    if (matches(row)) result.push(STORAGE_ROW_TO_CLOSED_FN(row as IStorageSignalRow & { status: "closed" }, false));
  }
  for (const row of backtestRows) {
    if (matches(row)) result.push(STORAGE_ROW_TO_CLOSED_FN(row as IStorageSignalRow & { status: "closed" }, true));
  }
  // Oldest first so the newest-first _signalList stays chronologically consistent
  // once history is unshifted in.
  result.sort((a, b) => a.closeTimestamp - b.closeTimestamp);
  return result;
};

/**
 * Storage class for accumulating closed signals per strategy.
 * Maintains a list of all closed signals and provides methods to generate reports.
 */
class ReportStorage {
  /** Internal list of all closed signals for this strategy */
  private _signalList: IStrategyTickResultClosed[] = [];

  constructor(
    readonly symbol: string,
    readonly strategyName: StrategyName,
    readonly exchangeName: ExchangeName,
    readonly frameName: FrameName
  ) {}

  /**
   * Lazily loads persisted closed-signal history from disk (live + backtest
   * adapters) into _signalList on first access. Guarded by singleshot so it runs
   * exactly once; every read/write path (addSignal, getData, getReport, dump)
   * awaits it first, so accumulated tick data is layered on top of history rather
   * than racing it.
   */
  public waitForInit = singleshot(async () => {
    const persisted = await LOAD_PERSISTED_CLOSED_FN(
      this.symbol,
      this.strategyName,
      this.exchangeName,
      this.frameName
    );
    if (persisted.length === 0) {
      return;
    }
    const seen = new Set(this._signalList.map((s) => s.signal.id));
    // _signalList is newest-first (addSignal unshifts); append history to the tail
    // NEWEST-FIRST (reverse of the oldest-first load order) so the merged list stays
    // monotonically newest-first. Pushing in load order put an ascending segment into
    // a descending list — corrupting streak math (reverse-iteration assumes
    // chronology), inverting trim retention (newest history dropped instead of
    // oldest) and jumbling report row order.
    for (let i = persisted.length - 1; i >= 0; i--) {
      const closed = persisted[i];
      if (!seen.has(closed.signal.id)) {
        this._signalList.push(closed);
        seen.add(closed.signal.id);
      }
    }
    if (this._signalList.length > GLOBAL_CONFIG.CC_MAX_BACKTEST_MARKDOWN_ROWS) {
      this._signalList.length = GLOBAL_CONFIG.CC_MAX_BACKTEST_MARKDOWN_ROWS;
    }
  });

  /**
   * Adds a closed signal to the storage.
   *
   * @param data - Closed signal data with PNL and close reason
   */
  public addSignal(data: IStrategyTickResultClosed) {
    this._signalList.unshift(data);

    // Trim queue if exceeded GLOBAL_CONFIG.CC_MAX_BACKTEST_MARKDOWN_ROWS
    if (this._signalList.length > GLOBAL_CONFIG.CC_MAX_BACKTEST_MARKDOWN_ROWS) {
      this._signalList.pop();
    }
  }

  /**
   * Calculates statistical data from closed signals (Controller).
   * Returns null for any unsafe numeric values (NaN, Infinity, etc).
   *
   * @returns Statistical data (empty object if no signals)
   */
  public async getData(): Promise<BacktestStatisticsModel> {
    await this.waitForInit();
    if (this._signalList.length === 0) {
      return {
        signalList: [],
        totalSignals: 0,
        winCount: 0,
        lossCount: 0,
        winRate: null,
        avgPnl: null,
        totalPnl: null,
        stdDev: null,
        sharpeRatio: null,
        annualizedSharpeRatio: null,
        certaintyRatio: null,
        expectedYearlyReturns: null,
        avgPeakPnl: null,
        avgFallPnl: null,
        sortinoRatio: null,
        calmarRatio: null,
        recoveryFactor: null,
        expectancy: null,
        avgDuration: null,
        medianPnl: null,
        avgConsecutiveWinPnl: null,
        avgConsecutiveLossPnl: null,
        avgWinDuration: null,
        avgLossDuration: null,
        medianStepSize: null,
        buyerPressure: null,
        sellerPressure: null,
        buyerStrength: null,
        sellerStrength: null,
        pressureImbalance: null,
        trend: null,
        trendStrength: null,
        trendConfidence: null,
      };
    }

    // Valid signal set — those with usable pendingAt AND closeTimestamp. Single source
    // of truth for EVERY metric in this method (counts, sums, span, equity curve,
    // ratios, annualization). If we used different subsets for different metrics, the
    // numerator of one ratio could be drawn from a different population than the
    // denominator of another and the report would silently lie. On clean data
    // validSignals === this._signalList; the filter only matters for corrupted runtime
    // data.
    const validSignals = this._signalList.filter(
      (s) =>
        typeof s.signal.pendingAt === "number" && s.signal.pendingAt > 0 &&
        typeof s.closeTimestamp === "number" && s.closeTimestamp > 0
    );
    const totalSignals = validSignals.length;

    // Every stored signal had corrupted timestamps — no valid population to compute
    // on. Report N/A (null) rather than 0%: a zero win rate / zero avgPnl would read
    // as a real (terrible) result instead of "no usable data". The raw signalList is
    // still returned so the table can render the rows.
    if (totalSignals === 0) {
      return {
        signalList: this._signalList,
        totalSignals: 0,
        winCount: 0,
        lossCount: 0,
        winRate: null,
        avgPnl: null,
        totalPnl: null,
        stdDev: null,
        sharpeRatio: null,
        annualizedSharpeRatio: null,
        certaintyRatio: null,
        expectedYearlyReturns: null,
        avgPeakPnl: null,
        avgFallPnl: null,
        sortinoRatio: null,
        calmarRatio: null,
        recoveryFactor: null,
        expectancy: null,
        avgDuration: null,
        medianPnl: null,
        avgConsecutiveWinPnl: null,
        avgConsecutiveLossPnl: null,
        avgWinDuration: null,
        avgLossDuration: null,
        medianStepSize: null,
        buyerPressure: null,
        sellerPressure: null,
        buyerStrength: null,
        sellerStrength: null,
        pressureImbalance: null,
        trend: null,
        trendStrength: null,
        trendConfidence: null,
      };
    }

    const winCount = validSignals.filter((s) => s.pnl.pnlPercentage > 0).length;
    const lossCount = validSignals.filter((s) => s.pnl.pnlPercentage < 0).length;

    // Basic statistics — guard against an empty validSignals (e.g. every signal had
    // corrupted timestamps) so we don't divide by zero.
    const avgPnl = totalSignals > 0
      ? validSignals.reduce((sum, s) => sum + s.pnl.pnlPercentage, 0) / totalSignals
      : 0;
    const totalPnl = validSignals.reduce((sum, s) => sum + s.pnl.pnlPercentage, 0);

    // Win rate excludes break-even trades from both numerator and denominator.
    const decisiveTrades = winCount + lossCount;
    const winRate = decisiveTrades > 0 ? (winCount / decisiveTrades) * 100 : 0;

    // Calendar span over the same validSignals set used for ratios.
    let firstPendingAt = Infinity;
    let lastCloseAt = -Infinity;
    for (const s of validSignals) {
      if (s.signal.pendingAt < firstPendingAt) firstPendingAt = s.signal.pendingAt;
      if (s.closeTimestamp > lastCloseAt) lastCloseAt = s.closeTimestamp;
    }
    const calendarSpanDays = isFinite(firstPendingAt) && isFinite(lastCloseAt)
      ? (lastCloseAt - firstPendingAt) / (1000 * 60 * 60 * 24)
      : 0;
    // tradesPerYear uses the RAW observed frequency — no clipping. Clipping would
    // silently understate Sharpe / Calmar / expectedYearlyReturns. Instead, if the
    // raw frequency exceeds MAX_TRADES_PER_YEAR we treat the sample as too clustered
    // for reliable annualization and surface every annualized metric as null.
    const rawTradesPerYear = totalSignals >= MIN_SIGNALS_FOR_ANNUALIZATION &&
      calendarSpanDays >= MIN_CALENDAR_SPAN_DAYS
      ? (totalSignals / calendarSpanDays) * 365
      : 0;
    const canAnnualize =
      rawTradesPerYear > 0 && rawTradesPerYear <= MAX_TRADES_PER_YEAR;
    const tradesPerYear = canAnnualize ? rawTradesPerYear : 0;

    // Per-trade Sharpe Ratio (risk-free rate = 0). Sample stddev (N-1) for unbiased estimate.
    // Per-trade ratios are gated by MIN_SIGNALS_FOR_RATIOS — below that, variance estimates
    // are too noisy to publish (high chance of spurious ±Sharpe). When the gate fails the
    // standard deviation itself is reported as null (NOT 0) so the report doesn't suggest
    // a flat distribution for a small but variable sample.
    const returns = validSignals.map((s) => s.pnl.pnlPercentage);
    const canComputeRatios = totalSignals >= MIN_SIGNALS_FOR_RATIOS;
    const stdDev: number | null = canComputeRatios
      ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgPnl, 2), 0) / (totalSignals - 1))
      : null;
    // Use STDDEV_EPSILON gate (not stdDev > 0) — identical-returns series produce
    // float-artifact stdDev (~1e-17) that's mathematically > 0 but spuriously
    // inflates sharpe to astronomical magnitudes (avgPnl / epsilon).
    const sharpeRatio: number | null =
      canComputeRatios && stdDev !== null && stdDev > STDDEV_EPSILON
        ? avgPnl / stdDev
        : null;
    // Annualize only when gate passes; otherwise null.
    const annualizedSharpeRatio: number | null = canAnnualize && sharpeRatio !== null
      ? sharpeRatio * Math.sqrt(tradesPerYear)
      : null;

    // Equity-curve max drawdown via compounded equity (multiplicative, not additive).
    // Returns are per-trade on cost basis — compounding assumes equal capital allocation
    // per trade ("as-if 100% allocation"). Walks validSignals in chronological order
    // (storage is newest-first, so iterate in reverse). Using validSignals (same set as
    // tradesPerYear) keeps equityFinal consistent with the annualization exponent.
    //
    // MARK-TO-MARKET DD: each trade's worst intra-trade excursion (signal.maxDrawdown,
    // i.e. the `_fall` snapshot, ≤ 0) is applied as a trough BEFORE booking the realized
    // close. Without this the curve only steps at close, so a trade that dipped to -18%
    // and recovered to +2% would register zero drawdown — understating DD and inflating
    // Calmar/Recovery. The trough does not persist into equity (it's a transient
    // mark-to-market low); equity then moves to the realized close.
    // If equity (at trough or close) goes ≤ 0 (e.g. leveraged loss < -100%) — account
    // blown, fix DD at 100% and stop walking the curve.
    // Walk the equity curve in chronological close order. Storage is
    // newest-first (unshift on addSignal); reverse-storage iteration normally
    // gives chronological order, but explicitly sorting by closeTimestamp
    // removes the dependency on insertion-order matching close-order (which
    // can break under crash recovery, signal backfill, or disk replays).
    const orderedSignals = [...validSignals].sort(
      (a, b) => a.closeTimestamp - b.closeTimestamp,
    );
    let equity = 1;
    let peak = 1;
    let equityMaxDrawdown = 0;
    let blown = false;
    for (const s of orderedSignals) {
      // Intra-trade trough — mark-to-market low while the position was open.
      const fallPct = s.signal.maxDrawdown?.pnlPercentage;
      if (typeof fallPct === "number" && fallPct < 0) {
        const trough = equity * (1 + fallPct / 100);
        if (trough <= 0) {
          equityMaxDrawdown = 100;
          blown = true;
          break;
        }
        const troughDd = (peak - trough) / peak * 100;
        if (troughDd > equityMaxDrawdown) equityMaxDrawdown = troughDd;
      }
      // Realized close — book the final per-trade result.
      equity *= 1 + s.pnl.pnlPercentage / 100;
      if (equity <= 0) {
        equityMaxDrawdown = 100;
        blown = true;
        break;
      }
      if (equity > peak) peak = equity;
      const dd = (peak - equity) / peak * 100;
      if (dd > equityMaxDrawdown) equityMaxDrawdown = dd;
    }
    const equityFinal = blown ? 0 : equity;

    // Compounded yearly return via geometric mean of equity curve.
    // equityFinal^(tradesPerYear / N) - 1 — accounts for volatility drag that
    // arithmetic-mean compounding ((1+avgPnl)^N) misses. If account is blown, full loss.
    // If the raw value would exceed MAX_EXPECTED_YEARLY_RETURNS, return null rather than
    // showing the cap as a real figure — capped numbers mislead users into trusting them.
    const expectedYearlyReturns: number | null = canAnnualize
      ? blown
        ? -100
        : (() => {
            // Geometric annualization uses validSignals.length (same set that defined
            // tradesPerYear); using totalSignals here would mismatch numerator/denominator.
            const raw = (Math.pow(equityFinal, tradesPerYear / validSignals.length) - 1) * 100;
            return Math.abs(raw) > MAX_EXPECTED_YEARLY_RETURNS ? null : raw;
          })()
      : null;

    // Certainty Ratio — over validSignals so wins/losses come from the same set as
    // winCount/lossCount/avgPnl above.
    const wins = validSignals.filter((s) => s.pnl.pnlPercentage > 0);
    const losses = validSignals.filter((s) => s.pnl.pnlPercentage < 0);
    const avgWin = wins.length > 0
      ? wins.reduce((sum, s) => sum + s.pnl.pnlPercentage, 0) / wins.length
      : 0;
    const avgLoss = losses.length > 0
      ? losses.reduce((sum, s) => sum + s.pnl.pnlPercentage, 0) / losses.length
      : 0;
    // Null below MIN_SIGNALS_FOR_RATIOS — on a handful of trades the win/loss
    // means are too noisy to publish a ratio (same sample-size gate as Sharpe/
    // Sortino, so the report doesn't surface certainty while withholding the rest).
    // Also null when no losing trades OR when |avgLoss| is below STDDEV_EPSILON
    // (float-artifact losses (-1e-15) would otherwise produce a spurious
    // astronomical certaintyRatio ≈1e14).
    const certaintyRatio: number | null = canComputeRatios && Math.abs(avgLoss) > STDDEV_EPSILON && avgLoss < 0
      ? avgWin / Math.abs(avgLoss)
      : null;

    // Per-trade Expectancy: winProb*avgWin + lossProb*avgLoss. Break-even trades
    // contribute 0 (they're excluded from both probabilities). N-gated like the
    // other ratios — on a tiny sample the per-trade EV is too noisy to publish.
    const expectancy: number | null = canComputeRatios && totalSignals > 0
      ? (wins.length / totalSignals) * avgWin + (losses.length / totalSignals) * avgLoss
      : null;

    // Median pnlPercentage — robust to outliers; reveals skew when avgPnl is
    // dragged by a whale trade. Sort a copy (do not mutate validSignals).
    let medianPnl: number | null = null;
    if (returns.length > 0) {
      const sortedReturns = returns.slice().sort((a, b) => a - b);
      const mid = sortedReturns.length >> 1;
      medianPnl = sortedReturns.length % 2 === 0
        ? (sortedReturns[mid - 1] + sortedReturns[mid]) / 2
        : sortedReturns[mid];
    }

    // Trade duration metrics in minutes (synchronized with strategy
    // `minuteEstimatedTime`). validSignals already requires pendingAt > 0 and
    // closeTimestamp > 0, so every signal here contributes a valid duration.
    let avgDuration: number | null = null;
    let avgWinDuration: number | null = null;
    let avgLossDuration: number | null = null;
    if (totalSignals > 0) {
      const durations: number[] = [];
      const winDurations: number[] = [];
      const lossDurations: number[] = [];
      for (const s of validSignals) {
        const minutes = (s.closeTimestamp - s.signal.pendingAt) / 60_000;
        durations.push(minutes);
        const pnl = s.pnl.pnlPercentage;
        if (pnl > 0) winDurations.push(minutes);
        else if (pnl < 0) lossDurations.push(minutes);
      }
      avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      if (winDurations.length > 0) {
        avgWinDuration = winDurations.reduce((a, b) => a + b, 0) / winDurations.length;
      }
      if (lossDurations.length > 0) {
        avgLossDuration = lossDurations.reduce((a, b) => a + b, 0) / lossDurations.length;
      }
    }

    // Consecutive streak averages: sum the per-streak pnl, then mean across
    // streaks. Storage is newest-first, so iterate in reverse for chronological
    // streaks. Break-even (pnl=0) closes both runs (neither a win nor a loss).
    let avgConsecutiveWinPnl: number | null = null;
    let avgConsecutiveLossPnl: number | null = null;
    {
      const winStreakSums: number[] = [];
      const lossStreakSums: number[] = [];
      let curWin = 0;
      let curLoss = 0;
      let curWinSum = 0;
      let curLossSum = 0;
      for (let i = validSignals.length - 1; i >= 0; i--) {
        const pnl = validSignals[i].pnl.pnlPercentage;
        if (pnl > 0) {
          if (curLoss > 0) {
            lossStreakSums.push(curLossSum);
            curLoss = 0;
            curLossSum = 0;
          }
          curWin++;
          curWinSum += pnl;
        } else if (pnl < 0) {
          if (curWin > 0) {
            winStreakSums.push(curWinSum);
            curWin = 0;
            curWinSum = 0;
          }
          curLoss++;
          curLossSum += pnl;
        } else {
          if (curWin > 0) {
            winStreakSums.push(curWinSum);
            curWin = 0;
            curWinSum = 0;
          }
          if (curLoss > 0) {
            lossStreakSums.push(curLossSum);
            curLoss = 0;
            curLossSum = 0;
          }
        }
      }
      if (curWin > 0) winStreakSums.push(curWinSum);
      if (curLoss > 0) lossStreakSums.push(curLossSum);
      if (winStreakSums.length > 0) {
        avgConsecutiveWinPnl =
          winStreakSums.reduce((a, b) => a + b, 0) / winStreakSums.length;
      }
      if (lossStreakSums.length > 0) {
        avgConsecutiveLossPnl =
          lossStreakSums.reduce((a, b) => a + b, 0) / lossStreakSums.length;
      }
    }

    // Average peak/fall PNL — over validSignals; only signals that actually have the
    // value contribute (no zero dilution from missing peakProfit/maxDrawdown).
    const peakValues = validSignals
      .map((s) => s.signal.peakProfit?.pnlPercentage)
      .filter((v): v is number => typeof v === "number");
    const fallValues = validSignals
      .map((s) => s.signal.maxDrawdown?.pnlPercentage)
      .filter((v): v is number => typeof v === "number");
    const avgPeakPnl: number | null = peakValues.length > 0
      ? peakValues.reduce((sum, v) => sum + v, 0) / peakValues.length
      : null;
    const avgFallPnl: number | null = fallValues.length > 0
      ? fallValues.reduce((sum, v) => sum + v, 0) / fallValues.length
      : null;

    // Sortino (canonical, Sortino 1991): (avgPnl - MAR) / downside deviation, where
    // downsideDev = √( Σ min(0, r - MAR)² / N_total ). We use MAR = 0 (risk-free target),
    // so the numerator reduces to avgPnl and the squared term to r² for r < 0.
    // Dividing by N_total (not N_negative) properly penalises strategies with frequent
    // losses; the "modified" form (N_negative) hides frequency risk in catastrophic-tail
    // strategies.
    const negativeReturns = returns.filter((r) => r < 0);
    const sortinoRatio: number | null = (() => {
      if (!canComputeRatios) return null;
      if (negativeReturns.length === 0) return null;
      const downsideVariance = negativeReturns.reduce((sum, r) => sum + r * r, 0) / returns.length;
      const downsideDeviation = Math.sqrt(downsideVariance);
      // Same epsilon guard as Sharpe — protects against float-artifact downsideDev.
      return downsideDeviation > STDDEV_EPSILON ? avgPnl / downsideDeviation : null;
    })();

    // Calmar — cap |value| at MAX_CALMAR_RATIO to prevent explosion when DD is near zero.
    const calmarRatio: number | null = equityMaxDrawdown > 0 && expectedYearlyReturns !== null
      ? Math.max(-MAX_CALMAR_RATIO, Math.min(MAX_CALMAR_RATIO, expectedYearlyReturns / equityMaxDrawdown))
      : null;
    // Recovery Factor: numerator must be the compounded total return (equityFinal − 1) × 100,
    // not the arithmetic totalPnl — denominator (equityMaxDrawdown) is from the compounded
    // curve, so mixing units would inflate Recovery on long winning streaks.
    // Null below MIN_SIGNALS_FOR_RATIOS — same sample-size gate as the other ratios,
    // so a 3-trade run doesn't surface a Recovery Factor while Sharpe/Calmar are N/A.
    // Null when account is blown — ratio is meaningless after total loss.
    // Same MAX_CALMAR_RATIO clamp as Calmar — both are compounded-profit/DD ratios
    // and explode the same way when DD is near zero.
    const recoveryFactor: number | null = !canComputeRatios || blown || equityMaxDrawdown <= 0
      ? null
      : Math.max(
          -MAX_CALMAR_RATIO,
          Math.min(MAX_CALMAR_RATIO, ((equityFinal - 1) * 100) / equityMaxDrawdown),
        );

    // Price profile — buyer/seller pressure, trend classification. Walks the
    // chronological close series (`orderedSignals` is already sorted by
    // closeTimestamp). N-gated internally by the helper (MIN_SIGNALS = 10).
    const priceProfile = getPriceProfile(
      orderedSignals.map((s) => ({
        closeAt: s.closeTimestamp,
        close: s.currentPrice,
      })),
    );

    return {
      signalList: this._signalList,
      totalSignals,
      winCount,
      lossCount,
      winRate: isUnsafe(winRate) ? null : winRate,
      avgPnl: isUnsafe(avgPnl) ? null : avgPnl,
      totalPnl: isUnsafe(totalPnl) ? null : totalPnl,
      stdDev: isUnsafe(stdDev) ? null : stdDev,
      sharpeRatio: isUnsafe(sharpeRatio) ? null : sharpeRatio,
      annualizedSharpeRatio: isUnsafe(annualizedSharpeRatio) ? null : annualizedSharpeRatio,
      certaintyRatio: isUnsafe(certaintyRatio) ? null : certaintyRatio,
      expectedYearlyReturns: isUnsafe(expectedYearlyReturns) ? null : expectedYearlyReturns,
      avgPeakPnl: isUnsafe(avgPeakPnl) ? null : avgPeakPnl,
      avgFallPnl: isUnsafe(avgFallPnl) ? null : avgFallPnl,
      sortinoRatio: isUnsafe(sortinoRatio) ? null : sortinoRatio,
      calmarRatio: isUnsafe(calmarRatio) ? null : calmarRatio,
      recoveryFactor: isUnsafe(recoveryFactor) ? null : recoveryFactor,
      expectancy: isUnsafe(expectancy) ? null : expectancy,
      avgDuration: isUnsafe(avgDuration) ? null : avgDuration,
      medianPnl: isUnsafe(medianPnl) ? null : medianPnl,
      avgConsecutiveWinPnl: isUnsafe(avgConsecutiveWinPnl) ? null : avgConsecutiveWinPnl,
      avgConsecutiveLossPnl: isUnsafe(avgConsecutiveLossPnl) ? null : avgConsecutiveLossPnl,
      avgWinDuration: isUnsafe(avgWinDuration) ? null : avgWinDuration,
      avgLossDuration: isUnsafe(avgLossDuration) ? null : avgLossDuration,
      medianStepSize: priceProfile.medianStepSize,
      buyerPressure: priceProfile.buyerPressure,
      sellerPressure: priceProfile.sellerPressure,
      buyerStrength: priceProfile.buyerStrength,
      sellerStrength: priceProfile.sellerStrength,
      pressureImbalance: priceProfile.pressureImbalance,
      trend: priceProfile.trend,
      trendStrength: priceProfile.trendStrength,
      trendConfidence: priceProfile.trendConfidence,
    };
  }

  /**
   * Generates markdown report with all closed signals for a strategy (View).
   *
   * @param strategyName - Strategy name
   * @param columns - Column configuration for formatting the table
   * @returns Markdown formatted report with all signals
   */
  public async getReport(
    strategyName: StrategyName,
    columns: Columns[] = COLUMN_CONFIG.backtest_columns
  ): Promise<string> {
    await this.waitForInit();
    const stats = await this.getData();

    if (stats.totalSignals === 0) {
      return [
        `# Backtest Report: ${strategyName}`,
        "",
        "No signals closed yet."
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
      this._signalList.map(async (closedSignal, index) =>
        Promise.all(visibleColumns.map((col) => col.format(closedSignal, index)))
      )
    );

    const tableData = [header, separator, ...rows];
    const table = tableData.map(row => `| ${row.join(" | ")} |`).join("\n");

    return [
      `# Backtest Report: ${strategyName}`,
      "",
      table,
      "",
      `**Total signals:** ${stats.totalSignals}`,
      `**Closed signals:** ${stats.totalSignals}`,
      `**Win rate:** ${stats.winRate === null ? "N/A" : `${stats.winRate.toFixed(2)}% (${stats.winCount}W / ${stats.lossCount}L) (higher is better)`}`,
      `**Average PNL:** ${stats.avgPnl === null ? "N/A" : `${stats.avgPnl > 0 ? "+" : ""}${stats.avgPnl.toFixed(2)}% (higher is better)`}`,
      `**Total PNL:** ${stats.totalPnl === null ? "N/A" : `${stats.totalPnl > 0 ? "+" : ""}${stats.totalPnl.toFixed(2)}% (higher is better)`}`,
      `**Standard Deviation Per Trade:** ${stats.stdDev === null ? "N/A" : `${stats.stdDev.toFixed(3)}% (lower is better)`}`,
      `**Sharpe Ratio:** ${stats.sharpeRatio === null ? "N/A" : `${stats.sharpeRatio.toFixed(3)} (higher is better)`}`,
      `**Annualized Sharpe Ratio:** ${stats.annualizedSharpeRatio === null ? "N/A" : `${stats.annualizedSharpeRatio.toFixed(3)} (higher is better)`}`,
      `**Certainty Ratio:** ${stats.certaintyRatio === null ? "N/A" : `${stats.certaintyRatio.toFixed(3)} (higher is better)`}`,
      `**Expected Yearly Returns:** ${stats.expectedYearlyReturns === null ? "N/A" : `${stats.expectedYearlyReturns > 0 ? "+" : ""}${stats.expectedYearlyReturns.toFixed(2)}% (higher is better)`}`,
      `**Avg Peak PNL:** ${stats.avgPeakPnl === null ? "N/A" : `${stats.avgPeakPnl > 0 ? "+" : ""}${stats.avgPeakPnl.toFixed(2)}% (higher is better)`}`,
      `**Avg Max Drawdown PNL:** ${stats.avgFallPnl === null ? "N/A" : `${stats.avgFallPnl.toFixed(2)}% (closer to 0 is better)`}`,
      `**Sortino Ratio:** ${stats.sortinoRatio === null ? "N/A" : `${stats.sortinoRatio.toFixed(3)} (higher is better)`}`,
      `**Calmar Ratio:** ${stats.calmarRatio === null ? "N/A" : `${stats.calmarRatio.toFixed(3)} (higher is better)`}`,
      `**Recovery Factor:** ${stats.recoveryFactor === null ? "N/A" : `${stats.recoveryFactor.toFixed(3)} (higher is better)`}`,
      `**Expectancy:** ${stats.expectancy === null ? "N/A" : `${stats.expectancy > 0 ? "+" : ""}${stats.expectancy.toFixed(3)}% (higher is better)`}`,
      `**Median PNL:** ${stats.medianPnl === null ? "N/A" : `${stats.medianPnl > 0 ? "+" : ""}${stats.medianPnl.toFixed(3)}% (closer to avgPnl = symmetric distribution)`}`,
      `**Avg Duration:** ${stats.avgDuration === null ? "N/A" : `${stats.avgDuration.toFixed(1)} min`}`,
      `**Avg Win Duration:** ${stats.avgWinDuration === null ? "N/A" : `${stats.avgWinDuration.toFixed(1)} min`}`,
      `**Avg Loss Duration:** ${stats.avgLossDuration === null ? "N/A" : `${stats.avgLossDuration.toFixed(1)} min`}`,
      `**Avg Consecutive Win PNL:** ${stats.avgConsecutiveWinPnl === null ? "N/A" : `${stats.avgConsecutiveWinPnl > 0 ? "+" : ""}${stats.avgConsecutiveWinPnl.toFixed(3)}% (higher is better)`}`,
      `**Avg Consecutive Loss PNL:** ${stats.avgConsecutiveLossPnl === null ? "N/A" : `${stats.avgConsecutiveLossPnl.toFixed(3)}% (closer to 0 is better)`}`,
      `**Trend:** ${stats.trend === null ? "N/A" : stats.trend}`,
      `**Trend Strength:** ${stats.trendStrength === null ? "N/A" : `${stats.trendStrength > 0 ? "+" : ""}${stats.trendStrength.toFixed(3)}%/day`}`,
      `**Trend Confidence (R²):** ${stats.trendConfidence === null ? "N/A" : stats.trendConfidence.toFixed(3)}`,
      `**Buyer Pressure:** ${stats.buyerPressure === null ? "N/A" : `${(stats.buyerPressure * 100).toFixed(1)}%`}`,
      `**Seller Pressure:** ${stats.sellerPressure === null ? "N/A" : `${(stats.sellerPressure * 100).toFixed(1)}%`}`,
      `**Buyer Strength:** ${stats.buyerStrength === null ? "N/A" : `${(stats.buyerStrength * 100).toFixed(1)}%`}`,
      `**Seller Strength:** ${stats.sellerStrength === null ? "N/A" : `${(stats.sellerStrength * 100).toFixed(1)}%`}`,
      `**Pressure Imbalance:** ${stats.pressureImbalance === null ? "N/A" : `${stats.pressureImbalance > 0 ? "+" : ""}${stats.pressureImbalance.toFixed(3)}`}`,
      `**Median Step Size:** ${stats.medianStepSize === null ? "N/A" : `${stats.medianStepSize.toFixed(3)}%`}`,
      "",
      `*Win Rate: percent of closed signals that ended with per-trade PNL > 0, computed as winning-trade count / (winning-trade count + losing-trade count) × 100 — break-even trades (per-trade PNL == 0) are excluded from both numerator and denominator. UNITS: percent in [0, 100]. Statistical reliability: noisy below 30 signals (a single streak can shift it 10–20 points); stable above 200 signals.*`,
      `*Average PNL: arithmetic mean of per-trade PNL across every closed signal, computed as Σ per-trade PNL / closed signal count. UNITS: percent per trade. Sign mirrors strategy edge — positive = profitable on average per trade. Sensitive to one whale trade; cross-check with Median PNL to detect skew.*`,
      `*Total PNL: arithmetic sum of per-trade PNL across every closed signal. UNITS: percent. This is the additive total, NOT the compounded equity return — for the geometrically-compounded variant see Recovery Factor's numerator and Expected Yearly Returns. Useful as a quick scoreboard but ignores volatility drag.*`,
      `*Standard Deviation Per Trade: sample standard deviation (Bessel-corrected, N−1 denominator) of per-trade PNL. UNITS: percent. Measures volatility of returns. Denominator for per-trade Sharpe Ratio. Below STDDEV_EPSILON = 1e-9 it is treated as zero (identical-returns guard). Null when the closed signal count < ${MIN_SIGNALS_FOR_RATIOS} (variance too noisy on small samples).*`,
      `*Sharpe Ratio: per-trade Sharpe = Average PNL / Standard Deviation Per Trade (risk-free rate = 0). UNITS: dimensionless ratio. Higher = better risk-adjusted return per trade. Rule of thumb: below 1.0 poor, 1.0–2.0 acceptable, above 2.0 strong. Null when the closed signal count < ${MIN_SIGNALS_FOR_RATIOS} OR Standard Deviation ≤ 1e-9 (identical-returns / float-artifact guard).*`,
      `*Annualized Sharpe Ratio: per-trade Sharpe × √(trades per year), where trades per year = closed signal count × 365 / calendar span in days. UNITS: dimensionless. Null when the closed signal count < ${MIN_SIGNALS_FOR_ANNUALIZATION}, OR calendar span < ${MIN_CALENDAR_SPAN_DAYS} days, OR raw frequency > ${MAX_TRADES_PER_YEAR} (clustered sample, annualisation unreliable). Assumes returns are iid — autocorrelated strategies are overstated.*`,
      `*Certainty Ratio: mean per-trade PNL over winning trades, divided by the absolute value of the mean per-trade PNL over losing trades. UNITS: dimensionless ratio. Below 1.0 means the typical loss exceeds the typical win; above 1.5 is generally good. Null when the closed signal count < ${MIN_SIGNALS_FOR_RATIOS}, OR there are no losing trades, OR the absolute mean losing PNL < 1e-9 (float-artifact loss guard).*`,
      `*Expected Yearly Returns: geometric annualisation of the equity curve: (final equity ^ (trades per year / closed signal count) − 1) × 100, where final equity is the compounded product of (1 + per-trade PNL / 100) walked over all closed signals in chronological close order. UNITS: percent per year. Accounts for volatility drag (unlike a simple Σ × 365 / calendar-span projection). Null under the same closed-signal-count / calendar-span / frequency gates as Annualized Sharpe Ratio, AND null when |raw value| > ${MAX_EXPECTED_YEARLY_RETURNS}% (capped numbers mislead). −100% when the equity curve hits ≤ 0 (account blown).*`,
      `*Avg Peak PNL: arithmetic mean of each closed signal's peak-PNL snapshot — the best mark-to-market PNL recorded while the position was open. Signals that never recorded such a snapshot are excluded from both numerator and denominator (no zero dilution). UNITS: percent. Describes the typical best-case unrealised excursion during the position's lifetime, not the realised close. NOT gated by MIN_SIGNALS — computed whenever at least one signal carries the snapshot; null only if no signal carries it.*`,
      `*Avg Max Drawdown PNL: arithmetic mean of each closed signal's trough-PNL snapshot — the worst mark-to-market PNL recorded while the position was open. Signals that never recorded such a snapshot are excluded (no zero dilution). UNITS: percent (negative for losing excursions). Describes the typical worst-case unrealised PNL during the position's lifetime; closer to 0 is better. NOT gated by MIN_SIGNALS — computed whenever at least one signal carries the snapshot.*`,
      `*Sortino Ratio: Average PNL / downside deviation, where downside deviation = √( Σ min(0, per-trade PNL)² / closed signal count ) (canonical Sortino 1991: MAR = 0, divide by N_total). UNITS: dimensionless. Penalises only downside volatility. Rule of thumb: below 1.0 poor, 1.0–2.0 acceptable, above 2.0 strong. Null when the closed signal count < ${MIN_SIGNALS_FOR_RATIOS}, OR there are no losing trades (downside is undefined — flawless ≠ infinitely good), OR downside deviation ≤ 1e-9 (float-artifact guard).*`,
      `*Calmar Ratio: Expected Yearly Returns divided by the equity-curve mark-to-market max drawdown, clamped to ±${MAX_CALMAR_RATIO}. The denominator is the max drawdown of the compounded equity curve: each trade's worst intra-trade excursion (the trough-PNL snapshot, ≤ 0) is applied before booking its realised close, so a position that dipped to −18% and recovered to +2% contributes a real drawdown rather than zero. UNITS: dimensionless. Rule of thumb: below 0.5 poor, 0.5–1.0 acceptable, above 1.0 strong. Null when Expected Yearly Returns is null OR the equity max drawdown ≤ 0.*`,
      `*Recovery Factor: (final equity − 1) × 100 divided by the equity-curve mark-to-market max drawdown, clamped to ±${MAX_CALMAR_RATIO}. The numerator is the compounded total return — NOT the arithmetic Total PNL shown above; the denominator is computed on the compounded curve, so mixing those units would inflate the ratio on long winning streaks. The denominator is the same mark-to-market max drawdown used by Calmar. UNITS: dimensionless. Below 1.0 = profit doesn't cover drawdown; above 3.0 = good. Null when the closed signal count < ${MIN_SIGNALS_FOR_RATIOS}, the equity curve blew up (account ≤ 0), or the equity max drawdown ≤ 0.*`,
      `*Expectancy: per-trade expected value = (winning-trade count / closed signal count) × mean winning PNL + (losing-trade count / closed signal count) × mean losing PNL. Break-even trades contribute 0 (excluded from both probabilities). UNITS: percent per trade. Positive = profitable on average per trade. Null when the closed signal count < ${MIN_SIGNALS_FOR_RATIOS}.*`,
      `*Median PNL: median of per-trade PNL across all closed signals (middle value after sorting; for even N the mean of the two middles). UNITS: percent. Robust to outliers — comparing it with Average PNL reveals distribution skew. A large gap (e.g. avg +1.5%, median +0.2%) means one or two trades carry the arithmetic mean. NOT gated by MIN_SIGNALS — computed whenever the closed signal count ≥ 1.*`,
      `*Avg Duration: arithmetic mean of (close-time − pending-time) / 60_000 over all closed signals. UNITS: minutes (synchronised with the strategy's estimated-minutes setting). Describes the typical position hold time. NOT gated by MIN_SIGNALS — computed whenever the closed signal count ≥ 1.*`,
      `*Avg Win Duration: arithmetic mean of (close-time − pending-time) / 60_000 restricted to winning trades (per-trade PNL > 0). UNITS: minutes. Null only when there are no winning trades (NOT gated by MIN_SIGNALS — computed at any winning-trade count ≥ 1). Pair with Avg Loss Duration to detect the classic asymmetry "let winners run, cut losers short" (Win Duration > Loss Duration is healthy) versus the inverse red flag "cut winners short, let losers run".*`,
      `*Avg Loss Duration: arithmetic mean of (close-time − pending-time) / 60_000 restricted to losing trades (per-trade PNL < 0). UNITS: minutes. Null only when there are no losing trades (NOT gated by MIN_SIGNALS).*`,
      `*Avg Consecutive Win PNL: a "win streak" is a run of consecutive trades with per-trade PNL > 0 bounded by either a losing or break-even trade; this metric sums per-trade PNL within each streak and then averages those sums. Trades are walked in chronological close order. UNITS: percent per streak. Higher = winning streaks are typically bigger. Null only when there is not a single complete win streak in the stored history (NOT gated by MIN_SIGNALS).*`,
      `*Avg Consecutive Loss PNL: a "loss streak" is a run of consecutive trades with per-trade PNL < 0 bounded by either a winning or break-even trade; this metric sums per-trade PNL within each streak and then averages those sums. UNITS: percent per streak (negative). Closer to 0 = losing streaks are typically smaller. Null only when there is not a single complete loss streak (NOT gated by MIN_SIGNALS).*`,
      `*Trend: classification computed FROM CLOSING PRICES OF CLOSED SIGNALS (one point per closed trade = the price at which it closed, with its close-timestamp — no candles, no order book, no tick stream). Bivariate gate: "sideways" when R² < 0.30 (regression too weak to call any direction). Otherwise "neutral" when |Trend Strength| < 0.25 × Median Step Size (slope detectable but smaller than the typical daily step). Otherwise "bullish" if Trend Strength > 0, "bearish" if Trend Strength < 0. Two-axis gate — never a single-axis if on a magic-constant slope magnitude. Null when the closed signal count < ${MIN_SIGNALS_FOR_RATIOS}, which means Median Step Size, Trend Strength and Trend Confidence all gate as one bundle: if any is null the others are null too, so the classification never sees a partially-computed input. Boundary case: when every closed price is identical (a flat synthetic series at N ≥ ${MIN_SIGNALS_FOR_RATIOS}), Median Step Size is 0 and the slope-vs-step gate collapses — the regression then returns slope = R² = 0, R² < 0.30 fires first, and the classification is "sideways" as expected.*`,
      `*Trend Strength: ordinary-least-squares slope of \`log(close) ~ days\` regressed across CLOSING PRICES OF CLOSED SIGNALS (one point per closed trade in chronological order — no candles). UNITS: percent per day (small-slope approximation: log-return ≈ percent-return). NOT ATR-normalised, NOT ADX, NOT a rolling-window indicator at signal entry — a static fit over the entire stored history at report time. Null when the closed signal count < ${MIN_SIGNALS_FOR_RATIOS} or the calendar span is degenerate.*`,
      `*Trend Confidence (R²): coefficient of determination of the same log-price regression that produces Trend Strength, computed on log(close) — NOT on absolute close. UNITS: dimensionless in [0, 1]. High R² = log-price moves linearly with time (clean trend); low R² = the series is noisy regardless of slope sign. Null when the closed signal count < ${MIN_SIGNALS_FOR_RATIOS} or the calendar span is degenerate.*`,
      `*Buyer Pressure: frequency-based, computed FROM CLOSING PRICES OF CLOSED SIGNALS. (count of i where close[i] > close[i−1]) / (count of decisive moves), where "decisive" excludes flats (close[i] == close[i−1]). UNITS: dimensionless fraction in [0, 1]. NOT order-flow aggressor volume — backtest data has no order book; "buyer" labels only the SIGN of the close-to-close return. Null when the closed signal count < ${MIN_SIGNALS_FOR_RATIOS}.*`,
      `*Seller Pressure: frequency-based, computed FROM CLOSING PRICES OF CLOSED SIGNALS. (count of i where close[i] < close[i−1]) / (count of decisive moves). By construction Seller Pressure = 1 − Buyer Pressure (the two sum to 1). UNITS: dimensionless fraction in [0, 1]. NOT order-flow aggressor volume — labels only the SIGN of the close-to-close return. Null when the closed signal count < ${MIN_SIGNALS_FOR_RATIOS}.*`,
      `*Buyer Strength: magnitude-based, computed FROM CLOSING PRICES OF CLOSED SIGNALS. Σ |close[i] − close[i−1]| / close[i−1] over up-moves (close[i] > close[i−1]), divided by the same sum over ALL decisive moves. UNITS: dimensionless fraction in [0, 1]. Buyer Pressure (count of up-moves) and Buyer Strength (sum of up-magnitudes) use the SAME close-to-close return series; only count vs magnitude differs. A divergence between them (e.g. Pressure 0.70 with Strength 0.45) means "many small up-moves, fewer but larger down-moves" — a regime asymmetry frequency alone hides. Null when the closed signal count < ${MIN_SIGNALS_FOR_RATIOS}.*`,
      `*Seller Strength: magnitude-based, computed FROM CLOSING PRICES OF CLOSED SIGNALS. Σ |close[i] − close[i−1]| / close[i−1] over down-moves (close[i] < close[i−1]), divided by the same sum over ALL decisive moves. By construction Seller Strength = 1 − Buyer Strength (the two sum to 1). UNITS: dimensionless fraction in [0, 1]. Null when the closed signal count < ${MIN_SIGNALS_FOR_RATIOS}.*`,
      `*Pressure Imbalance: DIFFERENCE, not ratio: Buyer Strength − Seller Strength, computed FROM CLOSING PRICES OF CLOSED SIGNALS. Equivalent to (2 × Buyer Strength − 1). UNITS: dimensionless in [−1, +1]. Sign = direction of magnitude bias (positive = bullish bias on magnitude); absolute value = how lopsided. Single signed scalar that compresses the strength pair into one number. Null when the closed signal count < ${MIN_SIGNALS_FOR_RATIOS}.*`,
      `*Median Step Size: median over i ∈ [1..N−1] of |close[i] − close[i−1]| / close[i−1], computed FROM CLOSING PRICES OF CLOSED SIGNALS — "step" = consecutive closes of CLOSED TRADES (NOT ticks, NOT bars of any timeframe — the report has no candle access). UNITS: percent, normalised by price → directly comparable across symbols at any price level. Median (not mean) → robust to one whale trade. NOT classical candle-based volatility (ATR / σ of returns); it measures the step distribution AT THE RATE TRADES CLOSE. Null when the closed signal count < ${MIN_SIGNALS_FOR_RATIOS}.*`,
      `*General reliability note: per-trade ratios (Sharpe, Sortino, Certainty, Recovery, Expectancy) are gated to N/A below ${MIN_SIGNALS_FOR_RATIOS} closed signals because the underlying variance estimates are too noisy. Annualised metrics (Annualized Sharpe, Expected Yearly Returns, Calmar) additionally require a calendar span ≥ ${MIN_CALENDAR_SPAN_DAYS} days and a raw trade frequency ≤ ${MAX_TRADES_PER_YEAR} per year. 100+ signals are needed for statistical reliability of the ratios; annualised metrics assume the observed frequency and market regime persist year-round.*`,
      `*IMPORTANT: Total PNL and the equity-curve metrics (Expected Yearly Returns, Calmar, Recovery, and the equity max drawdown that feeds them) all assume **100% capital allocation per position** (no portfolio fraction). They ignore the position-sizing subsystem (PositionSize / Kelly / ATR): per-trade PNL is a return on the position's own invested capital, never scaled by the account balance. With DCA averaging, the cost basis is the sum of all entries and the entry price is dollar-cost-weighted, so per-trade % is measured against the averaged position. If your strategy risks X% of capital per trade, the realised portfolio return / drawdown is roughly X/100 of the reported figures — these are theoretical upper bounds under full allocation.*`,
      `*Negative values for Sharpe / Annualized Sharpe / Sortino / Calmar / Recovery / Expectancy / Expected Yearly Returns indicate a losing strategy (Average PNL < 0 or Total PNL < 0). "Higher is better" still applies — closer to zero is less bad, positive is profitable.*`,
    ].join("\n");
  }

  /**
   * Saves strategy report to disk.
   *
   * @param strategyName - Strategy name
   * @param path - Directory path to save report (default: "./dump/backtest")
   * @param columns - Column configuration for formatting the table
   */
  public async dump(
    strategyName: StrategyName,
    path = "./dump/backtest",
    columns: Columns[] = COLUMN_CONFIG.backtest_columns
  ): Promise<void> {
    const markdown = await this.getReport(strategyName, columns);
    const timestamp = getContextTimestamp();
    const filename = CREATE_FILE_NAME_FN(this.symbol, strategyName, this.exchangeName, this.frameName, timestamp);
    await MarkdownWriter.writeData("backtest", markdown, {
      path,
      file: filename,
      symbol: this.symbol,
      strategyName: this.strategyName,
      exchangeName: this.exchangeName,
      frameName: this.frameName,
      signalId: "",
    });
  }
}

/**
 * Service for generating and saving backtest markdown reports.
 *
 * Features:
 * - Listens to signal events via onTick callback
 * - Accumulates closed signals per strategy using memoized storage
 * - Generates markdown tables with detailed signal information
 * - Saves reports to disk in logs/backtest/{strategyName}.md
 *
 * @example
 * ```typescript
 * const service = new BacktestMarkdownService();
 *
 * // Add to strategy callbacks
 * addStrategy({
 *   strategyName: "my-strategy",
 *   callbacks: {
 *     onTick: (symbol, result, backtest) => {
 *       service.tick(result);
 *     }
 *   }
 * });
 *
 * // After backtest, generate and save report
 * await service.saveReport("my-strategy");
 * ```
 */
export class BacktestMarkdownService {
  /** Logger service for debug output */
  private readonly loggerService = inject<TLoggerService>(TYPES.loggerService);

  /**
   * Memoized function to get or create ReportStorage for a symbol-strategy-exchange-frame-backtest combination.
   * Each combination gets its own isolated storage instance.
   */
  private getStorage = memoize<(symbol: string, strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean) => ReportStorage>(
    ([symbol, strategyName, exchangeName, frameName, backtest]) => CREATE_KEY_FN(symbol, strategyName, exchangeName, frameName, backtest),
    (symbol, strategyName, exchangeName, frameName) => new ReportStorage(symbol, strategyName, exchangeName, frameName)
  );

  /**
   * Processes tick events and accumulates closed signals.
   * Should be called from IStrategyCallbacks.onTick.
   *
   * Only processes closed signals - opened signals are ignored.
   *
   * @param data - Tick result from strategy execution (opened or closed) with frameName wrapper
   *
   * @example
   * ```typescript
   * const service = new BacktestMarkdownService();
   *
   * callbacks: {
   *   onTick: (symbol, result, backtest) => {
   *     service.tick(result);
   *   }
   * }
   * ```
   */
  private tick = async (data: IStrategyTickResult) => {
    this.loggerService.log("backtestMarkdownService tick", {
      data,
    });

    if (data.action !== "closed") {
      return;
    }

    const storage = this.getStorage(data.symbol, data.strategyName, data.exchangeName, data.frameName, true);
    await storage.waitForInit();
    storage.addSignal(data);
  };

  /**
   * Gets statistical data from all closed signals for a symbol-strategy pair.
   * Delegates to ReportStorage.getData().
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to get data for
   * @param exchangeName - Exchange name
   * @param frameName - Frame name
   * @param backtest - True if backtest mode, false if live mode
   * @returns Statistical data object with all metrics
   *
   * @example
   * ```typescript
   * const service = new BacktestMarkdownService();
   * const stats = await service.getData("BTCUSDT", "my-strategy", "binance", "1h", true);
   * console.log(stats.sharpeRatio, stats.winRate);
   * ```
   */
  public getData = async (symbol: string, strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean): Promise<BacktestStatisticsModel> => {
    this.loggerService.log("backtestMarkdownService getData", {
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
    });
    if (!this.subscribe.hasValue()) {
      throw new Error("BacktestMarkdownService not initialized. Call subscribe() before getting data.");
    }
    const storage = this.getStorage(symbol, strategyName, exchangeName, frameName, backtest);
    return storage.getData();
  };

  /**
   * Generates markdown report with all closed signals for a symbol-strategy pair.
   * Delegates to ReportStorage.generateReport().
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to generate report for
   * @param exchangeName - Exchange name
   * @param frameName - Frame name
   * @param backtest - True if backtest mode, false if live mode
   * @param columns - Column configuration for formatting the table
   * @returns Markdown formatted report string with table of all closed signals
   *
   * @example
   * ```typescript
   * const service = new BacktestMarkdownService();
   * const markdown = await service.getReport("BTCUSDT", "my-strategy", "binance", "1h", true);
   * console.log(markdown);
   * ```
   */
  public getReport = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
    columns: Columns[] = COLUMN_CONFIG.backtest_columns
  ): Promise<string> => {
    this.loggerService.log("backtestMarkdownService getReport", {
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
    });
    if (!this.subscribe.hasValue()) {
      throw new Error("BacktestMarkdownService not initialized. Call subscribe() before generating reports.");
    }
    const storage = this.getStorage(symbol, strategyName, exchangeName, frameName, backtest);
    return storage.getReport(strategyName, columns);
  };

  /**
   * Saves symbol-strategy report to disk.
   * Creates directory if it doesn't exist.
   * Delegates to ReportStorage.dump().
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to save report for
   * @param exchangeName - Exchange name
   * @param frameName - Frame name
   * @param backtest - True if backtest mode, false if live mode
   * @param path - Directory path to save report (default: "./dump/backtest")
   * @param columns - Column configuration for formatting the table
   *
   * @example
   * ```typescript
   * const service = new BacktestMarkdownService();
   *
   * // Save to default path: ./dump/backtest/my-strategy.md
   * await service.dump("BTCUSDT", "my-strategy", "binance", "1h", true);
   *
   * // Save to custom path: ./custom/path/my-strategy.md
   * await service.dump("BTCUSDT", "my-strategy", "binance", "1h", true, "./custom/path");
   * ```
   */
  public dump = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
    path = "./dump/backtest",
    columns: Columns[] = COLUMN_CONFIG.backtest_columns
  ): Promise<void> => {
    this.loggerService.log("backtestMarkdownService dump", {
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
      path,
    });
    if (!this.subscribe.hasValue()) {
      throw new Error("BacktestMarkdownService not initialized. Call subscribe() before dumping reports.");
    }
    const storage = this.getStorage(symbol, strategyName, exchangeName, frameName, backtest);
    await storage.dump(strategyName, path, columns);
  };

  /**
   * Clears accumulated signal data from storage.
   * If payload is provided, clears only that specific symbol-strategy-exchange-frame-backtest combination's data.
   * If nothing is provided, clears all data.
   *
   * @param payload - Optional payload with symbol, strategyName, exchangeName, frameName, backtest
   *
   * @example
   * ```typescript
   * const service = new BacktestMarkdownService();
   *
   * // Clear specific combination
   * await service.clear({ symbol: "BTCUSDT", strategyName: "my-strategy", exchangeName: "binance", frameName: "1h", backtest: true });
   *
   * // Clear all data
   * await service.clear();
   * ```
   */
  public clear = async (payload?: { symbol: string; strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName; backtest: boolean }) => {
    this.loggerService.log("backtestMarkdownService clear", {
      payload,
    });
    if (payload) {
      const key = CREATE_KEY_FN(payload.symbol, payload.strategyName, payload.exchangeName, payload.frameName, payload.backtest);
      this.getStorage.clear(key);
    } else {
      this.getStorage.clear();
    }
  };

  /**
   * Subscribes to backtest signal emitter to receive tick events.
   * Protected against multiple subscriptions.
   * Returns an unsubscribe function to stop receiving events.
   *
   * @example
   * ```typescript
   * const service = new BacktestMarkdownService();
   * const unsubscribe = service.subscribe();
   * // ... later
   * unsubscribe();
   * ```
   */
  public subscribe = singleshot(() => {
    this.loggerService.log("backtestMarkdownService init");
    const unsubscribe = signalBacktestEmitter.subscribe(this.tick);
    return () => {
      this.subscribe.clear();
      this.clear();
      unsubscribe();
    }
  });

  /**
   * Unsubscribes from backtest signal emitter to stop receiving tick events.
   * Calls the unsubscribe function returned by subscribe().
   * If not subscribed, does nothing.
   * 
   * @example
   * ```typescript
   * const service = new BacktestMarkdownService(); 
   * service.subscribe();
   * // ... later
   * service.unsubscribe();
   * ```
   */
  public unsubscribe = async () => {
    this.loggerService.log("backtestMarkdownService unsubscribe");
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };
}

export default BacktestMarkdownService;

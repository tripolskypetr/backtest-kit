import {
  IStrategyTickResult,
  IStrategyTickResultClosed,
  StrategyName,
} from "../../../interfaces/Strategy.interface";
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
    // are too noisy to publish (high chance of spurious ±Sharpe).
    const returns = validSignals.map((s) => s.pnl.pnlPercentage);
    const canComputeRatios = totalSignals >= MIN_SIGNALS_FOR_RATIOS;
    const stdDev = canComputeRatios
      ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgPnl, 2), 0) / (totalSignals - 1))
      : 0;
    // Use STDDEV_EPSILON gate (not stdDev > 0) — identical-returns series produce
    // float-artifact stdDev (~1e-17) that's mathematically > 0 but spuriously
    // inflates sharpe to astronomical magnitudes (avgPnl / epsilon).
    const sharpeRatio: number | null = canComputeRatios && stdDev > STDDEV_EPSILON
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
    // If equity goes ≤ 0 (e.g. leveraged short with r < -100%) — account blown,
    // fix DD at 100% and stop walking the curve.
    let equity = 1;
    let peak = 1;
    let equityMaxDrawdown = 0;
    let blown = false;
    for (let i = validSignals.length - 1; i >= 0; i--) {
      equity *= 1 + validSignals[i].pnl.pnlPercentage / 100;
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
    // Null when no losing trades OR when |avgLoss| is below STDDEV_EPSILON.
    // The latter guards against float-artifact losses (-1e-15) producing
    // spurious astronomical certaintyRatio (≈1e14).
    const certaintyRatio: number | null = Math.abs(avgLoss) > STDDEV_EPSILON && avgLoss < 0
      ? avgWin / Math.abs(avgLoss)
      : null;

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
    // Null when account is blown — ratio is meaningless after total loss.
    // Same MAX_CALMAR_RATIO clamp as Calmar — both are compounded-profit/DD ratios
    // and explode the same way when DD is near zero.
    const recoveryFactor: number | null = blown || equityMaxDrawdown <= 0
      ? null
      : Math.max(
          -MAX_CALMAR_RATIO,
          Math.min(MAX_CALMAR_RATIO, ((equityFinal - 1) * 100) / equityMaxDrawdown),
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
      `**Standard Deviation:** ${stats.stdDev === null ? "N/A" : `${stats.stdDev.toFixed(3)}% (lower is better)`}`,
      `**Sharpe Ratio:** ${stats.sharpeRatio === null ? "N/A" : `${stats.sharpeRatio.toFixed(3)} (higher is better)`}`,
      `**Annualized Sharpe Ratio:** ${stats.annualizedSharpeRatio === null ? "N/A" : `${stats.annualizedSharpeRatio.toFixed(3)} (higher is better)`}`,
      `**Certainty Ratio:** ${stats.certaintyRatio === null ? "N/A" : `${stats.certaintyRatio.toFixed(3)} (higher is better)`}`,
      `**Expected Yearly Returns:** ${stats.expectedYearlyReturns === null ? "N/A" : `${stats.expectedYearlyReturns > 0 ? "+" : ""}${stats.expectedYearlyReturns.toFixed(2)}% (higher is better)`}`,
      `**Avg Peak PNL:** ${stats.avgPeakPnl === null ? "N/A" : `${stats.avgPeakPnl > 0 ? "+" : ""}${stats.avgPeakPnl.toFixed(2)}% (higher is better)`}`,
      `**Avg Max Drawdown PNL:** ${stats.avgFallPnl === null ? "N/A" : `${stats.avgFallPnl.toFixed(2)}% (closer to 0 is better)`}`,
      `**Sortino Ratio:** ${stats.sortinoRatio === null ? "N/A" : `${stats.sortinoRatio.toFixed(3)} (higher is better)`}`,
      `**Calmar Ratio:** ${stats.calmarRatio === null ? "N/A" : `${stats.calmarRatio.toFixed(3)} (higher is better)`}`,
      `**Recovery Factor:** ${stats.recoveryFactor === null ? "N/A" : `${stats.recoveryFactor.toFixed(3)} (higher is better)`}`,
      "",
      `*Win Rate: reliable above 200+ signals; below 30 signals a single streak can shift it by 10-20%.*`,
      `*Sharpe Ratio: below 1.0 is poor, 1.0-2.0 is acceptable, above 2.0 is strong. Requires 30+ signals.*`,
      `*Annualized Sharpe Ratio: per-trade Sharpe × √tradesPerYear; tradesPerYear = signals × 365 / calendarSpanDays. N/A unless ≥${MIN_SIGNALS_FOR_ANNUALIZATION} signals and span ≥${MIN_CALENDAR_SPAN_DAYS} days. Assumes returns are iid — autocorrelated strategies are overstated.*`,
      `*Sortino Ratio: below 1.0 is poor, 1.0-2.0 is acceptable, above 2.0 is strong. Requires 30+ signals. N/A when no losing trades — Sortino is mathematically undefined (infinite) and we cannot distinguish "truly flawless" from "lucky streak so far".*`,
      `*Certainty Ratio: below 1.0 means average loss exceeds average win. Above 1.5 is considered good.*`,
      `*Expected Yearly Returns: compounded geometric return from the equity curve, annualized by tradesPerYear. Same gating as Annualized Sharpe. Capped at ±${MAX_EXPECTED_YEARLY_RETURNS}% — values above the cap return N/A.*`,
      `*Calmar Ratio: below 0.5 is poor, 0.5-1.0 is acceptable, above 1.0 is strong. Denominator is compounded equity-curve max drawdown. Capped at ±${MAX_CALMAR_RATIO}.*`,
      `*Recovery Factor: below 1.0 means total profit does not cover max drawdown. Above 3.0 is considered good. Uses compounded total return as numerator.*`,
      `*All metrics require 100+ signals to be statistically reliable. Annualized metrics assume the observed trading frequency and market conditions persist year-round.*`,
      `*IMPORTANT: Equity curve, Expected Yearly Returns, Calmar, Recovery and Max Drawdown all assume **100% capital allocation per trade** (no sizing, no portfolio fraction). Per-trade pnlPercentage is treated as a return on full equity. If your strategy risks X% of capital per trade, the realized portfolio return / drawdown will be roughly X/100 of the reported figures. The framework does not track portfolio-level sizing, so these metrics represent a theoretical upper bound under full allocation.*`,
      `*Negative values for Sharpe / Sortino / Calmar / Recovery / Expected Yearly Returns indicate a losing strategy (avgPnl < 0 or totalPnl < 0). "Higher is better" still applies — closer to zero is less bad, positive is profitable.*`,
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

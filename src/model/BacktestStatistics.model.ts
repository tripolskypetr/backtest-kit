import { IStrategyTickResultClosed } from "../interfaces/Strategy.interface";

/**
 * Statistical data calculated from backtest results.
 *
 * All numeric values are null if calculation is unsafe (NaN, Infinity, etc).
 * Provides comprehensive metrics for strategy performance analysis.
 *
 * @example
 * ```typescript
 * const stats = await Backtest.getData("my-strategy");
 *
 * console.log(`Total signals: ${stats.totalSignals}`);
 * console.log(`Win rate: ${stats.winRate}%`);
 * console.log(`Sharpe Ratio: ${stats.sharpeRatio}`);
 *
 * // Access raw signal data
 * stats.signalList.forEach(signal => {
 *   console.log(`Signal ${signal.signal.id}: ${signal.pnl.pnlPercentage}%`);
 * });
 * ```
 */
export interface BacktestStatisticsContract {
  /** Array of all closed signals with full details (price, PNL, timestamps, etc.) */
  signalList: IStrategyTickResultClosed[];

  /** Total number of closed signals */
  totalSignals: number;

  /** Number of winning signals (PNL > 0) */
  winCount: number;

  /** Number of losing signals (PNL < 0) */
  lossCount: number;

  /** Win rate as percentage (0-100), null if unsafe. Higher is better. */
  winRate: number | null;

  /** Average PNL per signal as percentage, null if unsafe. Higher is better. */
  avgPnl: number | null;

  /** Cumulative PNL across all signals as percentage, null if unsafe. Higher is better. */
  totalPnl: number | null;

  /** Standard deviation of returns (volatility metric), null if unsafe. Lower is better. */
  stdDev: number | null;

  /** Sharpe Ratio (risk-adjusted return = avgPnl / stdDev), null if unsafe. Higher is better. */
  sharpeRatio: number | null;

  /** Annualized Sharpe Ratio (sharpeRatio × √365), null if unsafe. Higher is better. */
  annualizedSharpeRatio: number | null;

  /** Certainty Ratio (avgWin / |avgLoss|), null if unsafe. Higher is better. */
  certaintyRatio: number | null;

  /** Expected yearly returns based on average trade duration and PNL, null if unsafe. Higher is better. */
  expectedYearlyReturns: number | null;
}

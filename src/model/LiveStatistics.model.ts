/**
 * Unified tick event data for report generation.
 * Contains all information about a tick event regardless of action type.
 */
export interface TickEvent {
  /** Event timestamp in milliseconds (pendingAt for opened/closed events) */
  timestamp: number;
  /** Event action type */
  action: "idle" | "opened" | "active" | "closed";
  /** Trading pair symbol (only for non-idle events) */
  symbol?: string;
  /** Signal ID (only for opened/active/closed) */
  signalId?: string;
  /** Position type (only for opened/active/closed) */
  position?: string;
  /** Signal note (only for opened/active/closed) */
  note?: string;
  /** Current price */
  currentPrice: number;
  /** Open price (only for opened/active/closed) */
  openPrice?: number;
  /** Take profit price (only for opened/active/closed) */
  takeProfit?: number;
  /** Stop loss price (only for opened/active/closed) */
  stopLoss?: number;
  /** Percentage progress towards take profit (only for active) */
  percentTp?: number;
  /** Percentage progress towards stop loss (only for active) */
  percentSl?: number;
  /** PNL percentage (only for closed) */
  pnl?: number;
  /** Close reason (only for closed) */
  closeReason?: string;
  /** Duration in minutes (only for closed) */
  duration?: number;
}

/**
 * Statistical data calculated from live trading results.
 *
 * All numeric values are null if calculation is unsafe (NaN, Infinity, etc).
 * Provides comprehensive metrics for live trading performance analysis.
 *
 * @example
 * ```typescript
 * const stats = await Live.getData("my-strategy");
 *
 * console.log(`Total events: ${stats.totalEvents}`);
 * console.log(`Closed signals: ${stats.totalClosed}`);
 * console.log(`Win rate: ${stats.winRate}%`);
 * console.log(`Sharpe Ratio: ${stats.sharpeRatio}`);
 *
 * // Access raw event data (includes idle, opened, active, closed)
 * stats.eventList.forEach(event => {
 *   if (event.action === "closed") {
 *     console.log(`Closed signal: ${event.pnl}%`);
 *   }
 * });
 * ```
 */
export interface LiveStatisticsContract {
  /** Array of all events (idle, opened, active, closed) with full details */
  eventList: TickEvent[];

  /** Total number of all events (includes idle, opened, active, closed) */
  totalEvents: number;

  /** Total number of closed signals only */
  totalClosed: number;

  /** Number of winning closed signals (PNL > 0) */
  winCount: number;

  /** Number of losing closed signals (PNL < 0) */
  lossCount: number;

  /** Win rate as percentage (0-100) based on closed signals, null if unsafe. Higher is better. */
  winRate: number | null;

  /** Average PNL per closed signal as percentage, null if unsafe. Higher is better. */
  avgPnl: number | null;

  /** Cumulative PNL across all closed signals as percentage, null if unsafe. Higher is better. */
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

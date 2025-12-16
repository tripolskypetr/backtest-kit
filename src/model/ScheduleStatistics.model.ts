/**
 * Unified scheduled signal event data for report generation.
 * Contains all information about scheduled, opened and cancelled events.
 */
export interface ScheduledEvent {
  /** Event timestamp in milliseconds (scheduledAt for scheduled/cancelled events) */
  timestamp: number;
  /** Event action type */
  action: "scheduled" | "opened" | "cancelled";
  /** Trading pair symbol */
  symbol: string;
  /** Signal ID */
  signalId: string;
  /** Position type */
  position: string;
  /** Signal note */
  note?: string;
  /** Current market price */
  currentPrice: number;
  /** Scheduled entry price */
  priceOpen: number;
  /** Take profit price */
  takeProfit: number;
  /** Stop loss price */
  stopLoss: number;
  /** Close timestamp (only for cancelled) */
  closeTimestamp?: number;
  /** Duration in minutes (only for cancelled/opened) */
  duration?: number;
}

/**
 * Statistical data calculated from scheduled signals.
 *
 * Provides metrics for scheduled signal tracking, activation and cancellation analysis.
 *
 * @example
 * ```typescript
 * const stats = await Schedule.getData("my-strategy");
 *
 * console.log(`Total events: ${stats.totalEvents}`);
 * console.log(`Scheduled signals: ${stats.totalScheduled}`);
 * console.log(`Opened signals: ${stats.totalOpened}`);
 * console.log(`Cancelled signals: ${stats.totalCancelled}`);
 * console.log(`Cancellation rate: ${stats.cancellationRate}%`);
 *
 * // Access raw event data (includes scheduled, opened, cancelled)
 * stats.eventList.forEach(event => {
 *   if (event.action === "cancelled") {
 *     console.log(`Cancelled signal: ${event.signalId}`);
 *   }
 * });
 * ```
 */
export interface ScheduleStatisticsModel {
  /** Array of all scheduled/opened/cancelled events with full details */
  eventList: ScheduledEvent[];

  /** Total number of all events (includes scheduled, opened, cancelled) */
  totalEvents: number;

  /** Total number of scheduled signals */
  totalScheduled: number;

  /** Total number of opened signals (activated from scheduled) */
  totalOpened: number;

  /** Total number of cancelled signals */
  totalCancelled: number;

  /** Cancellation rate as percentage (0-100), null if no scheduled signals. Lower is better. */
  cancellationRate: number | null;

  /** Activation rate as percentage (0-100), null if no scheduled signals. Higher is better. */
  activationRate: number | null;

  /** Average waiting time for cancelled signals in minutes, null if no cancelled signals */
  avgWaitTime: number | null;

  /** Average waiting time for opened signals in minutes, null if no opened signals */
  avgActivationTime: number | null;
}

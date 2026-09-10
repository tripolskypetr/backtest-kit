import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";
import { IPublicSignalRow, StrategyCancelReason, StrategyName } from "../interfaces/Strategy.interface";

/**
 * Contract for scheduled signal lifecycle events (creation and cancellation).
 *
 * Emitted by scheduleEventSubject when a scheduled signal is created (added) or cancelled
 * during tick()/backtest() processing. Lets consumers track the scheduled phase of a signal
 * without subscribing to the full signal stream.
 *
 * IMPORTANT: The scheduled -> active transition (activation) is intentionally NOT emitted here.
 * Activation produces an "opened" signal on the regular signal emitters; this contract only
 * covers a scheduled signal being put in place and being removed before it ever opened.
 *
 * Consumers:
 * - User callbacks via listenOrderSchedule()
 *
 * @example
 * ```typescript
 * import { listenOrderSchedule } from "backtest-kit";
 *
 * listenOrderSchedule((event) => {
 *   if (event.action === "scheduled") {
 *     console.log(`Scheduled ${event.symbol} @ ${event.data.priceOpen}`);
 *   } else {
 *     console.log(`Cancelled ${event.symbol} (reason: ${event.reason})`);
 *   }
 * });
 * ```
 */
export interface ScheduleEventContract {
  /**
   * Lifecycle action for the scheduled signal.
   * - "scheduled": a new scheduled signal was created (waiting for priceOpen activation)
   * - "cancelled": the scheduled signal was removed before activation (timeout / price reject / user)
   */
  action: "scheduled" | "cancelled";

  /**
   * Trading pair symbol (e.g., "BTCUSDT").
   * Identifies which market this event belongs to.
   */
  symbol: string;

  /**
   * Strategy name that owns this scheduled signal.
   */
  strategyName: StrategyName;

  /**
   * Exchange name where this scheduled signal lives.
   */
  exchangeName: ExchangeName;

  /**
   * Frame name (timeframe / date range) for the run. Empty string in live mode.
   * Same value as the signal's `frameName` (`data.frameName`).
   */
  frameName: FrameName;

  /**
   * Complete scheduled signal row data in public form.
   * Contains all signal information: id, position, priceOpen, priceTakeProfit, priceStopLoss, etc.
   */
  data: IPublicSignalRow;

  /**
   * Cancellation reason. Present only when `action === "cancelled"`:
   * - "timeout": CC_SCHEDULE_AWAIT_MINUTES elapsed without reaching priceOpen
   * - "price_reject": price hit stop-loss before activation
   * - "user": cancelled via cancelScheduled()
   *
   * Always undefined when `action === "scheduled"`.
   */
  reason?: StrategyCancelReason;

  /**
   * Current market price of the symbol at the time of the event.
   */
  currentPrice: number;

  /**
   * Execution mode flag.
   * - true: Event from backtest execution (historical candle data)
   * - false: Event from live trading (real-time tick)
   */
  backtest: boolean;

  /**
   * Event timestamp in milliseconds since Unix epoch.
   *
   * Timing semantics:
   * - Live mode: when.getTime() at the moment of the event
   * - Backtest mode: candle.timestamp of the candle being processed
   */
  timestamp: number;

  /**
   * Event time as a `Date` instance.
   *
   * - Backtest mode: virtual execution time — `candle.timestamp` of the candle
   *   being processed (not wall-clock time).
   * - Live mode: wall-clock time at the moment of the event.
   *
   * Always equal to `new Date(timestamp)`.
   */
  when: Date;
}

export default ScheduleEventContract;

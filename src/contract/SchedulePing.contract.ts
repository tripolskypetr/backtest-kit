import { ExchangeName } from "../interfaces/Exchange.interface";
import { IScheduledSignalRow, StrategyName } from "../interfaces/Strategy.interface";

/**
 * Contract for schedule ping events during scheduled signal monitoring.
 *
 * Emitted by schedulePingSubject every minute when a scheduled signal is being monitored.
 * Used for tracking scheduled signal lifecycle and custom monitoring logic.
 *
 * Events are emitted only when scheduled signal is active (not cancelled, not activated).
 * Allows users to implement custom cancellation logic via onSchedulePing callback.
 *
 * Consumers:
 * - User callbacks via listenSchedulePing() / listenSchedulePingOnce()
 *
 * @example
 * ```typescript
 * import { listenSchedulePing } from "backtest-kit";
 *
 * // Listen to all schedule ping events
 * listenSchedulePing((event) => {
 *   console.log(`[${event.backtest ? "Backtest" : "Live"}] Schedule Ping for ${event.symbol}`);
 *   console.log(`Strategy: ${event.strategyName}, Exchange: ${event.exchangeName}`);
 *   console.log(`Signal ID: ${event.data.id}, priceOpen: ${event.data.priceOpen}`);
 *   console.log(`Timestamp: ${new Date(event.timestamp).toISOString()}`);
 * });
 *
 * // Wait for specific schedule ping
 * listenSchedulePingOnce(
 *   (event) => event.symbol === "BTCUSDT",
 *   (event) => console.log("BTCUSDT schedule ping received:", event.timestamp)
 * );
 * ```
 */
export interface SchedulePingContract {
  /**
   * Trading pair symbol (e.g., "BTCUSDT").
   * Identifies which market this ping event belongs to.
   */
  symbol: string;

  /**
   * Strategy name that is monitoring this scheduled signal.
   * Identifies which strategy execution this ping event belongs to.
   */
  strategyName: StrategyName;

  /**
   * Exchange name where this scheduled signal is being monitored.
   * Identifies which exchange this ping event belongs to.
   */
  exchangeName: ExchangeName;

  /**
   * Complete scheduled signal row data.
   * Contains all signal information: id, position, priceOpen, priceTakeProfit, priceStopLoss, etc.
   */
  data: IScheduledSignalRow;

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
   * - Live mode: when.getTime() at the moment of ping
   * - Backtest mode: candle.timestamp of the candle being processed
   *
   * @example
   * ```typescript
   * const eventDate = new Date(event.timestamp);
   * console.log(`Ping at: ${eventDate.toISOString()}`);
   * ```
   */
  timestamp: number;
}

export default SchedulePingContract;

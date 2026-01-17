import { ExchangeName } from "../interfaces/Exchange.interface";
import { ISignalRow, StrategyName } from "../interfaces/Strategy.interface";

/**
 * Contract for active ping events during active pending signal monitoring.
 *
 * Emitted by activePingSubject every minute when an active pending signal is being monitored.
 * Used for tracking active signal lifecycle and custom dynamic management logic.
 *
 * Events are emitted only when pending signal is active (not closed yet).
 * Allows users to implement custom management logic via onActivePing callback.
 *
 * Consumers:
 * - User callbacks via listenActivePing() / listenActivePingOnce()
 *
 * @example
 * ```typescript
 * import { listenActivePing } from "backtest-kit";
 *
 * // Listen to all active ping events
 * listenActivePing((event) => {
 *   console.log(`[${event.backtest ? "Backtest" : "Live"}] Active Ping for ${event.symbol}`);
 *   console.log(`Strategy: ${event.strategyName}, Exchange: ${event.exchangeName}`);
 *   console.log(`Signal ID: ${event.data.id}, Position: ${event.data.position}`);
 *   console.log(`Timestamp: ${new Date(event.timestamp).toISOString()}`);
 * });
 *
 * // Wait for specific active ping
 * listenActivePingOnce(
 *   (event) => event.symbol === "BTCUSDT",
 *   (event) => console.log("BTCUSDT active ping received:", event.timestamp)
 * );
 * ```
 */
export interface ActivePingContract {
  /**
   * Trading pair symbol (e.g., "BTCUSDT").
   * Identifies which market this ping event belongs to.
   */
  symbol: string;

  /**
   * Strategy name that is monitoring this active pending signal.
   * Identifies which strategy execution this ping event belongs to.
   */
  strategyName: StrategyName;

  /**
   * Exchange name where this active pending signal is being monitored.
   * Identifies which exchange this ping event belongs to.
   */
  exchangeName: ExchangeName;

  /**
   * Complete pending signal row data.
   * Contains all signal information: id, position, priceOpen, priceTakeProfit, priceStopLoss, etc.
   */
  data: ISignalRow;

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
   * console.log(`Active Ping at: ${eventDate.toISOString()}`);
   * ```
   */
  timestamp: number;
}

export default ActivePingContract;

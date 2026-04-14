import { IPublicSignalRow, StrategyName } from "../interfaces/Strategy.interface";
import { FrameName } from "../interfaces/Frame.interface";
import { ExchangeName } from "../interfaces/Exchange.interface";

/**
 * Contract for signal info notification events.
 *
 * Emitted by signalNotifySubject when a strategy calls commitSignalInfo() to broadcast
 * a user-defined informational message for an open position.
 * Used for custom strategy annotations, debug output, and external notification routing.
 *
 * Consumers:
 * - User callbacks via listenSignalNotify() / listenSignalNotifyOnce()
 *
 * @example
 * ```typescript
 * import { listenSignalNotify } from "backtest-kit";
 *
 * // Listen to all signal info events
 * listenSignalNotify((event) => {
 *   console.log(`[${event.backtest ? "Backtest" : "Live"}] Signal ${event.data.id}: ${event.note}`);
 *   console.log(`Symbol: ${event.symbol}, Price: ${event.currentPrice}`);
 * });
 *
 * // Wait for the first info event on BTCUSDT
 * listenSignalNotifyOnce(
 *   (event) => event.symbol === "BTCUSDT",
 *   (event) => console.log("BTCUSDT info:", event.note)
 * );
 * ```
 */
export interface SignalInfoContract {
  /**
   * Trading pair symbol (e.g., "BTCUSDT").
   * Identifies which market this info event belongs to.
   */
  symbol: string;

  /**
   * Strategy name that generated this signal.
   * Identifies which strategy execution this info event belongs to.
   */
  strategyName: StrategyName;

  /**
   * Exchange name where this signal is being executed.
   * Identifies which exchange this info event belongs to.
   */
  exchangeName: ExchangeName;

  /**
   * Frame name where this signal is being executed.
   * Identifies which frame this info event belongs to (empty string for live mode).
   */
  frameName: FrameName;

  /**
   * Complete signal row data with original prices.
   * Contains all signal information including originalPriceStopLoss, originalPriceTakeProfit, and partialExecuted.
   */
  data: IPublicSignalRow;

  /**
   * Current market price at the moment the info event was emitted.
   */
  currentPrice: number;

  /**
   * User-defined informational note attached to this event.
   * Provided by the strategy when calling commitSignalInfo().
   */
  note: string;

  /**
   * Optional user-defined identifier for correlating this event with external systems.
   * Provided by the strategy when calling commitSignalInfo().
   */
  notificationId?: string;

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
   * - Live mode: when.getTime() at the moment the info event was emitted
   * - Backtest mode: candle.timestamp of the candle that triggered the event
   */
  timestamp: number;
}

export default SignalInfoContract;

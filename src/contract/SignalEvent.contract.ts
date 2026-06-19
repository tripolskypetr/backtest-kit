import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";
import { IPublicSignalRow, StrategyCloseReason, StrategyName } from "../interfaces/Strategy.interface";

/**
 * Contract for pending signal lifecycle events (open and close).
 *
 * Emitted by signalEventSubject when a pending position is opened (action "opened") or closed
 * (action "closed") during tick()/backtest() processing. Lets consumers track the active phase
 * of a signal without subscribing to the full signal stream.
 *
 * Covers every way a position opens (new signal, immediate entry, scheduled activation, user
 * activation) and every way it closes (take_profit / stop_loss / time_expired / user-close /
 * broker fill / order no longer pending).
 *
 * Consumers:
 * - User callbacks via listenSignalEvent() / listenSignalEventOnce()
 *
 * @example
 * ```typescript
 * import { listenSignalEvent } from "backtest-kit";
 *
 * listenSignalEvent((event) => {
 *   if (event.action === "opened") {
 *     console.log(`Opened ${event.symbol} @ ${event.data.priceOpen}`);
 *   } else {
 *     console.log(`Closed ${event.symbol} (reason: ${event.closeReason})`);
 *   }
 * });
 * ```
 */
export interface SignalEventContract {
  /**
   * Lifecycle action for the pending signal.
   * - "opened": a pending position was opened (new signal / immediate / scheduled or user activation)
   * - "closed": the pending position was closed (TP / SL / time_expired / user / broker fill / ping)
   */
  action: "opened" | "closed";

  /**
   * Trading pair symbol (e.g., "BTCUSDT").
   * Identifies which market this event belongs to.
   */
  symbol: string;

  /**
   * Strategy name that owns this pending signal.
   */
  strategyName: StrategyName;

  /**
   * Exchange name where this pending signal lives.
   */
  exchangeName: ExchangeName;

  /**
   * Frame name (timeframe / date range) for the run. Empty string in live mode.
   * Same value as the signal's `frameName` (`data.frameName`).
   */
  frameName: FrameName;

  /**
   * Complete pending signal row data in public form.
   * Contains all signal information: id, position, priceOpen, priceTakeProfit, priceStopLoss,
   * effective entry / trailing SL/TP, PnL, etc.
   */
  data: IPublicSignalRow;

  /**
   * Close reason. Present only when `action === "closed"`:
   * - "take_profit": effective take-profit level reached
   * - "stop_loss": effective stop-loss level reached
   * - "time_expired": position exceeded minuteEstimatedTime
   * - "closed": closed by user (closePending) or because the order is no longer open on the exchange
   *
   * Always undefined when `action === "opened"`.
   */
  closeReason?: StrategyCloseReason;

  /**
   * Current market price of the symbol at the time of the event.
   * For "opened" this is the effective entry (priceOpen); for "closed" the close price.
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
}

export default SignalEventContract;

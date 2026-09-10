import { IPublicSignalRow, StrategyName } from "../interfaces/Strategy.interface";
import { PartialLevel } from "../interfaces/Partial.interface";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";

/**
 * Contract for partial loss level events.
 *
 * Emitted by partialLossSubject when a signal reaches a loss level milestone (-10%, -20%, -30%, etc).
 * Used for tracking partial stop-loss execution and monitoring strategy drawdown.
 *
 * Events are emitted only once per level per signal (Set-based deduplication in ClientPartial).
 * Multiple levels can be emitted in a single tick if price drops significantly.
 *
 * Consumers:
 * - PartialMarkdownService: Accumulates events for report generation
 * - User callbacks via listenPartialLoss() / listenPartialLossOnce()
 *
 * @example
 * ```typescript
 * import { listenPartialLoss } from "backtest-kit";
 *
 * // Listen to all partial loss events
 * listenPartialLoss((event) => {
 *   console.log(`[${event.backtest ? "Backtest" : "Live"}] Signal ${event.data.id} reached -${event.level}% loss`);
 *   console.log(`Symbol: ${event.symbol}, Price: ${event.currentPrice}`);
 *   console.log(`Position: ${event.data.position}, Entry: ${event.data.priceOpen}`);
 *
 *   // Alert on significant loss
 *   if (event.level >= 30 && !event.backtest) {
 *     console.warn("HIGH LOSS ALERT:", event.data.id);
 *   }
 * });
 *
 * // Wait for first 20% loss level
 * listenPartialLossOnce(
 *   (event) => event.level === 20,
 *   (event) => console.log("20% loss reached:", event.data.id)
 * );
 * ```
 */
export interface PartialLossContract {
  /**
   * Trading pair symbol (e.g., "BTCUSDT").
   * Identifies which market this loss event belongs to.
   */
  symbol: string;

  /**
   * Strategy name that generated this signal.
   * Identifies which strategy execution this loss event belongs to.
   */
  strategyName: StrategyName;

  /**
   * Exchange name where this signal is being executed.
   * Identifies which exchange this loss event belongs to.
   */
  exchangeName: ExchangeName;

  /**
   * Frame name where this signal is being executed.
   * Identifies which frame this loss event belongs to (empty string for live mode).
   */
  frameName: FrameName;

  /**
   * Complete signal row data with original prices.
   * Contains all signal information including originalPriceStopLoss, originalPriceTakeProfit, and partialExecuted.
   */
  data: IPublicSignalRow;

  /**
   * Current market price at which this loss level was reached.
   * Used to calculate actual loss percentage.
   */
  currentPrice: number;

  /**
   * Loss level milestone reached (10, 20, 30, 40, 50, 60, 70, 80, 90, or 100).
   * Represents percentage loss relative to entry price (absolute value).
   *
   * Note: Stored as positive number, but represents negative loss.
   * level=20 means -20% loss from entry price.
   *
   * @example
   * ```typescript
   * // If entry was $50000 and level is 20:
   * // currentPrice <= $40000 (-20% loss)
   * // Level is stored as 20, not -20
   * ```
   */
  level: PartialLevel;

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
   * - Live mode: when.getTime() at the moment loss level was detected
   * - Backtest mode: candle.timestamp of the candle that triggered the level
   *
   * @example
   * ```typescript
   * const eventDate = new Date(event.timestamp);
   * console.log(`Loss reached at: ${eventDate.toISOString()}`);
   *
   * // Calculate time in loss
   * const entryTime = event.data.pendingAt;
   * const timeInLoss = event.timestamp - entryTime;
   * console.log(`In loss for ${timeInLoss / 1000 / 60} minutes`);
   * ```
   */
  timestamp: number;

  /**
   * Event time as a `Date` instance.
   *
   * - Backtest mode: virtual execution time — `candle.timestamp` of the candle
   *   that triggered the level (not wall-clock time).
   * - Live mode: wall-clock time at the moment the loss level was detected.
   *
   * Always equal to `new Date(timestamp)`.
   */
  when: Date;
}

export default PartialLossContract;

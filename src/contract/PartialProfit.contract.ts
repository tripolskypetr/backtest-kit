import { ISignalRow } from "../interfaces/Strategy.interface";
import { PartialLevel } from "../interfaces/Partial.interface";

/**
 * Contract for partial profit level events.
 *
 * Emitted by partialProfitSubject when a signal reaches a profit level milestone (10%, 20%, 30%, etc).
 * Used for tracking partial take-profit execution and monitoring strategy performance.
 *
 * Events are emitted only once per level per signal (Set-based deduplication in ClientPartial).
 * Multiple levels can be emitted in a single tick if price jumps significantly.
 *
 * Consumers:
 * - PartialMarkdownService: Accumulates events for report generation
 * - User callbacks via listenPartialProfit() / listenPartialProfitOnce()
 *
 * @example
 * ```typescript
 * import { listenPartialProfit } from "backtest-kit";
 *
 * // Listen to all partial profit events
 * listenPartialProfit((event) => {
 *   console.log(`[${event.backtest ? "Backtest" : "Live"}] Signal ${event.data.id} reached ${event.level}% profit`);
 *   console.log(`Symbol: ${event.symbol}, Price: ${event.currentPrice}`);
 *   console.log(`Position: ${event.data.position}, Entry: ${event.data.priceOpen}`);
 * });
 *
 * // Wait for first 50% profit level
 * listenPartialProfitOnce(
 *   (event) => event.level === 50,
 *   (event) => console.log("50% profit reached:", event.data.id)
 * );
 * ```
 */
export interface PartialProfitContract {
  /**
   * Trading pair symbol (e.g., "BTCUSDT").
   * Identifies which market this profit event belongs to.
   */
  symbol: string;

  /**
   * Strategy name that generated this signal.
   * Identifies which strategy execution this profit event belongs to.
   */
  strategyName: string;

  /**
   * Exchange name where this signal is being executed.
   * Identifies which exchange this profit event belongs to.
   */
  exchangeName: string;

  /**
   * Complete signal row data.
   * Contains all signal information: id, position, priceOpen, priceTakeProfit, priceStopLoss, etc.
   */
  data: ISignalRow;

  /**
   * Current market price at which this profit level was reached.
   * Used to calculate actual profit percentage.
   */
  currentPrice: number;

  /**
   * Profit level milestone reached (10, 20, 30, 40, 50, 60, 70, 80, 90, or 100).
   * Represents percentage profit relative to entry price.
   *
   * @example
   * ```typescript
   * // If entry was $50000 and level is 20:
   * // currentPrice >= $60000 (20% profit)
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
   * - Live mode: when.getTime() at the moment profit level was detected
   * - Backtest mode: candle.timestamp of the candle that triggered the level
   *
   * @example
   * ```typescript
   * const eventDate = new Date(event.timestamp);
   * console.log(`Profit reached at: ${eventDate.toISOString()}`);
   * ```
   */
  timestamp: number;
}

export default PartialProfitContract;

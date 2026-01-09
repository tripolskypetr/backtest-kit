import { ISignalRow, StrategyName } from "../interfaces/Strategy.interface";
import { FrameName } from "../interfaces/Frame.interface";
import { ExchangeName } from "../interfaces/Exchange.interface";

/**
 * Contract for breakeven events.
 *
 * Emitted by breakevenSubject when a signal's stop-loss is moved to breakeven (entry price).
 * Used for tracking risk reduction milestones and monitoring strategy safety.
 *
 * Events are emitted only once per signal (idempotent - protected by ClientBreakeven state).
 * Breakeven is triggered when price moves far enough in profit direction to cover transaction costs.
 *
 * Consumers:
 * - BreakevenMarkdownService: Accumulates events for report generation
 * - User callbacks via listenBreakeven() / listenBreakevenOnce()
 *
 * @example
 * ```typescript
 * import { listenBreakeven } from "backtest-kit";
 *
 * // Listen to all breakeven events
 * listenBreakeven((event) => {
 *   console.log(`[${event.backtest ? "Backtest" : "Live"}] Signal ${event.data.id} moved to breakeven`);
 *   console.log(`Symbol: ${event.symbol}, Price: ${event.currentPrice}`);
 *   console.log(`Position: ${event.data.position}, Entry: ${event.data.priceOpen}`);
 *   console.log(`Original SL: ${event.data.priceStopLoss}, New SL: ${event.data.priceOpen}`);
 * });
 *
 * // Wait for specific signal to reach breakeven
 * listenBreakevenOnce(
 *   (event) => event.data.id === "target-signal-id",
 *   (event) => console.log("Signal reached breakeven:", event.data.id)
 * );
 * ```
 */
export interface BreakevenContract {
  /**
   * Trading pair symbol (e.g., "BTCUSDT").
   * Identifies which market this breakeven event belongs to.
   */
  symbol: string;

  /**
   * Strategy name that generated this signal.
   * Identifies which strategy execution this breakeven event belongs to.
   */
  strategyName: StrategyName;

  /**
   * Exchange name where this signal is being executed.
   * Identifies which exchange this breakeven event belongs to.
   */
  exchangeName: ExchangeName;

  /**
   * Frame name where this signal is being executed.
   * Identifies which frame this breakeven event belongs to (empty string for live mode).
   */
  frameName: FrameName;

  /**
   * Complete signal row data.
   * Contains all signal information: id, position, priceOpen, priceTakeProfit, priceStopLoss, etc.
   */
  data: ISignalRow;

  /**
   * Current market price at which breakeven was triggered.
   * Used to verify threshold calculation.
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
   * - Live mode: when.getTime() at the moment breakeven was set
   * - Backtest mode: candle.timestamp of the candle that triggered breakeven
   *
   * @example
   * ```typescript
   * const eventDate = new Date(event.timestamp);
   * console.log(`Breakeven set at: ${eventDate.toISOString()}`);
   * ```
   */
  timestamp: number;
}

export default BreakevenContract;

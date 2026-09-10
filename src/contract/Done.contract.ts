import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";
import { StrategyName } from "../interfaces/Strategy.interface";

/**
 * Contract for background execution completion events.
 *
 * Emitted when Live.background() or Backtest.background() completes execution.
 * Contains metadata about the completed execution context.
 *
 * @example
 * ```typescript
 * import { listenDone } from "backtest-kit";
 *
 * listenDone((event) => {
 *   if (event.backtest) {
 *     console.log("Backtest completed:", event.symbol);
 *   } else {
 *     console.log("Live trading completed:", event.symbol);
 *   }
 * });
 * ```
 */
export interface DoneContract {
    /** exchangeName - Name of the exchange used in execution */
    exchangeName: ExchangeName;
    /** strategyName - Name of the strategy that completed */
    strategyName: StrategyName;
    /** frameName - Name of the frame (empty string for live mode) */
    frameName: FrameName;
    /** backtest - True if backtest mode, false if live mode */
    backtest: boolean;
    /** symbol - Trading symbol (e.g., "BTCUSDT") */
    symbol: string;
    /**
     * Completion time as a `Date` instance.
     *
     * - Backtest mode: virtual execution time — the last processed candle
     *   timestamp from `TimeMetaService`, falling back to the frame's planned
     *   start date if no candle was processed.
     * - Live mode: time of the last processed tick from `TimeMetaService`.
     */
    when: Date;
}

export default DoneContract;

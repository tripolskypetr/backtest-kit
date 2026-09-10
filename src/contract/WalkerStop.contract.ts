import { WalkerName } from "../interfaces/Walker.interface";
import { StrategyName } from "../interfaces/Strategy.interface";

/**
 * Contract for walker stop signal events.
 *
 * Emitted when Walker.stop() is called to interrupt a running walker.
 * Contains metadata about which walker and strategy should be stopped.
 *
 * Supports multiple walkers running on the same symbol simultaneously
 * by including walkerName for filtering.
 *
 * @example
 * ```typescript
 * import { walkerStopSubject } from "backtest-kit";
 *
 * walkerStopSubject
 *   .filter((event) => event.symbol === "BTCUSDT")
 *   .connect((event) => {
 *     console.log("Walker stopped:", event.walkerName);
 *     console.log("Strategy:", event.strategyName);
 *   });
 * ```
 */
export interface WalkerStopContract {
    /** symbol - Trading symbol (e.g., "BTCUSDT") */
    symbol: string;
    /** strategyName - Name of the strategy to stop */
    strategyName: StrategyName;
    /** walkerName - Name of the walker to stop (for filtering) */
    walkerName: WalkerName;
    /**
     * Virtual execution time as a `Date` instance: the last processed candle
     * timestamp of the strategy being stopped from `TimeMetaService`, falling
     * back to the frame's planned start date. Never wall-clock time.
     */
    when: Date;
}

export default WalkerStopContract;

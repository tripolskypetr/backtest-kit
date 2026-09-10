import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";
import { WalkerName } from "../interfaces/Walker.interface";

/**
 * Contract for walker progress events.
 *
 * Emitted during Walker.background() execution to track progress.
 * Contains information about total strategies, processed strategies, and completion percentage.
 *
 * @example
 * ```typescript
 * import { listenWalkerProgress } from "backtest-kit";
 *
 * listenWalkerProgress((event) => {
 *   console.log(`Progress: ${(event.progress * 100).toFixed(2)}%`);
 *   console.log(`Processed: ${event.processedStrategies} / ${event.totalStrategies}`);
 * });
 * ```
 */
export interface ProgressWalkerContract {
    /** walkerName - Name of the walker being executed */
    walkerName: WalkerName;
    /** exchangeName - Name of the exchange used in execution */
    exchangeName: ExchangeName;
    /** frameName - Name of the frame being used */
    frameName: FrameName;
    /** symbol - Trading symbol (e.g., "BTCUSDT") */
    symbol: string;
    /** totalStrategies - Total number of strategies to process */
    totalStrategies: number;
    /** processedStrategies - Number of strategies processed so far */
    processedStrategies: number;
    /** progress - Completion percentage from 0.0 to 1.0 */
    progress: number;
    /**
     * Virtual execution time as a `Date` instance: the last processed candle
     * timestamp of the just-completed strategy backtest from `TimeMetaService`,
     * falling back to the frame's planned start date. Never wall-clock time.
     */
    when: Date;
}

export default ProgressWalkerContract;

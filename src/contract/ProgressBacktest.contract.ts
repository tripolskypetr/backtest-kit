import { ExchangeName } from "../interfaces/Exchange.interface";
import { StrategyName } from "../interfaces/Strategy.interface";

/**
 * Contract for backtest progress events.
 *
 * Emitted during Backtest.background() execution to track progress.
 * Contains information about total frames, processed frames, and completion percentage.
 *
 * @example
 * ```typescript
 * import { listenBacktestProgress } from "backtest-kit";
 *
 * listenBacktestProgress((event) => {
 *   console.log(`Progress: ${(event.progress * 100).toFixed(2)}%`);
 *   console.log(`Processed: ${event.processedFrames} / ${event.totalFrames}`);
 * });
 * ```
 */
export interface ProgressBacktestContract {
    /** exchangeName - Name of the exchange used in execution */
    exchangeName: ExchangeName;
    /** strategyName - Name of the strategy being executed */
    strategyName: StrategyName;
    /** symbol - Trading symbol (e.g., "BTCUSDT") */
    symbol: string;
    /** totalFrames - Total number of frames to process */
    totalFrames: number;
    /** processedFrames - Number of frames processed so far */
    processedFrames: number;
    /** progress - Completion percentage from 0.0 to 1.0 */
    progress: number;
    /**
     * Virtual execution time as a `Date` instance: the timeframe being
     * processed when this progress event was emitted (frame end time for the
     * final 100% event). Never wall-clock time.
     */
    when: Date;
}

export default ProgressBacktestContract;

/**
 * Contract for optimizer progress events.
 *
 * Emitted during optimizer execution to track progress.
 * Contains information about total sources, processed sources, and completion percentage.
 *
 * @example
 * ```typescript
 * import { listenOptimizerProgress } from "@backtest-kit/ollama";
 *
 * listenOptimizerProgress((event) => {
 *   console.log(`Progress: ${(event.progress * 100).toFixed(2)}%`);
 *   console.log(`Processed: ${event.processedSources} / ${event.totalSources}`);
 * });
 * ```
 */
export interface ProgressOptimizerContract {
    /** optimizerName - Name of the optimizer being executed */
    optimizerName: string;
    /** symbol - Trading symbol (e.g., "BTCUSDT") */
    symbol: string;
    /** totalSources - Total number of sources to process */
    totalSources: number;
    /** processedSources - Number of sources processed so far */
    processedSources: number;
    /** progress - Completion percentage from 0.0 to 1.0 */
    progress: number;
}

export default ProgressOptimizerContract;

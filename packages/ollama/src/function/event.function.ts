import { progressOptimizerEmitter, errorEmitter } from "../config/emitters";
import ProgressOptimizerContract from "../contract/ProgressOptimizer.contract";

/**
 * Subscribe to optimizer progress events.
 * Receives updates during optimizer execution with progress percentage.
 *
 * @param callback - Function called on each progress update
 * @returns Unsubscribe function
 *
 * @example
 * ```typescript
 * const unsub = listenOptimizerProgress((event) => {
 *   console.log(`Progress: ${(event.progress * 100).toFixed(2)}%`);
 *   console.log(`Processed: ${event.processedSources} / ${event.totalSources}`);
 * });
 * // Later: unsub();
 * ```
 */
export function listenOptimizerProgress(
  callback: (event: ProgressOptimizerContract) => void
) {
  return progressOptimizerEmitter.subscribe(callback);
}

/**
 * Subscribe to error events.
 * Receives errors from optimizer operations.
 *
 * @param callback - Function called on each error
 * @returns Unsubscribe function
 *
 * @example
 * ```typescript
 * const unsub = listenError((error) => {
 *   console.error("Error occurred:", error);
 * });
 * // Later: unsub();
 * ```
 */
export function listenError(callback: (error: Error) => void) {
  return errorEmitter.subscribe(callback);
}

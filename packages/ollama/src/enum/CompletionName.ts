/**
 * Enumeration of completion strategy types.
 *
 * Defines unique identifiers for different completion execution modes.
 * Used internally for routing completion requests to appropriate handlers.
 *
 * @example
 * ```typescript
 * import { CompletionName } from '@backtest-kit/ollama';
 *
 * const completionType = CompletionName.RunnerCompletion;
 * ```
 */
export enum CompletionName {
  /** Standard completion mode (full response at once) */
  RunnerCompletion = "runner_completion",
  /** Streaming completion mode (progressive response chunks) */
  RunnerStreamCompletion = "runner_stream_completion",
  /** Outline completion mode (structured JSON with schema validation) */
  RunnerOutlineCompletion = "runner_outline_completion",
}

export default CompletionName;

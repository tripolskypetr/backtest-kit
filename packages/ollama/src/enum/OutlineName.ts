/**
 * Enumeration of supported JSON schema outlines.
 *
 * Defines unique identifiers for structured output schemas used with
 * LLM providers. Outlines enforce JSON schema validation for critical
 * data structures like trading signals.
 *
 * @example
 * ```typescript
 * import { OutlineName } from '@backtest-kit/ollama';
 *
 * const outlineName = OutlineName.SignalOutline;
 * ```
 */
export enum OutlineName {
    /** Trading signal JSON schema for position, TP/SL, and risk parameters */
    SignalOutline = "signal_outline",
}

export default OutlineName;

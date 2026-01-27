import { scoped } from "di-scoped";
import { InferenceName } from "../../../enum/InferenceName";

/**
 * Execution context for AI inference operations.
 *
 * Encapsulates the configuration needed to execute an AI completion request:
 * - inference: Which AI provider to use (OpenAI, Claude, Ollama, etc.)
 * - model: The specific model to use (e.g., "gpt-4", "claude-3-5-sonnet")
 * - apiKey: Authentication credential(s) for the provider
 *
 * @example
 * ```typescript
 * const context: IContext = {
 *   inference: InferenceName.ClaudeInference,
 *   model: "claude-3-5-sonnet-20240620",
 *   apiKey: "sk-ant-..."
 * };
 * ```
 */
export interface IContext {
    /** AI inference provider identifier */
    inference: InferenceName;
    /** Model name/identifier for the provider */
    model: string;
    /** API key or array of keys for token rotation */
    apiKey?: string | string[];
}

/**
 * Scoped context service for isolated execution contexts.
 *
 * Provides context isolation using async local storage through the di-scoped library.
 * Each operation runs with its own context containing provider, model, and API key configuration.
 * This enables multi-tenant scenarios where different requests use different AI providers or keys.
 *
 * Key features:
 * - Scoped context isolation per execution
 * - Support for single or multiple API keys (token rotation)
 * - Thread-safe context propagation
 * - Automatic cleanup after execution
 *
 * @example
 * ```typescript
 * import ContextService from "./services/base/ContextService";
 *
 * // Execute operation within scoped context
 * const result = await ContextService.runInContext(async () => {
 *   // Code here has access to the context
 *   const model = contextService.context.model;
 *   return await someAiOperation();
 * }, {
 *   inference: InferenceName.GPT5Inference,
 *   model: "gpt-5o-mini",
 *   apiKey: "sk-..."
 * });
 * ```
 */
export const ContextService = scoped(
  class {
    constructor(readonly context: IContext) {}
  }
);

/**
 * Type alias for ContextService instances.
 */
export type TContextService = InstanceType<typeof ContextService>;

export default ContextService;

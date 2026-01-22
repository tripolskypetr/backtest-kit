import {
  ISwarmCompletionArgs,
  IOutlineCompletionArgs,
  ISwarmMessage,
  IOutlineMessage,
} from "agent-swarm-kit";
import ContextService, { IContext } from "../base/ContextService";
import { inject } from "../../core/di";
import RunnerPrivateService from "../private/RunnerPrivateService";
import { TYPES } from "../../core/types";
import LoggerService from "../base/LoggerService";

/**
 * Public-facing service for AI inference operations with context management.
 *
 * Provides context-scoped access to AI completion operations.
 * Acts as a facade that wraps RunnerPrivateService methods with context isolation.
 * Each operation runs within a dedicated execution context to ensure proper API key
 * and model configuration isolation.
 *
 * Key features:
 * - Context-isolated execution for multi-tenant scenarios
 * - Support for standard, streaming, and structured (outline) completions
 * - Automatic context propagation to private service layer
 * - Logging integration for operation tracking
 *
 * @example
 * ```typescript
 * import { engine } from "./lib";
 * import { InferenceName } from "./enum/InferenceName";
 *
 * const context = {
 *   inference: InferenceName.ClaudeInference,
 *   model: "claude-3-5-sonnet-20240620",
 *   apiKey: "sk-ant-..."
 * };
 *
 * // Standard completion
 * const result = await engine.runnerPublicService.getCompletion({
 *   messages: [{ role: "user", content: "Analyze this trade..." }]
 * }, context);
 *
 * // Streaming completion
 * const stream = await engine.runnerPublicService.getStreamCompletion({
 *   messages: [{ role: "user", content: "Generate signal..." }]
 * }, context);
 *
 * // Structured outline completion
 * const outline = await engine.runnerPublicService.getOutlineCompletion({
 *   messages: [{ role: "user", content: "Trading decision..." }]
 * }, context);
 * ```
 */
export class RunnerPublicService {
  /** Private service handling AI provider operations */
  private readonly runnerPrivateService = inject<RunnerPrivateService>(
    TYPES.runnerPrivateService
  );

  /** Logger service for operation tracking */
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * Executes a standard AI completion within the specified context.
   *
   * @param params - Completion parameters including messages and options
   * @param context - Execution context with inference provider, model, and API key
   * @returns Promise resolving to AI response message
   *
   * @example
   * ```typescript
   * const result = await runnerPublicService.getCompletion({
   *   messages: [
   *     { role: "system", content: "You are a trading analyst" },
   *     { role: "user", content: "Analyze BTC/USDT" }
   *   ]
   * }, {
   *   inference: InferenceName.ClaudeInference,
   *   model: "claude-3-5-sonnet-20240620",
   *   apiKey: "sk-ant-..."
   * });
   * ```
   */
  public getCompletion = async (
    params: ISwarmCompletionArgs,
    context: IContext
  ): Promise<ISwarmMessage> => {
    this.loggerService.log("runnerPublicService getCompletion");
    return await ContextService.runInContext(async () => {
      return await this.runnerPrivateService.getCompletion(params);
    }, context);
  };

  /**
   * Executes a streaming AI completion within the specified context.
   *
   * Similar to getCompletion but enables streaming mode where supported by the provider.
   * The response is accumulated and returned as a complete message once streaming finishes.
   *
   * @param params - Completion parameters including messages and options
   * @param context - Execution context with inference provider, model, and API key
   * @returns Promise resolving to accumulated AI response message
   *
   * @example
   * ```typescript
   * const result = await runnerPublicService.getStreamCompletion({
   *   messages: [
   *     { role: "user", content: "Generate trading signal for ETH/USDT" }
   *   ]
   * }, {
   *   inference: InferenceName.GPT5Inference,
   *   model: "gpt-5o-mini",
   *   apiKey: "sk-..."
   * });
   * ```
   */
  public getStreamCompletion = async (
    params: ISwarmCompletionArgs,
    context: IContext
  ): Promise<ISwarmMessage> => {
    this.loggerService.log("runnerPublicService getStreamCompletion");
    return await ContextService.runInContext(async () => {
      return await this.runnerPrivateService.getStreamCompletion(params);
    }, context);
  };

  /**
   * Executes a structured outline completion within the specified context.
   *
   * Uses structured output (JSON schema validation) to ensure the AI response
   * conforms to a predefined format. Ideal for extracting structured data
   * from AI responses (e.g., trading signals with specific fields).
   *
   * @param params - Outline completion parameters including messages and schema
   * @param context - Execution context with inference provider, model, and API key
   * @returns Promise resolving to structured AI response
   *
   * @example
   * ```typescript
   * const signal = await runnerPublicService.getOutlineCompletion({
   *   messages: [
   *     { role: "user", content: "Decide position for BTC/USDT" }
   *   ]
   * }, {
   *   inference: InferenceName.DeepseekInference,
   *   model: "deepseek-chat",
   *   apiKey: "sk-..."
   * });
   * // Returns: { position: "long", price_open: 50000, ... }
   * ```
   */
  public getOutlineCompletion = async (
    params: IOutlineCompletionArgs,
    context: IContext
  ): Promise<IOutlineMessage> => {
    this.loggerService.log("runnerPublicService getOutlineCompletion");
    return await ContextService.runInContext(async () => {
      return await this.runnerPrivateService.getOutlineCompletion(params);
    }, context);
  };
}

export default RunnerPublicService;

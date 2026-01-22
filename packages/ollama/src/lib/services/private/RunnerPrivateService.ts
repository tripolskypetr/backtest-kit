import { memoize, ToolRegistry } from "functools-kit";
import { InferenceName } from "../../../enum/InferenceName";
import IProvider from "../../../interface/Provider.interface";
import { inject } from "../../core/di";
import { TContextService } from "../base/ContextService";
import { TYPES } from "../../core/types";
import {
  ISwarmCompletionArgs,
  IOutlineCompletionArgs,
  ISwarmMessage,
  IOutlineMessage,
} from "agent-swarm-kit";
import LoggerService from "../base/LoggerService";
import { ILogger } from "../../../interface/Logger.interface";

/**
 * Type for AI provider class constructor.
 * Each provider must accept a context service and logger in its constructor.
 */
type RunnerClass = new (contextService: TContextService, logger: ILogger) => IProvider;

/**
 * Private service managing AI inference provider registry and execution.
 *
 * Coordinates AI operations across multiple inference providers (OpenAI, Claude, Ollama, etc.).
 * Maintains a registry of provider implementations and instantiates them on-demand.
 * Uses memoization to cache provider instances for better performance.
 *
 * Key features:
 * - Dynamic provider registration for multiple AI services
 * - Lazy instantiation with memoization for performance
 * - Context-aware provider selection based on inference type
 * - Support for standard, streaming, and structured completions
 * - Type-safe provider interface
 *
 * @example
 * ```typescript
 * // Provider registration (typically done at startup)
 * const runnerPrivate = inject<RunnerPrivateService>(TYPES.runnerPrivateService);
 * runnerPrivate.registerRunner(InferenceName.ClaudeInference, ClaudeProvider);
 * runnerPrivate.registerRunner(InferenceName.GPT5Inference, GPT5Provider);
 *
 * // Provider usage (automatically selected based on context)
 * const result = await runnerPrivate.getCompletion({
 *   messages: [{ role: "user", content: "Analyze trade" }]
 * });
 * ```
 */
export class RunnerPrivateService implements IProvider {
  /** Context service providing execution context (model, API key, provider) */
  private readonly contextService = inject<TContextService>(
    TYPES.contextService
  );

  /** Logger service for operation tracking */
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  /** Registry storing provider class constructors by inference name */
  private _registry = new ToolRegistry<Record<InferenceName, RunnerClass>>(
    "runner_registry"
  );

  /**
   * Memoized provider instance getter.
   * Creates and caches provider instances per inference type.
   */
  private getRunner = memoize(
    ([inference]) => `${inference}`,
    (inference: InferenceName) => {
      const Runner = this._registry.get(inference);
      return new Runner(this.contextService, this.loggerService);
    }
  );

  /**
   * Executes a standard AI completion using the provider specified in context.
   *
   * @param params - Completion parameters including messages and options
   * @returns Promise resolving to AI response message
   *
   * @example
   * ```typescript
   * const result = await runnerPrivateService.getCompletion({
   *   messages: [
   *     { role: "system", content: "You are a trading assistant" },
   *     { role: "user", content: "Analyze BTC market" }
   *   ]
   * });
   * ```
   */
  public getCompletion = async (
    params: ISwarmCompletionArgs
  ): Promise<ISwarmMessage> => {
    this.loggerService.log("runnerPrivateService getCompletion");
    const runner = this.getRunner(this.contextService.context.inference);
    return await runner.getCompletion(params);
  };

  /**
   * Executes a streaming AI completion using the provider specified in context.
   *
   * @param params - Completion parameters including messages and options
   * @returns Promise resolving to accumulated AI response message
   *
   * @example
   * ```typescript
   * const result = await runnerPrivateService.getStreamCompletion({
   *   messages: [{ role: "user", content: "Generate signal" }]
   * });
   * ```
   */
  public getStreamCompletion = async (
    params: ISwarmCompletionArgs
  ): Promise<ISwarmMessage> => {
    this.loggerService.log("runnerPrivateService getStreamCompletion");
    const runner = this.getRunner(this.contextService.context.inference);
    return await runner.getStreamCompletion(params);
  };

  /**
   * Executes a structured outline completion using the provider specified in context.
   *
   * @param params - Outline completion parameters including messages and schema
   * @returns Promise resolving to structured AI response
   *
   * @example
   * ```typescript
   * const signal = await runnerPrivateService.getOutlineCompletion({
   *   messages: [{ role: "user", content: "Trading decision for ETH" }]
   * });
   * ```
   */
  public getOutlineCompletion = async (
    params: IOutlineCompletionArgs
  ): Promise<IOutlineMessage> => {
    this.loggerService.log("runnerPrivateService getOutlineCompletion");
    const runner = this.getRunner(this.contextService.context.inference);
    return await runner.getOutlineCompletion(params);
  };

  /**
   * Registers a new AI provider implementation in the registry.
   *
   * @param name - Inference provider identifier
   * @param runner - Provider class constructor
   *
   * @example
   * ```typescript
   * runnerPrivateService.registerRunner(
   *   InferenceName.ClaudeInference,
   *   ClaudeProvider
   * );
   * ```
   */
  public registerRunner = (name: InferenceName, runner: RunnerClass) => {
    this._registry = this._registry.register(name, runner);
  };
}

export default RunnerPrivateService;

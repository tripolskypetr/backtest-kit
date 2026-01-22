import { IOutlineMessage, ISwarmCompletionArgs, ISwarmMessage, IOutlineCompletionArgs } from 'agent-swarm-kit';
import { ZodType } from 'zod';
import { ISignalDto } from 'backtest-kit';
import * as di_scoped from 'di-scoped';

/**
 * Generate structured trading signal from Ollama models.
 *
 * Supports token rotation by passing multiple API keys. Automatically enforces
 * the signal JSON schema defined in Signal.schema.ts.
 *
 * @param messages - Array of outline messages (user/assistant/system)
 * @param model - Ollama model name (e.g., "llama3.3:70b")
 * @param apiKey - Single API key or array of keys for rotation
 * @returns Promise resolving to structured trading signal
 *
 * @example
 * ```typescript
 * import { ollama } from '@backtest-kit/ollama';
 *
 * const signal = await ollama(messages, 'llama3.3:70b', ['key1', 'key2']);
 * console.log(signal.position); // "long" | "short" | "wait"
 * ```
 */
declare const ollama: (messages: IOutlineMessage[], model: string, apiKey?: string | string[]) => Promise<{
    id: string;
    position: "long" | "short";
    minuteEstimatedTime: number;
    priceStopLoss: number;
    priceTakeProfit: number;
    note: string;
    priceOpen: number;
}>;
/**
 * Generate structured trading signal from Grok models.
 *
 * Uses xAI Grok models through direct API access. Does NOT support token rotation.
 *
 * @param messages - Array of outline messages (user/assistant/system)
 * @param model - Grok model name (e.g., "grok-beta")
 * @param apiKey - Single API key (token rotation not supported)
 * @returns Promise resolving to structured trading signal
 * @throws Error if apiKey is an array (token rotation not supported)
 *
 * @example
 * ```typescript
 * import { grok } from '@backtest-kit/ollama';
 *
 * const signal = await grok(messages, 'grok-beta', process.env.GROK_API_KEY);
 * ```
 */
declare const grok: (messages: IOutlineMessage[], model: string, apiKey?: string | string[]) => Promise<{
    id: string;
    position: "long" | "short";
    minuteEstimatedTime: number;
    priceStopLoss: number;
    priceTakeProfit: number;
    note: string;
    priceOpen: number;
}>;
/**
 * Generate structured trading signal from Hugging Face models.
 *
 * Uses HuggingFace Router API for model access. Does NOT support token rotation.
 *
 * @param messages - Array of outline messages (user/assistant/system)
 * @param model - HuggingFace model name
 * @param apiKey - Single API key (token rotation not supported)
 * @returns Promise resolving to structured trading signal
 *
 * @example
 * ```typescript
 * import { hf } from '@backtest-kit/ollama';
 *
 * const signal = await hf(messages, 'meta-llama/Llama-3-70b', process.env.HF_API_KEY);
 * ```
 */
declare const hf: (messages: IOutlineMessage[], model: string, apiKey?: string | string[]) => Promise<{
    id: string;
    position: "long" | "short";
    minuteEstimatedTime: number;
    priceStopLoss: number;
    priceTakeProfit: number;
    note: string;
    priceOpen: number;
}>;
/**
 * Generate structured trading signal from Claude models.
 *
 * Uses Anthropic Claude through OpenAI-compatible API. Does NOT support token rotation.
 *
 * @param messages - Array of outline messages (user/assistant/system)
 * @param model - Claude model name (e.g., "claude-3-5-sonnet-20241022")
 * @param apiKey - Single API key (token rotation not supported)
 * @returns Promise resolving to structured trading signal
 * @throws Error if apiKey is an array (token rotation not supported)
 *
 * @example
 * ```typescript
 * import { claude } from '@backtest-kit/ollama';
 *
 * const signal = await claude(messages, 'claude-3-5-sonnet-20241022', process.env.ANTHROPIC_API_KEY);
 * ```
 */
declare const claude: (messages: IOutlineMessage[], model: string, apiKey?: string | string[]) => Promise<{
    id: string;
    position: "long" | "short";
    minuteEstimatedTime: number;
    priceStopLoss: number;
    priceTakeProfit: number;
    note: string;
    priceOpen: number;
}>;
/**
 * Generate structured trading signal from OpenAI GPT models.
 *
 * Uses official OpenAI SDK with JSON schema enforcement. Does NOT support token rotation.
 *
 * @param messages - Array of outline messages (user/assistant/system)
 * @param model - OpenAI model name (e.g., "gpt-4o", "gpt-4-turbo")
 * @param apiKey - Single API key (token rotation not supported)
 * @returns Promise resolving to structured trading signal
 * @throws Error if apiKey is an array (token rotation not supported)
 *
 * @example
 * ```typescript
 * import { gpt5 } from '@backtest-kit/ollama';
 *
 * const signal = await gpt5(messages, 'gpt-4o', process.env.OPENAI_API_KEY);
 * ```
 */
declare const gpt5: (messages: IOutlineMessage[], model: string, apiKey?: string | string[]) => Promise<{
    id: string;
    position: "long" | "short";
    minuteEstimatedTime: number;
    priceStopLoss: number;
    priceTakeProfit: number;
    note: string;
    priceOpen: number;
}>;
/**
 * Generate structured trading signal from DeepSeek models.
 *
 * Uses DeepSeek AI through OpenAI-compatible API. Does NOT support token rotation.
 *
 * @param messages - Array of outline messages (user/assistant/system)
 * @param model - DeepSeek model name (e.g., "deepseek-chat")
 * @param apiKey - Single API key (token rotation not supported)
 * @returns Promise resolving to structured trading signal
 * @throws Error if apiKey is an array (token rotation not supported)
 *
 * @example
 * ```typescript
 * import { deepseek } from '@backtest-kit/ollama';
 *
 * const signal = await deepseek(messages, 'deepseek-chat', process.env.DEEPSEEK_API_KEY);
 * ```
 */
declare const deepseek: (messages: IOutlineMessage[], model: string, apiKey?: string | string[]) => Promise<{
    id: string;
    position: "long" | "short";
    minuteEstimatedTime: number;
    priceStopLoss: number;
    priceTakeProfit: number;
    note: string;
    priceOpen: number;
}>;
/**
 * Generate structured trading signal from Mistral AI models.
 *
 * Uses Mistral AI through OpenAI-compatible API. Does NOT support token rotation.
 *
 * @param messages - Array of outline messages (user/assistant/system)
 * @param model - Mistral model name (e.g., "mistral-large-latest")
 * @param apiKey - Single API key (token rotation not supported)
 * @returns Promise resolving to structured trading signal
 * @throws Error if apiKey is an array (token rotation not supported)
 *
 * @example
 * ```typescript
 * import { mistral } from '@backtest-kit/ollama';
 *
 * const signal = await mistral(messages, 'mistral-large-latest', process.env.MISTRAL_API_KEY);
 * ```
 */
declare const mistral: (messages: IOutlineMessage[], model: string, apiKey?: string | string[]) => Promise<{
    id: string;
    position: "long" | "short";
    minuteEstimatedTime: number;
    priceStopLoss: number;
    priceTakeProfit: number;
    note: string;
    priceOpen: number;
}>;
/**
 * Generate structured trading signal from Perplexity AI models.
 *
 * Uses Perplexity AI through OpenAI-compatible API. Does NOT support token rotation.
 *
 * @param messages - Array of outline messages (user/assistant/system)
 * @param model - Perplexity model name (e.g., "llama-3.1-sonar-huge-128k-online")
 * @param apiKey - Single API key (token rotation not supported)
 * @returns Promise resolving to structured trading signal
 * @throws Error if apiKey is an array (token rotation not supported)
 *
 * @example
 * ```typescript
 * import { perplexity } from '@backtest-kit/ollama';
 *
 * const signal = await perplexity(messages, 'llama-3.1-sonar-huge-128k-online', process.env.PERPLEXITY_API_KEY);
 * ```
 */
declare const perplexity: (messages: IOutlineMessage[], model: string, apiKey?: string | string[]) => Promise<{
    id: string;
    position: "long" | "short";
    minuteEstimatedTime: number;
    priceStopLoss: number;
    priceTakeProfit: number;
    note: string;
    priceOpen: number;
}>;
/**
 * Generate structured trading signal from Cohere models.
 *
 * Uses Cohere AI through OpenAI-compatible API. Does NOT support token rotation.
 *
 * @param messages - Array of outline messages (user/assistant/system)
 * @param model - Cohere model name (e.g., "command-r-plus")
 * @param apiKey - Single API key (token rotation not supported)
 * @returns Promise resolving to structured trading signal
 * @throws Error if apiKey is an array (token rotation not supported)
 *
 * @example
 * ```typescript
 * import { cohere } from '@backtest-kit/ollama';
 *
 * const signal = await cohere(messages, 'command-r-plus', process.env.COHERE_API_KEY);
 * ```
 */
declare const cohere: (messages: IOutlineMessage[], model: string, apiKey?: string | string[]) => Promise<{
    id: string;
    position: "long" | "short";
    minuteEstimatedTime: number;
    priceStopLoss: number;
    priceTakeProfit: number;
    note: string;
    priceOpen: number;
}>;
/**
 * Generate structured trading signal from Alibaba Cloud Qwen models.
 *
 * Uses Alibaba DashScope API through direct HTTP requests. Does NOT support token rotation.
 *
 * @param messages - Array of outline messages (user/assistant/system)
 * @param model - Qwen model name (e.g., "qwen-max")
 * @param apiKey - Single API key (token rotation not supported)
 * @returns Promise resolving to structured trading signal
 * @throws Error if apiKey is an array (token rotation not supported)
 *
 * @example
 * ```typescript
 * import { alibaba } from '@backtest-kit/ollama';
 *
 * const signal = await alibaba(messages, 'qwen-max', process.env.ALIBABA_API_KEY);
 * ```
 */
declare const alibaba: (messages: IOutlineMessage[], model: string, apiKey?: string | string[]) => Promise<{
    id: string;
    position: "long" | "short";
    minuteEstimatedTime: number;
    priceStopLoss: number;
    priceTakeProfit: number;
    note: string;
    priceOpen: number;
}>;
/**
 * Generate structured trading signal from Zhipu AI GLM-4 models.
 *
 * Uses Zhipu AI's GLM-4 through OpenAI-compatible Z.ai API. Does NOT support token rotation.
 * GLM-4 is a powerful Chinese language model with strong reasoning capabilities.
 *
 * @param messages - Array of outline messages (user/assistant/system)
 * @param model - GLM-4 model name (e.g., "glm-4-plus", "glm-4-air")
 * @param apiKey - Single API key (token rotation not supported)
 * @returns Promise resolving to structured trading signal
 * @throws Error if apiKey is an array (token rotation not supported)
 *
 * @example
 * ```typescript
 * import { glm4 } from '@backtest-kit/ollama';
 *
 * const signal = await glm4(messages, 'glm-4-plus', process.env.ZAI_API_KEY);
 * console.log(`Position: ${signal.position}`);
 * console.log(`Entry: ${signal.priceOpen}`);
 * ```
 */
declare const glm4: (messages: IOutlineMessage[], model: string, apiKey?: string | string[]) => Promise<{
    id: string;
    position: "long" | "short";
    minuteEstimatedTime: number;
    priceStopLoss: number;
    priceTakeProfit: number;
    note: string;
    priceOpen: number;
}>;

/**
 * Logger interface for application logging.
 *
 * Provides four logging levels for diagnostic output during LLM operations.
 * Can be implemented with console.log, winston, pino, or any other logging backend.
 *
 * @example
 * ```typescript
 * import { setLogger } from '@backtest-kit/ollama';
 *
 * setLogger({
 *   log: console.log,
 *   debug: console.debug,
 *   info: console.info,
 *   warn: console.warn,
 * });
 * ```
 */
interface ILogger {
    /**
     * General logging for standard messages.
     *
     * @param topic - Log topic/category for filtering
     * @param args - Additional arguments to log
     */
    log(topic: string, ...args: any[]): void;
    /**
     * Debug-level logging for detailed diagnostic information.
     *
     * @param topic - Log topic/category for filtering
     * @param args - Additional arguments to log
     */
    debug(topic: string, ...args: any[]): void;
    /**
     * Info-level logging for informational messages.
     *
     * @param topic - Log topic/category for filtering
     * @param args - Additional arguments to log
     */
    info(topic: string, ...args: any[]): void;
    /**
     * Warning-level logging for non-critical issues.
     *
     * @param topic - Log topic/category for filtering
     * @param args - Additional arguments to log
     */
    warn(topic: string, ...args: any[]): void;
}

/**
 * Sets custom logger implementation for the framework.
 *
 * All log messages from internal services will be forwarded to the provided logger
 * with automatic context injection.
 *
 * @param logger - Custom logger implementing ILogger interface
 *
 * @example
 * ```typescript
 * setLogger({
 *   log: (topic, ...args) => console.log(topic, args),
 *   debug: (topic, ...args) => console.debug(topic, args),
 *   info: (topic, ...args) => console.info(topic, args),
 * });
 * ```
 */
declare const setLogger: (logger: ILogger) => void;

/**
 * Overrides the default signal format schema for LLM-generated trading signals.
 *
 * This function allows customization of the structured output format used by the
 * SignalOutline. It replaces the default signal schema with a custom Zod schema,
 * enabling flexible signal structure definitions while maintaining type safety.
 *
 * The override affects all subsequent signal generation calls using SignalOutline
 * until the application restarts or the schema is overridden again.
 *
 * @template ZodInput - The Zod schema type used for validation and type inference
 *
 * @param {ZodInput} format - Custom Zod schema defining the signal structure.
 *                            Must be a valid Zod type (z.object, z.string, etc.)
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { overrideSignalFormat } from '@backtest-kit/ollama';
 *
 * // Override with custom signal schema
 * const CustomSignalSchema = z.object({
 *   position: z.enum(['long', 'short', 'wait']),
 *   price_open: z.number(),
 *   confidence: z.number().min(0).max(100),
 *   custom_field: z.string()
 * });
 *
 * overrideSignalFormat(CustomSignalSchema);
 * ```
 *
 * @example
 * ```typescript
 * // Override with simplified schema
 * const SimpleSignalSchema = z.object({
 *   action: z.enum(['buy', 'sell', 'hold']),
 *   price: z.number()
 * });
 *
 * overrideSignalFormat(SimpleSignalSchema);
 * ```
 *
 * @remarks
 * - The custom schema replaces the default SignalSchema completely
 * - Schema name in OpenAI format is always "position_open_decision"
 * - Changes persist until application restart or next override
 * - Ensure the custom schema matches your signal processing logic
 *
 * @see {@link SignalSchema} - Default signal schema structure
 * @see {@link OutlineName.SignalOutline} - Outline being overridden
 */
declare function overrideSignalFormat<ZodInput extends ZodType>(format: ZodInput): void;

/**
 * Message role type for LLM conversation context.
 * Defines the sender of a message in a chat-based interaction.
 */
type MessageRole = "assistant" | "system" | "user";
/**
 * Message model for LLM conversation history.
 * Used in Optimizer to build prompts and maintain conversation context.
 */
interface MessageModel {
    /**
     * The sender of the message.
     * - "system": System instructions and context
     * - "user": User input and questions
     * - "assistant": LLM responses
     */
    role: MessageRole;
    /**
     * The text content of the message.
     * Contains the actual message text sent or received.
     */
    content: string;
}

/**
 * Dumps signal data and LLM conversation history to markdown files.
 * Used by AI-powered strategies to save debug logs for analysis.
 *
 * Creates a directory structure with:
 * - 00_system_prompt.md - System messages and output summary
 * - XX_user_message.md - Each user message in separate file (numbered)
 * - XX_llm_output.md - Final LLM output with signal data
 *
 * Skips if directory already exists to avoid overwriting previous results.
 *
 * @param signalId - Unique identifier for the result (used as directory name, e.g., UUID)
 * @param history - Array of message models from LLM conversation
 * @param signal - Signal DTO returned by LLM (position, priceOpen, TP, SL, etc.)
 * @param outputDir - Output directory path (default: "./dump/strategy")
 * @returns Promise that resolves when all files are written
 *
 * @example
 * ```typescript
 * import { dumpSignal, getCandles } from "backtest-kit";
 * import { v4 as uuid } from "uuid";
 *
 * addStrategy({
 *   strategyName: "llm-strategy",
 *   interval: "5m",
 *   getSignal: async (symbol) => {
 *     const messages = [];
 *
 *     // Build multi-timeframe analysis conversation
 *     const candles1h = await getCandles(symbol, "1h", 24);
 *     messages.push(
 *       { role: "user", content: `Analyze 1h trend:\n${formatCandles(candles1h)}` },
 *       { role: "assistant", content: "Trend analyzed" }
 *     );
 *
 *     const candles5m = await getCandles(symbol, "5m", 24);
 *     messages.push(
 *       { role: "user", content: `Analyze 5m structure:\n${formatCandles(candles5m)}` },
 *       { role: "assistant", content: "Structure analyzed" }
 *     );
 *
 *     // Request signal
 *     messages.push({
 *       role: "user",
 *       content: "Generate trading signal. Use position: 'wait' if uncertain."
 *     });
 *
 *     const resultId = uuid();
 *     const signal = await llmRequest(messages);
 *
 *     // Save conversation and result for debugging
 *     await dumpSignal(resultId, messages, signal);
 *
 *     return signal;
 *   }
 * });
 *
 * // Creates: ./dump/strategy/{uuid}/00_system_prompt.md
 * //          ./dump/strategy/{uuid}/01_user_message.md (1h analysis)
 * //          ./dump/strategy/{uuid}/02_assistant_message.md
 * //          ./dump/strategy/{uuid}/03_user_message.md (5m analysis)
 * //          ./dump/strategy/{uuid}/04_assistant_message.md
 * //          ./dump/strategy/{uuid}/05_user_message.md (signal request)
 * //          ./dump/strategy/{uuid}/06_llm_output.md (final signal)
 * ```
 */
declare function dumpSignalData(signalId: string | number, history: MessageModel[], signal: ISignalDto, outputDir?: string): Promise<void>;

/**
 * Commits signal prompt history to the message array.
 *
 * Extracts trading context from ExecutionContext and MethodContext,
 * then adds signal-specific system prompts at the beginning and user prompt
 * at the end of the history array if they are not empty.
 *
 * Context extraction:
 * - symbol: Provided as parameter for debugging convenience
 * - backtest mode: From ExecutionContext
 * - strategyName, exchangeName, frameName: From MethodContext
 *
 * @param symbol - Trading symbol (e.g., "BTCUSDT") for debugging convenience
 * @param history - Message array to append prompts to
 * @returns Promise that resolves when prompts are added
 * @throws Error if ExecutionContext or MethodContext is not active
 *
 * @example
 * ```typescript
 * const messages: MessageModel[] = [];
 * await commitSignalPromptHistory("BTCUSDT", messages);
 * // messages now contains system prompts at start and user prompt at end
 * ```
 */
declare function commitSignalPromptHistory(symbol: string, history: MessageModel[]): Promise<void>;

/**
 * Enumeration of supported LLM inference providers.
 *
 * Defines unique identifiers for each LLM provider supported by the library.
 * Used internally for dependency injection and provider resolution.
 *
 * @example
 * ```typescript
 * import { InferenceName } from '@backtest-kit/ollama';
 *
 * const providerName = InferenceName.GPT5Inference;
 * ```
 */
declare enum InferenceName {
    /** Ollama provider for local/cloud LLM inference */
    OllamaInference = "ollama_inference",
    /** Grok provider by X.AI (api.x.ai) */
    GrokInference = "grok_inference",
    /** Hugging Face Inference API provider */
    HfInference = "hf_inference",
    /** Claude provider by Anthropic (api.anthropic.com) */
    ClaudeInference = "claude_inference",
    /** OpenAI GPT provider (api.openai.com) */
    GPT5Inference = "gpt5_inference",
    /** Z.ai GPT Provider (api.z.ai/api/paas/v4) */
    GLM4Inference = "glm4_inference",
    /** DeepSeek provider (api.deepseek.com) */
    DeepseekInference = "deepseek_inference",
    /** Mistral AI provider (api.mistral.ai) */
    MistralInference = "mistral_inference",
    /** Perplexity AI provider (api.perplexity.ai) */
    PerplexityInference = "perplexity_inference",
    /** Cohere provider (api.cohere.ai) */
    CohereInference = "cohere_inference",
    /** Alibaba Cloud provider (dashscope-intl.aliyuncs.com) */
    AlibabaInference = "alibaba_inference"
}

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
interface IContext {
    /** AI inference provider identifier */
    inference: InferenceName;
    /** Model name/identifier for the provider */
    model: string;
    /** API key or array of keys for token rotation */
    apiKey: string | string[];
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
declare const ContextService: (new () => {
    readonly context: IContext;
}) & Omit<{
    new (context: IContext): {
        readonly context: IContext;
    };
}, "prototype"> & di_scoped.IScopedClassRun<[context: IContext]>;
/**
 * Type alias for ContextService instances.
 */
type TContextService = InstanceType<typeof ContextService>;

/**
 * Provider interface for LLM inference operations.
 *
 * Defines the contract for LLM providers (OpenAI, Claude, DeepSeek, etc.)
 * to support completion, streaming, and structured output generation.
 * All providers must implement these three methods.
 *
 * @example
 * ```typescript
 * class CustomProvider implements IProvider {
 *   async getCompletion(params: ISwarmCompletionArgs): Promise<ISwarmMessage> {
 *     // Return full completion
 *   }
 *   async getStreamCompletion(params: ISwarmCompletionArgs): Promise<ISwarmMessage> {
 *     // Return streamed completion
 *   }
 *   async getOutlineCompletion(params: IOutlineCompletionArgs): Promise<IOutlineMessage> {
 *     // Return structured JSON output
 *   }
 * }
 * ```
 */
interface IProvider {
    /**
     * Generate a standard completion from the LLM.
     *
     * @param params - Completion parameters (messages, model, temperature, etc.)
     * @returns Promise resolving to completion message
     */
    getCompletion(params: ISwarmCompletionArgs): Promise<ISwarmMessage>;
    /**
     * Generate a streaming completion from the LLM.
     *
     * @param params - Completion parameters (messages, model, temperature, etc.)
     * @returns Promise resolving to completion message (streamed)
     */
    getStreamCompletion(params: ISwarmCompletionArgs): Promise<ISwarmMessage>;
    /**
     * Generate a structured JSON completion using JSON schema enforcement.
     *
     * Used for trading signals and other structured outputs where format
     * validation is critical. The outline parameter defines the JSON schema.
     *
     * @param params - Outline completion parameters with JSON schema
     * @returns Promise resolving to structured message
     */
    getOutlineCompletion(params: IOutlineCompletionArgs): Promise<IOutlineMessage>;
}

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
declare class RunnerPrivateService implements IProvider {
    /** Context service providing execution context (model, API key, provider) */
    private readonly contextService;
    /** Logger service for operation tracking */
    private readonly loggerService;
    /** Registry storing provider class constructors by inference name */
    private _registry;
    /**
     * Memoized provider instance getter.
     * Creates and caches provider instances per inference type.
     */
    private getRunner;
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
    getCompletion: (params: ISwarmCompletionArgs) => Promise<ISwarmMessage>;
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
    getStreamCompletion: (params: ISwarmCompletionArgs) => Promise<ISwarmMessage>;
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
    getOutlineCompletion: (params: IOutlineCompletionArgs) => Promise<IOutlineMessage>;
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
    registerRunner: (name: InferenceName, runner: RunnerClass) => void;
}

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
declare class RunnerPublicService {
    /** Private service handling AI provider operations */
    private readonly runnerPrivateService;
    /** Logger service for operation tracking */
    private readonly loggerService;
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
    getCompletion: (params: ISwarmCompletionArgs, context: IContext) => Promise<ISwarmMessage>;
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
    getStreamCompletion: (params: ISwarmCompletionArgs, context: IContext) => Promise<ISwarmMessage>;
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
    getOutlineCompletion: (params: IOutlineCompletionArgs, context: IContext) => Promise<IOutlineMessage>;
}

/**
 * Centralized logging service for the Ollama package.
 *
 * Provides a unified interface for logging operations across the application.
 * Uses a delegate pattern to forward log calls to a configured logger implementation.
 * Defaults to a no-op logger if no logger is set.
 *
 * Key features:
 * - Supports multiple log levels: log, debug, info, warn
 * - Configurable logger backend via setLogger
 * - Async logging support
 * - Safe default (no-op) when unconfigured
 *
 * @example
 * ```typescript
 * import { LoggerService } from "./services/common/LoggerService";
 * import { setLogger } from "./function/setup.function";
 *
 * // Configure custom logger
 * setLogger({
 *   log: async (topic, ...args) => console.log(topic, ...args),
 *   debug: async (topic, ...args) => console.debug(topic, ...args),
 *   info: async (topic, ...args) => console.info(topic, ...args),
 *   warn: async (topic, ...args) => console.warn(topic, ...args),
 * });
 *
 * const loggerService = inject<LoggerService>(TYPES.loggerService);
 * await loggerService.info("Operation completed", { status: "success" });
 * ```
 */
declare class LoggerService implements ILogger {
    /** Internal logger instance, defaults to NOOP_LOGGER */
    private _commonLogger;
    /**
     * Logs a general message with optional arguments.
     *
     * @param topic - Message topic or category
     * @param args - Additional arguments to log
     */
    log: (topic: string, ...args: any[]) => Promise<void>;
    /**
     * Logs a debug message with optional arguments.
     * Used for detailed diagnostic information.
     *
     * @param topic - Message topic or category
     * @param args - Additional arguments to log
     */
    debug: (topic: string, ...args: any[]) => Promise<void>;
    /**
     * Logs an informational message with optional arguments.
     * Used for general operational information.
     *
     * @param topic - Message topic or category
     * @param args - Additional arguments to log
     */
    info: (topic: string, ...args: any[]) => Promise<void>;
    /**
     * Logs a warning message with optional arguments.
     * Used for potentially problematic situations.
     *
     * @param topic - Message topic or category
     * @param args - Additional arguments to log
     */
    warn: (topic: string, ...args: any[]) => Promise<void>;
    /**
     * Sets the logger implementation to use for all logging operations.
     *
     * @param logger - Logger implementation conforming to ILogger interface
     *
     * @example
     * ```typescript
     * const logger = new LoggerService();
     * logger.setLogger({
     *   log: async (topic, ...args) => console.log(topic, ...args),
     *   debug: async (topic, ...args) => console.debug(topic, ...args),
     *   info: async (topic, ...args) => console.info(topic, ...args),
     *   warn: async (topic, ...args) => console.warn(topic, ...args),
     * });
     * ```
     */
    setLogger: (logger: ILogger) => void;
}

/**
 * Private service for processing structured outline completions.
 *
 * Handles the core logic for executing outline-based AI completions with schema validation.
 * Processes AI responses through the agent-swarm-kit json function to extract and validate
 * structured trading signal data.
 *
 * Key features:
 * - JSON schema validation using agent-swarm-kit
 * - Trading signal extraction and transformation
 * - Type conversion for numeric fields
 * - Markdown formatting cleanup for notes
 * - Error handling for validation failures
 *
 * @example
 * ```typescript
 * const outlinePrivate = inject<OutlinePrivateService>(TYPES.outlinePrivateService);
 * const signal = await outlinePrivate.getCompletion([
 *   { role: "user", content: "Analyze market" }
 * ]);
 * ```
 */
declare class OutlinePrivateService {
    /** Logger service for operation tracking */
    private readonly loggerService;
    /**
     * Processes outline completion messages and extracts structured signal data.
     *
     * Sends messages to the AI provider, validates the response against the signal schema,
     * and transforms the data into a structured format. Returns null if the AI decides
     * to wait (no position).
     *
     * @param messages - Array of conversation messages for the AI
     * @returns Promise resolving to structured signal data or null if position is "wait"
     * @throws Error if validation fails or AI returns an error
     *
     * @example
     * ```typescript
     * const signal = await outlinePrivateService.getCompletion([
     *   { role: "system", content: "Trading analyst role" },
     *   { role: "user", content: "Market analysis data..." }
     * ]);
     *
     * if (signal) {
     *   console.log(`Position: ${signal.position}`);
     *   console.log(`Entry: ${signal.priceOpen}`);
     *   console.log(`SL: ${signal.priceStopLoss}`);
     *   console.log(`TP: ${signal.priceTakeProfit}`);
     * }
     * ```
     */
    getCompletion: (messages: IOutlineMessage[]) => Promise<{
        id: string;
        position: "long" | "short";
        minuteEstimatedTime: number;
        priceStopLoss: number;
        priceTakeProfit: number;
        note: string;
        priceOpen: number;
    }>;
}

/**
 * Public-facing service for structured AI outline completions.
 *
 * Provides a simplified interface for executing structured AI completions with schema validation.
 * Handles context creation and isolation for outline-based operations.
 * Used for extracting structured data from AI responses (e.g., trading signals).
 *
 * Key features:
 * - Simplified API with automatic context management
 * - JSON schema validation for structured outputs
 * - Support for multiple AI providers
 * - Optional API key parameter with fallback
 * - Logging integration
 *
 * @example
 * ```typescript
 * import { engine } from "./lib";
 * import { InferenceName } from "./enum/InferenceName";
 *
 * const signal = await engine.outlinePublicService.getCompletion(
 *   [{ role: "user", content: "Analyze BTC/USDT and decide position" }],
 *   InferenceName.ClaudeInference,
 *   "claude-3-5-sonnet-20240620",
 *   "sk-ant-..."
 * );
 *
 * // Returns structured signal:
 * // {
 * //   position: "long",
 * //   priceOpen: 50000,
 * //   priceStopLoss: 48000,
 * //   priceTakeProfit: 52000,
 * //   minuteEstimatedTime: 120,
 * //   note: "Strong bullish momentum..."
 * // }
 * ```
 */
declare class OutlinePublicService {
    /** Logger service for operation tracking */
    private readonly loggerService;
    /** Private service handling outline completion logic */
    private readonly outlinePrivateService;
    /**
     * Executes a structured outline completion with schema validation.
     *
     * Creates an isolated execution context and processes messages through the AI provider
     * to generate a structured response conforming to a predefined schema.
     *
     * @param messages - Array of conversation messages for the AI
     * @param inference - AI provider identifier
     * @param model - Model name/identifier
     * @param apiKey - Optional API key(s), required for most providers
     * @returns Promise resolving to structured signal data or null if position is "wait"
     *
     * @example
     * ```typescript
     * const result = await outlinePublicService.getCompletion(
     *   [
     *     { role: "system", content: "You are a trading analyst" },
     *     { role: "user", content: "Analyze current BTC market" }
     *   ],
     *   InferenceName.DeepseekInference,
     *   "deepseek-chat",
     *   "sk-..."
     * );
     * ```
     */
    getCompletion: (messages: IOutlineMessage[], inference: InferenceName, model: string, apiKey?: string | string[]) => Promise<{
        id: string;
        position: "long" | "short";
        minuteEstimatedTime: number;
        priceStopLoss: number;
        priceTakeProfit: number;
        note: string;
        priceOpen: number;
    }>;
}

type StrategyName = string;
type ExchangeName = string;
type FrameName = string;
/**
 * Service for managing signal prompts for AI/LLM integrations.
 *
 * Provides access to system and user prompts configured in signal.prompt.cjs.
 * Supports both static prompt arrays and dynamic prompt functions.
 *
 * Key responsibilities:
 * - Lazy-loads prompt configuration from config/prompt/signal.prompt.cjs
 * - Resolves system prompts (static arrays or async functions)
 * - Provides user prompt strings
 * - Falls back to empty prompts if configuration is missing
 *
 * Used for AI-powered signal analysis and strategy recommendations.
 */
declare class SignalPromptService {
    private readonly loggerService;
    /**
     * Retrieves system prompts for AI context.
     *
     * System prompts can be:
     * - Static array of strings (returned directly)
     * - Async/sync function returning string array (executed and awaited)
     * - Undefined (returns empty array)
     *
     * @param symbol - Trading symbol (e.g., "BTCUSDT")
     * @param strategyName - Strategy identifier
     * @param exchangeName - Exchange identifier
     * @param frameName - Timeframe identifier
     * @param backtest - Whether running in backtest mode
     * @returns Promise resolving to array of system prompt strings
     */
    getSystemPrompt: (symbol: string, strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean) => Promise<string[]>;
    /**
     * Retrieves user prompt string for AI input.
     *
     * @param symbol - Trading symbol (e.g., "BTCUSDT")
     * @param strategyName - Strategy identifier
     * @param exchangeName - Exchange identifier
     * @param frameName - Timeframe identifier
     * @param backtest - Whether running in backtest mode
     * @returns Promise resolving to user prompt string
     */
    getUserPrompt: (symbol: string, strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean) => Promise<string>;
}

/**
 * Unique identifier for outline result.
 * Can be string or number for flexible ID formats.
 */
type ResultId = string | number;
/**
 * Service for generating markdown documentation from LLM outline results.
 * Used by AI Strategy Optimizer to save debug logs and conversation history.
 *
 * Creates directory structure:
 * - ./dump/strategy/{signalId}/00_system_prompt.md - System messages and output data
 * - ./dump/strategy/{signalId}/01_user_message.md - First user input
 * - ./dump/strategy/{signalId}/02_user_message.md - Second user input
 * - ./dump/strategy/{signalId}/XX_llm_output.md - Final LLM output
 */
declare class OutlineMarkdownService {
    /** Logger service injected via DI */
    private readonly loggerService;
    /**
     * Dumps signal data and conversation history to markdown files.
     * Skips if directory already exists to avoid overwriting previous results.
     *
     * Generated files:
     * - 00_system_prompt.md - System messages and output summary
     * - XX_user_message.md - Each user message in separate file (numbered)
     * - XX_llm_output.md - Final LLM output with signal data
     *
     * @param signalId - Unique identifier for the result (used as directory name)
     * @param history - Array of message models from LLM conversation
     * @param signal - Signal DTO with trade parameters (priceOpen, TP, SL, etc.)
     * @param outputDir - Output directory path (default: "./dump/strategy")
     * @returns Promise that resolves when all files are written
     *
     * @example
     * ```typescript
     * await outlineService.dumpSignal(
     *   "strategy-1",
     *   conversationHistory,
     *   { position: "long", priceTakeProfit: 51000, priceStopLoss: 49000, minuteEstimatedTime: 60 }
     * );
     * // Creates: ./dump/strategy/strategy-1/00_system_prompt.md
     * //          ./dump/strategy/strategy-1/01_user_message.md
     * //          ./dump/strategy/strategy-1/02_llm_output.md
     * ```
     */
    dumpSignal: (signalId: ResultId, history: MessageModel[], signal: ISignalDto, outputDir?: string) => Promise<void>;
}

/**
 * Main engine object containing all services.
 * Provides unified access to the entire service layer.
 */
declare const engine: {
    outlineMarkdownService: OutlineMarkdownService;
    signalPromptService: SignalPromptService;
    runnerPublicService: RunnerPublicService;
    outlinePublicService: OutlinePublicService;
    runnerPrivateService: RunnerPrivateService;
    outlinePrivateService: OutlinePrivateService;
    contextService: {
        readonly context: IContext;
    };
    loggerService: LoggerService;
};

export { alibaba, claude, cohere, commitSignalPromptHistory, deepseek, dumpSignalData, glm4, gpt5, grok, hf, engine as lib, mistral, ollama, overrideSignalFormat, perplexity, setLogger };

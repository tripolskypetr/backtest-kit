import { ISignalDto } from 'backtest-kit';
import * as di_scoped from 'di-scoped';
import { ISwarmCompletionArgs, ISwarmMessage, IOutlineCompletionArgs, IOutlineMessage } from 'agent-swarm-kit';
import * as functools_kit from 'functools-kit';

/**
 * Wrap async function with Ollama inference context.
 *
 * Creates a higher-order function that executes the provided async function
 * within an Ollama inference context. Supports token rotation by passing multiple API keys.
 *
 * @template T - Async function type
 * @param fn - Async function to wrap
 * @param model - Ollama model name (e.g., "llama3.3:70b")
 * @param apiKey - Single API key or array of keys for rotation
 * @returns Wrapped function with same signature as input
 *
 * @example
 * ```typescript
 * import { ollama } from '@backtest-kit/ollama';
 *
 * const wrappedFn = ollama(myAsyncFn, 'llama3.3:70b', ['key1', 'key2']);
 * const result = await wrappedFn(args);
 * ```
 */
declare const ollama: <T extends (...args: any[]) => Promise<any>>(fn: T, model: string, apiKey?: string | string[]) => T;
/**
 * Wrap async function with Grok inference context.
 *
 * Creates a higher-order function that executes the provided async function
 * within a Grok (xAI) inference context.
 *
 * @template T - Async function type
 * @param fn - Async function to wrap
 * @param model - Grok model name (e.g., "grok-beta")
 * @param apiKey - Single API key or array of keys
 * @returns Wrapped function with same signature as input
 *
 * @example
 * ```typescript
 * import { grok } from '@backtest-kit/ollama';
 *
 * const wrappedFn = grok(myAsyncFn, 'grok-beta', process.env.GROK_API_KEY);
 * const result = await wrappedFn(args);
 * ```
 */
declare const grok: <T extends (...args: any[]) => Promise<any>>(fn: T, model: string, apiKey?: string | string[]) => T;
/**
 * Wrap async function with HuggingFace inference context.
 *
 * Creates a higher-order function that executes the provided async function
 * within a HuggingFace Router API inference context.
 *
 * @template T - Async function type
 * @param fn - Async function to wrap
 * @param model - HuggingFace model name (e.g., "meta-llama/Llama-3-70b")
 * @param apiKey - Single API key or array of keys
 * @returns Wrapped function with same signature as input
 *
 * @example
 * ```typescript
 * import { hf } from '@backtest-kit/ollama';
 *
 * const wrappedFn = hf(myAsyncFn, 'meta-llama/Llama-3-70b', process.env.HF_API_KEY);
 * const result = await wrappedFn(args);
 * ```
 */
declare const hf: <T extends (...args: any[]) => Promise<any>>(fn: T, model: string, apiKey?: string | string[]) => T;
/**
 * Wrap async function with Claude inference context.
 *
 * Creates a higher-order function that executes the provided async function
 * within an Anthropic Claude inference context.
 *
 * @template T - Async function type
 * @param fn - Async function to wrap
 * @param model - Claude model name (e.g., "claude-3-5-sonnet-20241022")
 * @param apiKey - Single API key or array of keys
 * @returns Wrapped function with same signature as input
 *
 * @example
 * ```typescript
 * import { claude } from '@backtest-kit/ollama';
 *
 * const wrappedFn = claude(myAsyncFn, 'claude-3-5-sonnet-20241022', process.env.ANTHROPIC_API_KEY);
 * const result = await wrappedFn(args);
 * ```
 */
declare const claude: <T extends (...args: any[]) => Promise<any>>(fn: T, model: string, apiKey?: string | string[]) => T;
/**
 * Wrap async function with OpenAI GPT inference context.
 *
 * Creates a higher-order function that executes the provided async function
 * within an OpenAI GPT inference context.
 *
 * @template T - Async function type
 * @param fn - Async function to wrap
 * @param model - OpenAI model name (e.g., "gpt-4o", "gpt-4-turbo")
 * @param apiKey - Single API key or array of keys
 * @returns Wrapped function with same signature as input
 *
 * @example
 * ```typescript
 * import { gpt5 } from '@backtest-kit/ollama';
 *
 * const wrappedFn = gpt5(myAsyncFn, 'gpt-4o', process.env.OPENAI_API_KEY);
 * const result = await wrappedFn(args);
 * ```
 */
declare const gpt5: <T extends (...args: any[]) => Promise<any>>(fn: T, model: string, apiKey?: string | string[]) => T;
/**
 * Wrap async function with DeepSeek inference context.
 *
 * Creates a higher-order function that executes the provided async function
 * within a DeepSeek AI inference context.
 *
 * @template T - Async function type
 * @param fn - Async function to wrap
 * @param model - DeepSeek model name (e.g., "deepseek-chat")
 * @param apiKey - Single API key or array of keys
 * @returns Wrapped function with same signature as input
 *
 * @example
 * ```typescript
 * import { deepseek } from '@backtest-kit/ollama';
 *
 * const wrappedFn = deepseek(myAsyncFn, 'deepseek-chat', process.env.DEEPSEEK_API_KEY);
 * const result = await wrappedFn(args);
 * ```
 */
declare const deepseek: <T extends (...args: any[]) => Promise<any>>(fn: T, model: string, apiKey?: string | string[]) => T;
/**
 * Wrap async function with Mistral AI inference context.
 *
 * Creates a higher-order function that executes the provided async function
 * within a Mistral AI inference context.
 *
 * @template T - Async function type
 * @param fn - Async function to wrap
 * @param model - Mistral model name (e.g., "mistral-large-latest")
 * @param apiKey - Single API key or array of keys
 * @returns Wrapped function with same signature as input
 *
 * @example
 * ```typescript
 * import { mistral } from '@backtest-kit/ollama';
 *
 * const wrappedFn = mistral(myAsyncFn, 'mistral-large-latest', process.env.MISTRAL_API_KEY);
 * const result = await wrappedFn(args);
 * ```
 */
declare const mistral: <T extends (...args: any[]) => Promise<any>>(fn: T, model: string, apiKey?: string | string[]) => T;
/**
 * Wrap async function with Perplexity AI inference context.
 *
 * Creates a higher-order function that executes the provided async function
 * within a Perplexity AI inference context.
 *
 * @template T - Async function type
 * @param fn - Async function to wrap
 * @param model - Perplexity model name (e.g., "llama-3.1-sonar-huge-128k-online")
 * @param apiKey - Single API key or array of keys
 * @returns Wrapped function with same signature as input
 *
 * @example
 * ```typescript
 * import { perplexity } from '@backtest-kit/ollama';
 *
 * const wrappedFn = perplexity(myAsyncFn, 'llama-3.1-sonar-huge-128k-online', process.env.PERPLEXITY_API_KEY);
 * const result = await wrappedFn(args);
 * ```
 */
declare const perplexity: <T extends (...args: any[]) => Promise<any>>(fn: T, model: string, apiKey?: string | string[]) => T;
/**
 * Wrap async function with Cohere inference context.
 *
 * Creates a higher-order function that executes the provided async function
 * within a Cohere AI inference context.
 *
 * @template T - Async function type
 * @param fn - Async function to wrap
 * @param model - Cohere model name (e.g., "command-r-plus")
 * @param apiKey - Single API key or array of keys
 * @returns Wrapped function with same signature as input
 *
 * @example
 * ```typescript
 * import { cohere } from '@backtest-kit/ollama';
 *
 * const wrappedFn = cohere(myAsyncFn, 'command-r-plus', process.env.COHERE_API_KEY);
 * const result = await wrappedFn(args);
 * ```
 */
declare const cohere: <T extends (...args: any[]) => Promise<any>>(fn: T, model: string, apiKey?: string | string[]) => T;
/**
 * Wrap async function with Alibaba Qwen inference context.
 *
 * Creates a higher-order function that executes the provided async function
 * within an Alibaba DashScope API inference context.
 *
 * @template T - Async function type
 * @param fn - Async function to wrap
 * @param model - Qwen model name (e.g., "qwen-max")
 * @param apiKey - Single API key or array of keys
 * @returns Wrapped function with same signature as input
 *
 * @example
 * ```typescript
 * import { alibaba } from '@backtest-kit/ollama';
 *
 * const wrappedFn = alibaba(myAsyncFn, 'qwen-max', process.env.ALIBABA_API_KEY);
 * const result = await wrappedFn(args);
 * ```
 */
declare const alibaba: <T extends (...args: any[]) => Promise<any>>(fn: T, model: string, apiKey?: string | string[]) => T;
/**
 * Wrap async function with Zhipu AI GLM-4 inference context.
 *
 * Creates a higher-order function that executes the provided async function
 * within a Zhipu AI GLM-4 inference context via OpenAI-compatible Z.ai API.
 *
 * @template T - Async function type
 * @param fn - Async function to wrap
 * @param model - GLM-4 model name (e.g., "glm-4-plus", "glm-4-air")
 * @param apiKey - Single API key or array of keys
 * @returns Wrapped function with same signature as input
 *
 * @example
 * ```typescript
 * import { glm4 } from '@backtest-kit/ollama';
 *
 * const wrappedFn = glm4(myAsyncFn, 'glm-4-plus', process.env.ZAI_API_KEY);
 * const result = await wrappedFn(args);
 * ```
 */
/**
 * Wrap async function with Groq inference context.
 *
 * Creates a higher-order function that executes the provided async function
 * within a Groq inference context.
 *
 * @template T - Async function type
 * @param fn - Async function to wrap
 * @param model - Groq model name (e.g., "llama-3.3-70b-versatile")
 * @param apiKey - Single API key or array of keys
 * @returns Wrapped function with same signature as input
 *
 * @example
 * ```typescript
 * import { groq } from '@backtest-kit/ollama';
 *
 * const wrappedFn = groq(myAsyncFn, 'llama-3.3-70b-versatile', process.env.GROQ_API_KEY);
 * const result = await wrappedFn(args);
 * ```
 */
declare const groq: <T extends (...args: any[]) => Promise<any>>(fn: T, model: string, apiKey?: string | string[]) => T;
declare const glm4: <T extends (...args: any[]) => Promise<any>>(fn: T, model: string, apiKey?: string | string[]) => T;

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
declare enum CompletionName {
    /** Standard completion mode (full response at once) */
    RunnerCompletion = "runner_completion",
    /** Streaming completion mode (progressive response chunks) */
    RunnerStreamCompletion = "runner_stream_completion",
    /** Outline completion mode (structured JSON with schema validation) */
    RunnerOutlineCompletion = "runner_outline_completion"
}

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
 * Type alias for enum objects with string key-value pairs
 */
type Enum = Record<string, string>;
/**
 * Type alias for ValidateArgs with any enum type
 */
type Args = ValidateArgs<any>;
/**
 * Interface defining validation arguments for all entity types.
 *
 * Each property accepts an enum object where values will be validated
 * against registered entities in their respective validation services.
 *
 * @template T - Enum type extending Record<string, string>
 */
interface ValidateArgs<T = Enum> {
    /**
     * Optimizer name enum to validate
     * @example { GRID_SEARCH: "grid-search" }
     */
    OptimizerName?: T;
}
/**
 * Validates the existence of all provided entity names across validation services.
 *
 * This function accepts enum objects for various entity types (exchanges, frames,
 * strategies, risks, sizings, optimizers, walkers) and validates that each entity
 * name exists in its respective registry. Validation results are memoized for performance.
 *
 * If no arguments are provided (or specific entity types are omitted), the function
 * automatically fetches and validates ALL registered entities from their respective
 * validation services. This is useful for comprehensive validation of the entire setup.
 *
 * Use this before running backtests or optimizations to ensure all referenced
 * entities are properly registered and configured.
 *
 * @public
 * @param args - Partial validation arguments containing entity name enums to validate.
 *                If empty or omitted, validates all registered entities.
 * @throws {Error} If any entity name is not found in its validation service
 *
 * @example
 * ```typescript
 * // Validate ALL registered entities (exchanges, frames, strategies, etc.)
 * await validate({});
 * ```
 *
 * @example
 * ```typescript
 * // Define your entity name enums
 * enum ExchangeName {
 *   BINANCE = "binance",
 *   BYBIT = "bybit"
 * }
 *
 * enum StrategyName {
 *   MOMENTUM_BTC = "momentum-btc"
 * }
 *
 * // Validate specific entities before running backtest
 * await validate({
 *   ExchangeName,
 *   StrategyName,
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Validate specific entity types
 * await validate({
 *   RiskName: { CONSERVATIVE: "conservative" },
 *   SizingName: { FIXED_1000: "fixed-1000" },
 * });
 * ```
 */
declare function validate(args?: Partial<Args>): Promise<void>;

declare class Module {
    readonly path: string;
    readonly baseDir: string;
    private readonly __type__;
    private constructor();
    static fromPath: (path: string, baseDir?: string) => Module;
    static isModule: (value: unknown) => value is Module;
}

type StrategyName$2 = string;
type ExchangeName$2 = string;
type FrameName$2 = string;
/**
 * Function type for generating dynamic system prompts.
 *
 * System prompt functions enable context-aware AI prompt generation based on:
 * - Trading symbol and market conditions
 * - Strategy-specific requirements
 * - Exchange platform characteristics
 * - Timeframe considerations
 * - Execution mode (backtest vs live)
 *
 * @param symbol - Trading symbol (e.g., "BTCUSDT", "ETHUSDT")
 * @param strategyName - Strategy identifier for configuration lookup
 * @param exchangeName - Exchange platform identifier
 * @param frameName - Timeframe identifier (e.g., "1m", "5m", "1h")
 * @param backtest - Whether running in backtest mode (true) or live trading (false)
 * @returns Promise resolving to array of system prompt strings, or array directly
 *
 * @example
 * ```typescript
 * const systemPromptFn: SystemPromptFn = async (symbol, strategyName, exchangeName, frameName, backtest) => {
 *   return [
 *     `You are analyzing ${symbol} on ${exchangeName}`,
 *     `Strategy: ${strategyName}, Timeframe: ${frameName}`,
 *     backtest ? "Running in backtest mode" : "Running in live mode"
 *   ];
 * };
 * ```
 */
type SystemPromptFn = (symbol: string, strategyName: StrategyName$2, exchangeName: ExchangeName$2, frameName: FrameName$2, backtest: boolean) => Promise<string[]> | string[];
/**
 * Function type for generating dynamic user prompts.
 *
 * User prompt functions enable context-aware AI query generation based on:
 * - Trading symbol and market conditions
 * - Strategy-specific requirements
 * - Exchange platform characteristics
 * - Timeframe considerations
 * - Execution mode (backtest vs live)
 *
 * @param symbol - Trading symbol (e.g., "BTCUSDT", "ETHUSDT")
 * @param strategyName - Strategy identifier for configuration lookup
 * @param exchangeName - Exchange platform identifier
 * @param frameName - Timeframe identifier (e.g., "1m", "5m", "1h")
 * @param backtest - Whether running in backtest mode (true) or live trading (false)
 * @returns Promise resolving to user prompt string, or string directly
 *
 * @example
 * ```typescript
 * const userPromptFn: UserPromptFn = async (symbol, strategyName, exchangeName, frameName, backtest) => {
 *   return `Analyze ${symbol} for ${strategyName} strategy on ${frameName} timeframe`;
 * };
 * ```
 */
type UserPromptFn = (symbol: string, strategyName: StrategyName$2, exchangeName: ExchangeName$2, frameName: FrameName$2, backtest: boolean) => Promise<string> | string;
/**
 * Prompt configuration model for AI/LLM integrations.
 *
 * Defines the structure for AI prompts used in trading strategy analysis.
 * Supports both static prompts and dynamic functions for context-aware generation.
 *
 * Key features:
 * - System prompts: Provide AI context and instructions (optional)
 * - User prompts: Define specific queries or tasks (required)
 * - Static values: Use fixed strings/arrays for consistent prompts
 * - Dynamic functions: Generate prompts based on runtime context
 *
 * Used by PromptService implementations to load and process prompt configurations
 * from config/prompt/*.prompt.cjs files.
 *
 * @example
 * ```typescript
 * // Static prompts
 * const staticPrompt: PromptModel = {
 *   system: ["You are a trading analyst", "Focus on risk management"],
 *   user: "Should I enter this trade?"
 * };
 *
 * // Dynamic prompts
 * const dynamicPrompt: PromptModel = {
 *   system: async (symbol, strategy, exchange, frame, backtest) => [
 *     `Analyzing ${symbol} on ${exchange}`,
 *     `Strategy: ${strategy}, Timeframe: ${frame}`
 *   ],
 *   user: async (symbol, strategy, exchange, frame, backtest) =>
 *     `Evaluate ${symbol} for ${strategy} strategy`
 * };
 * ```
 */
interface PromptModel {
    /**
     * System prompts for AI context.
     * Can be static array of strings or dynamic function returning string array.
     * Used to set AI behavior, constraints, and domain knowledge.
     */
    system?: string[] | SystemPromptFn;
    /**
     * User prompt for AI input.
     * Can be static string or dynamic function returning string.
     * Defines the specific question or task for the AI to perform.
     */
    user: string | UserPromptFn;
}

declare class Prompt {
    readonly source: PromptModel;
    private readonly __type__;
    private constructor();
    static fromPrompt: (source: PromptModel) => Prompt;
    static isPrompt: (value: unknown) => value is Prompt;
}

/**
 * Commits signal prompt history to the message array.
 *
 * Extracts trading context from ExecutionContext and MethodContext,
 * then adds signal-specific system prompts at the beginning and user prompt
 * at the end of the history array if they are not empty.
 *
 * Context extraction:
 * - symbol: From getSymbol()
 * - backtest mode: From getMode()
 * - strategyName, exchangeName, frameName: From getContext()
 *
 * @param source - Module object containing path to .cjs module
 * @param history - Message array to append prompts to
 * @returns Promise that resolves when prompts are added
 * @throws Error if ExecutionContext or MethodContext is not active
 *
 * ```
 */
declare function commitPrompt(source: Module | Prompt, history: MessageModel[]): Promise<void>;

/**
 * Candle interval type for trading timeframes.
 */
type CandleInterval = "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h" | "12h" | "1d" | "3d" | "1w" | "1M";
/**
 * Unique string identifier for registered exchanges.
 */
type ExchangeName$1 = string;
/**
 * Unique string identifier for registered frames.
 */
type FrameName$1 = string;
/**
 * Unique string identifier for registered walkers.
 */
type WalkerName = string;
/**
 * Unique string identifier for registered strategies.
 */
type StrategyName$1 = string;
/**
 * Unique identifier for data rows in optimizer sources.
 * Can be either a string or numeric ID.
 */
type RowId = string | number;
/**
 * Time range configuration for optimizer training or testing periods.
 * Used to define date boundaries for data collection.
 */
interface IOptimizerRange {
    /**
     * Optional description of this time range.
     * Example: "Bull market period 2024-Q1"
     */
    note?: string;
    /**
     * Start date of the range (inclusive).
     */
    startDate: Date;
    /**
     * End date of the range (inclusive).
     */
    endDate: Date;
}
/**
 * Base interface for optimizer data sources.
 * All data fetched from sources must have a unique ID for deduplication.
 */
interface IOptimizerData {
    /**
     * Unique identifier for this data row.
     * Used for deduplication when paginating data sources.
     */
    id: RowId;
}
/**
 * Filter arguments for data source queries without pagination.
 * Used internally to filter data by symbol and time range.
 */
interface IOptimizerFilterArgs {
    /**
     * Trading pair symbol (e.g., "BTCUSDT").
     */
    symbol: string;
    /**
     * Start date of the data range (inclusive).
     */
    startDate: Date;
    /**
     * End date of the data range (inclusive).
     */
    endDate: Date;
}
/**
 * Fetch arguments for paginated data source queries.
 * Extends filter arguments with pagination parameters.
 */
interface IOptimizerFetchArgs extends IOptimizerFilterArgs {
    /**
     * Maximum number of records to fetch per request.
     * Default: 25 (ITERATION_LIMIT)
     */
    limit: number;
    /**
     * Number of records to skip from the beginning.
     * Used for pagination (offset = page * limit).
     */
    offset: number;
}
/**
 * Data source function for fetching optimizer training data.
 * Must support pagination and return data with unique IDs.
 *
 * @param args - Fetch arguments including symbol, dates, limit, offset
 * @returns Array of data rows or Promise resolving to data array
 */
interface IOptimizerSourceFn<Data extends IOptimizerData = any> {
    (args: IOptimizerFetchArgs): Data[] | Promise<Data[]>;
}
/**
 * Generated strategy data with LLM conversation history.
 * Contains the full context used to generate a trading strategy.
 */
interface IOptimizerStrategy {
    /**
     * Trading pair symbol this strategy was generated for.
     */
    symbol: string;
    /**
     * Unique name taken from data source.
     * Used in callbacks and logging.
     */
    name: string;
    /**
     * LLM conversation history used to generate the strategy.
     * Contains user prompts and assistant responses for each data source.
     */
    messages: MessageModel[];
    /**
     * Generated strategy prompt/description.
     * Output from getPrompt() function, used as strategy logic.
     */
    strategy: string;
}
/**
 * Data source configuration with custom message formatters.
 * Defines how to fetch data and format it for LLM conversation.
 */
interface IOptimizerSource<Data extends IOptimizerData = any> {
    /**
     * Optional description of this data source.
     * Example: "Historical backtest results for training"
     */
    note?: string;
    /**
     * Unique name identifying this data source.
     * Used in callbacks and logging.
     */
    name: string;
    /**
     * Function to fetch data from this source.
     * Must support pagination via limit/offset.
     */
    fetch: IOptimizerSourceFn<Data>;
    /**
     * Optional custom formatter for user messages.
     * If not provided, uses default template from OptimizerTemplateService.
     *
     * @param symbol - Trading pair symbol
     * @param data - Fetched data array
     * @param name - Source name
     * @returns Formatted user message content
     */
    user?: (symbol: string, data: Data[], name: string) => string | Promise<string>;
    /**
     * Optional custom formatter for assistant messages.
     * If not provided, uses default template from OptimizerTemplateService.
     *
     * @param symbol - Trading pair symbol
     * @param data - Fetched data array
     * @param name - Source name
     * @returns Formatted assistant message content
     */
    assistant?: (symbol: string, data: Data[], name: string) => string | Promise<string>;
}
/**
 * Union type for data source configuration.
 * Can be either a simple fetch function or a full source configuration object.
 */
type Source<Data extends IOptimizerData = any> = IOptimizerSourceFn<Data> | IOptimizerSource<Data>;
/**
 * Lifecycle callbacks for optimizer events.
 * Provides hooks for monitoring and validating optimizer operations.
 */
interface IOptimizerCallbacks {
    /**
     * Called after strategy data is generated for all train ranges.
     * Useful for logging or validating the generated strategies.
     *
     * @param symbol - Trading pair symbol
     * @param strategyData - Array of generated strategies with their messages
     */
    onData?: (symbol: string, strategyData: IOptimizerStrategy[]) => void | Promise<void>;
    /**
     * Called after strategy code is generated.
     * Useful for logging or validating the generated code.
     *
     * @param symbol - Trading pair symbol
     * @param code - Generated strategy code
     */
    onCode?: (symbol: string, code: string) => void | Promise<void>;
    /**
     * Called after strategy code is dumped to file.
     * Useful for logging or performing additional actions after file write.
     *
     * @param symbol - Trading pair symbol
     * @param filepath - Path where the file was saved
     */
    onDump?: (symbol: string, filepath: string) => void | Promise<void>;
    /**
     * Called after data is fetched from a source.
     * Useful for logging or validating the fetched data.
     *
     * @param symbol - Trading pair symbol
     * @param sourceName - Name of the data source
     * @param data - Array of fetched data
     * @param startDate - Start date of the data range
     * @param endDate - End date of the data range
     */
    onSourceData?: <Data extends IOptimizerData = any>(symbol: string, sourceName: string, data: Data[], startDate: Date, endDate: Date) => void | Promise<void>;
}
/**
 * Template interface for generating code snippets and LLM messages.
 * Each method returns TypeScript/JavaScript code as a string.
 */
interface IOptimizerTemplate {
    /**
     * Generates the top banner with imports and initialization.
     *
     * @param symbol - Trading pair symbol
     * @returns Generated import statements and setup code
     */
    getTopBanner(symbol: string): string | Promise<string>;
    /**
     * Generates default user message content for LLM conversation.
     *
     * @param symbol - Trading pair symbol
     * @param data - Data array from source
     * @param name - Source name
     * @returns Formatted user message content
     */
    getUserMessage<Data extends IOptimizerData = any>(symbol: string, data: Data[], name: string): string | Promise<string>;
    /**
     * Generates default assistant message content for LLM conversation.
     *
     * @param symbol - Trading pair symbol
     * @param data - Data array from source
     * @param name - Source name
     * @returns Formatted assistant message content
     */
    getAssistantMessage<Data extends IOptimizerData = any>(symbol: string, data: Data[], name: string): string | Promise<string>;
    /**
     * Generates Walker configuration code.
     *
     * @param walkerName - Unique walker identifier
     * @param exchangeName - Exchange name to use
     * @param frameName - Frame name for testing
     * @param strategies - Array of strategy names to compare
     * @returns Generated addWalker() call
     */
    getWalkerTemplate(walkerName: WalkerName, exchangeName: ExchangeName$1, frameName: FrameName$1, strategies: string[]): string | Promise<string>;
    /**
     * Generates Exchange configuration code.
     *
     * @param symbol - Trading pair symbol
     * @param exchangeName - Unique exchange identifier
     * @returns Generated addExchange() call with CCXT integration
     */
    getExchangeTemplate(symbol: string, exchangeName: ExchangeName$1): string | Promise<string>;
    /**
     * Generates Frame (timeframe) configuration code.
     *
     * @param symbol - Trading pair symbol
     * @param frameName - Unique frame identifier
     * @param interval - Candle interval (e.g., "1m", "5m")
     * @param startDate - Frame start date
     * @param endDate - Frame end date
     * @returns Generated addFrame() call
     */
    getFrameTemplate(symbol: string, frameName: FrameName$1, interval: CandleInterval, startDate: Date, endDate: Date): string | Promise<string>;
    /**
     * Generates Strategy configuration code with LLM integration.
     *
     * @param strategyName - Unique strategy identifier
     * @param interval - Signal throttling interval (e.g., "5m")
     * @param prompt - Strategy logic prompt from getPrompt()
     * @returns Generated addStrategy() call with getSignal() function
     */
    getStrategyTemplate(strategyName: StrategyName$1, interval: CandleInterval, prompt: string): string | Promise<string>;
    /**
     * Generates launcher code to run Walker and listen to events.
     *
     * @param symbol - Trading pair symbol
     * @param walkerName - Walker name to launch
     * @returns Generated Walker.background() call with event listeners
     */
    getLauncherTemplate(symbol: string, walkerName: WalkerName): string | Promise<string>;
    /**
     * Generates text() helper function for LLM text generation.
     *
     * @param symbol - Trading pair symbol
     * @returns Generated async text() function using Ollama
     */
    getTextTemplate(symbol: string): string | Promise<string>;
    /**
     * Generates json() helper function for structured LLM output.
     *
     * @param symbol - Trading pair symbol
     * @returns Generated async json() function with signal schema
     */
    getJsonTemplate(symbol: string): string | Promise<string>;
    /**
     * Generates dumpJson() helper function for debug output.
     *
     * @param symbol - Trading pair symbol
     * @returns Generated async dumpJson() function for file logging
     */
    getJsonDumpTemplate: (symbol: string) => string | Promise<string>;
}
/**
 * Schema configuration for optimizer registration.
 * Defines how to collect data, generate strategies, and create executable code.
 */
interface IOptimizerSchema {
    /**
     * Optional description of this optimizer configuration.
     */
    note?: string;
    /**
     * Unique identifier for this optimizer.
     * Used to retrieve optimizer instance from registry.
     */
    optimizerName: OptimizerName;
    /**
     * Array of training time ranges.
     * Each range generates a separate strategy variant for comparison.
     */
    rangeTrain: IOptimizerRange[];
    /**
     * Testing time range for strategy validation.
     * Used in generated Walker to evaluate strategy performance.
     */
    rangeTest: IOptimizerRange;
    /**
     * Array of data sources for strategy generation.
     * Each source contributes to the LLM conversation context.
     */
    source: Source[];
    /**
     * Function to generate strategy prompt from conversation history.
     * Called after all sources are processed for each training range.
     *
     * @param symbol - Trading pair symbol
     * @param messages - Complete conversation history with all sources
     * @returns Strategy prompt/logic description
     */
    getPrompt: (symbol: string, messages: MessageModel[]) => string | Promise<string>;
    /**
     * Optional custom template overrides.
     * If not provided, uses defaults from OptimizerTemplateService.
     */
    template?: Partial<IOptimizerTemplate>;
    /**
     * Optional lifecycle callbacks for monitoring.
     */
    callbacks?: Partial<IOptimizerCallbacks>;
}
/**
 * Internal parameters for ClientOptimizer instantiation.
 * Extends schema with resolved dependencies (logger, complete template).
 */
interface IOptimizerParams extends IOptimizerSchema {
    /**
     * Logger instance for debug and info messages.
     * Injected by OptimizerConnectionService.
     */
    logger: ILogger;
    /**
     * Complete template implementation with all methods.
     * Merged from schema.template and OptimizerTemplateService defaults.
     */
    template: IOptimizerTemplate;
}
/**
 * Optimizer client interface for strategy generation and code export.
 * Implemented by ClientOptimizer class.
 */
interface IOptimizer {
    /**
     * Fetches data from all sources and generates strategy metadata.
     * Processes each training range and builds LLM conversation history.
     *
     * @param symbol - Trading pair symbol
     * @returns Array of generated strategies with conversation context
     */
    getData(symbol: string): Promise<IOptimizerStrategy[]>;
    /**
     * Generates complete executable strategy code.
     * Includes imports, helpers, strategies, walker, and launcher.
     *
     * @param symbol - Trading pair symbol
     * @returns Generated TypeScript/JavaScript code as string
     */
    getCode(symbol: string): Promise<string>;
    /**
     * Generates and saves strategy code to file.
     * Creates directory if needed, writes .mjs file.
     *
     * @param symbol - Trading pair symbol
     * @param path - Output directory path (default: "./")
     */
    dump(symbol: string, path?: string): Promise<void>;
}
/**
 * Unique string identifier for registered optimizers.
 */
type OptimizerName = string;

/**
 * Registers an optimizer configuration in the framework.
 *
 * The optimizer generates trading strategies by:
 * - Collecting data from multiple sources across training periods
 * - Building LLM conversation history with fetched data
 * - Generating strategy prompts using getPrompt()
 * - Creating executable backtest code with templates
 *
 * The optimizer produces a complete .mjs file containing:
 * - Exchange, Frame, Strategy, and Walker configurations
 * - Multi-timeframe analysis logic
 * - LLM integration for signal generation
 * - Event listeners for progress tracking
 *
 * @param optimizerSchema - Optimizer configuration object
 * @param optimizerSchema.optimizerName - Unique optimizer identifier
 * @param optimizerSchema.rangeTrain - Array of training time ranges (each generates a strategy variant)
 * @param optimizerSchema.rangeTest - Testing time range for strategy validation
 * @param optimizerSchema.source - Array of data sources (functions or source objects with custom formatters)
 * @param optimizerSchema.getPrompt - Function to generate strategy prompt from conversation history
 * @param optimizerSchema.template - Optional custom template overrides (top banner, helpers, strategy logic, etc.)
 * @param optimizerSchema.callbacks - Optional lifecycle callbacks (onData, onCode, onDump, onSourceData)
 *
 * @example
 * ```typescript
 * // Basic optimizer with single data source
 * addOptimizerSchema({
 *   optimizerName: "llm-strategy-generator",
 *   rangeTrain: [
 *     {
 *       note: "Bull market period",
 *       startDate: new Date("2024-01-01"),
 *       endDate: new Date("2024-01-31"),
 *     },
 *     {
 *       note: "Bear market period",
 *       startDate: new Date("2024-02-01"),
 *       endDate: new Date("2024-02-28"),
 *     },
 *   ],
 *   rangeTest: {
 *     note: "Validation period",
 *     startDate: new Date("2024-03-01"),
 *     endDate: new Date("2024-03-31"),
 *   },
 *   source: [
 *     {
 *       name: "historical-backtests",
 *       fetch: async ({ symbol, startDate, endDate, limit, offset }) => {
 *         // Fetch historical backtest results from database
 *         return await db.backtests.find({
 *           symbol,
 *           date: { $gte: startDate, $lte: endDate },
 *         })
 *         .skip(offset)
 *         .limit(limit);
 *       },
 *       user: async (symbol, data, name) => {
 *         return `Analyze these ${data.length} backtest results for ${symbol}:\n${JSON.stringify(data)}`;
 *       },
 *       assistant: async (symbol, data, name) => {
 *         return "Historical data analyzed successfully";
 *       },
 *     },
 *   ],
 *   getPrompt: async (symbol, messages) => {
 *     // Generate strategy prompt from conversation
 *     return `"Analyze ${symbol} using RSI and MACD. Enter LONG when RSI < 30 and MACD crosses above signal."`;
 *   },
 *   callbacks: {
 *     onData: (symbol, strategyData) => {
 *       console.log(`Generated ${strategyData.length} strategies for ${symbol}`);
 *     },
 *     onCode: (symbol, code) => {
 *       console.log(`Generated ${code.length} characters of code for ${symbol}`);
 *     },
 *     onDump: (symbol, filepath) => {
 *       console.log(`Saved strategy to ${filepath}`);
 *     },
 *     onSourceData: (symbol, sourceName, data, startDate, endDate) => {
 *       console.log(`Fetched ${data.length} rows from ${sourceName} for ${symbol}`);
 *     },
 *   },
 * });
 * ```
 */
declare function addOptimizerSchema(optimizerSchema: IOptimizerSchema): void;

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
interface ProgressOptimizerContract {
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
declare function listenOptimizerProgress(callback: (event: ProgressOptimizerContract) => void): () => void;
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
declare function listenError(callback: (error: Error) => void): () => void;

/**
 * Retrieves a registered optimizer schema by name.
 *
 * @param optimizerName - Unique optimizer identifier
 * @returns The optimizer schema configuration object
 * @throws Error if optimizer is not registered
 *
 * @example
 * ```typescript
 * const optimizer = getOptimizer("llm-strategy-generator");
 * console.log(optimizer.rangeTrain); // Array of training ranges
 * console.log(optimizer.rangeTest); // Testing range
 * console.log(optimizer.source); // Array of data sources
 * console.log(optimizer.getPrompt); // async function
 * ```
 */
declare function getOptimizerSchema(optimizerName: OptimizerName): IOptimizerSchema;

/**
 * Returns a list of all registered optimizer schemas.
 *
 * Retrieves all optimizers that have been registered via addOptimizer().
 * Useful for debugging, documentation, or building dynamic UIs.
 *
 * @returns Array of optimizer schemas with their configurations
 *
 * @example
 * ```typescript
 * import { listOptimizers, addOptimizer } from "backtest-kit";
 *
 * addOptimizer({
 *   optimizerName: "llm-strategy-generator",
 *   note: "Generates trading strategies using LLM",
 *   rangeTrain: [
 *     {
 *       note: "Training period 1",
 *       startDate: new Date("2024-01-01"),
 *       endDate: new Date("2024-01-31"),
 *     },
 *   ],
 *   rangeTest: {
 *     note: "Testing period",
 *     startDate: new Date("2024-02-01"),
 *     endDate: new Date("2024-02-28"),
 *   },
 *   source: [],
 *   getPrompt: async (symbol, messages) => "Generate strategy",
 * });
 *
 * const optimizers = listOptimizers();
 * console.log(optimizers);
 * // [{ optimizerName: "llm-strategy-generator", note: "Generates...", ... }]
 * ```
 */
declare function listOptimizerSchema(): Promise<IOptimizerSchema[]>;

/**
 * Public API utilities for optimizer operations.
 * Provides high-level methods for strategy generation and code export.
 *
 * Usage:
 * ```typescript
 * import { Optimizer } from "@backtest-kit/ollama";
 *
 * // Get strategy data
 * const strategies = await Optimizer.getData("BTCUSDT", {
 *   optimizerName: "my-optimizer"
 * });
 *
 * // Generate code
 * const code = await Optimizer.getCode("BTCUSDT", {
 *   optimizerName: "my-optimizer"
 * });
 *
 * // Save to file
 * await Optimizer.dump("BTCUSDT", {
 *   optimizerName: "my-optimizer"
 * }, "./output");
 * ```
 */
declare class OptimizerUtils {
    /**
     * Fetches data from all sources and generates strategy metadata.
     * Processes each training range and builds LLM conversation history.
     *
     * @param symbol - Trading pair symbol
     * @param context - Context with optimizerName
     * @returns Array of generated strategies with conversation context
     * @throws Error if optimizer not found
     */
    getData: (symbol: string, context: {
        optimizerName: OptimizerName;
    }) => Promise<IOptimizerStrategy[]>;
    /**
     * Generates complete executable strategy code.
     * Includes imports, helpers, strategies, walker, and launcher.
     *
     * @param symbol - Trading pair symbol
     * @param context - Context with optimizerName
     * @returns Generated TypeScript/JavaScript code as string
     * @throws Error if optimizer not found
     */
    getCode: (symbol: string, context: {
        optimizerName: OptimizerName;
    }) => Promise<string>;
    /**
     * Generates and saves strategy code to file.
     * Creates directory if needed, writes .mjs file.
     *
     * Format: `{optimizerName}_{symbol}.mjs`
     *
     * @param symbol - Trading pair symbol
     * @param context - Context with optimizerName
     * @param path - Output directory path (default: "./")
     * @throws Error if optimizer not found or file write fails
     */
    dump: (symbol: string, context: {
        optimizerName: string;
    }, path?: string) => Promise<void>;
}
/**
 * Singleton instance of OptimizerUtils.
 * Public API for optimizer operations.
 *
 * @example
 * ```typescript
 * import { Optimizer } from "@backtest-kit/ollama";
 *
 * await Optimizer.dump("BTCUSDT", { optimizerName: "my-optimizer" });
 * ```
 */
declare const Optimizer: OptimizerUtils;

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
    AlibabaInference = "alibaba_inference",
    /** Groq provider (api.groq.com) */
    GroqInference = "groq_inference"
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

declare class PromptCacheService {
    private readonly loggerService;
    readModule: (module: Module) => Prompt;
    clear: (module?: Module) => void;
}

type StrategyName = string;
type ExchangeName = string;
type FrameName = string;
/**
 * Service for managing signal prompts for AI/LLM integrations.
 *
 * Provides access to system and user prompts from Prompt.
 * Supports both static prompt arrays and dynamic prompt functions.
 *
 * Key responsibilities:
 * - Resolves system prompts (static arrays or async functions)
 * - Provides user prompt strings
 *
 * Used for AI-powered signal analysis and strategy recommendations.
 */
declare class ResolvePromptService {
    private readonly loggerService;
    /**
     * Retrieves system prompts for AI context.
     *
     * System prompts can be:
     * - Static array of strings (returned directly)
     * - Async/sync function returning string array (executed and awaited)
     * - Undefined (returns empty array)
     *
     * @param prompt - Prompt containing the loaded module
     * @param symbol - Trading symbol (e.g., "BTCUSDT")
     * @param strategyName - Strategy identifier
     * @param exchangeName - Exchange identifier
     * @param frameName - Timeframe identifier
     * @param backtest - Whether running in backtest mode
     * @returns Promise resolving to array of system prompt strings
     */
    getSystemPrompt: (prompt: Prompt, symbol: string, strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean) => Promise<string[]>;
    /**
     * Retrieves user prompt string for AI input.
     *
     * @param prompt - Prompt containing the loaded module
     * @param symbol - Trading symbol (e.g., "BTCUSDT")
     * @param strategyName - Strategy identifier
     * @param exchangeName - Exchange identifier
     * @param frameName - Timeframe identifier
     * @param backtest - Whether running in backtest mode
     * @returns Promise resolving to user prompt string
     */
    getUserPrompt: (prompt: Prompt, symbol: string, strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean) => Promise<string>;
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
 * Default template service for generating optimizer code snippets.
 * Implements all IOptimizerTemplate methods with Ollama LLM integration.
 *
 * Features:
 * - Multi-timeframe analysis (1m, 5m, 15m, 1h)
 * - JSON structured output for signals
 * - Debug logging to ./dump/strategy
 * - CCXT exchange integration
 * - Walker-based strategy comparison
 *
 * Can be partially overridden in optimizer schema configuration.
 */
declare class OptimizerTemplateService implements IOptimizerTemplate {
    private readonly loggerService;
    /**
     * Generates the top banner with imports and constants.
     *
     * @param symbol - Trading pair symbol
     * @returns Shebang, imports, and WARN_KB constant
     */
    getTopBanner: (symbol: string) => Promise<string>;
    /**
     * Generates default user message for LLM conversation.
     * Simple prompt to read and acknowledge data.
     *
     * @param symbol - Trading pair symbol
     * @param data - Fetched data array
     * @param name - Source name
     * @returns User message with JSON data
     */
    getUserMessage: (symbol: string, data: IOptimizerData[], name: string) => Promise<string>;
    /**
     * Generates default assistant message for LLM conversation.
     * Simple acknowledgment response.
     *
     * @param symbol - Trading pair symbol
     * @param data - Fetched data array
     * @param name - Source name
     * @returns Assistant acknowledgment message
     */
    getAssistantMessage: (symbol: string, data: IOptimizerData[], name: string) => Promise<string>;
    /**
     * Generates Walker configuration code.
     * Compares multiple strategies on test frame.
     *
     * @param walkerName - Unique walker identifier
     * @param exchangeName - Exchange to use for backtesting
     * @param frameName - Test frame name
     * @param strategies - Array of strategy names to compare
     * @returns Generated addWalker() call
     */
    getWalkerTemplate: (walkerName: WalkerName, exchangeName: ExchangeName$1, frameName: FrameName$1, strategies: string[]) => Promise<string>;
    /**
     * Generates Strategy configuration with LLM integration.
     * Includes multi-timeframe analysis and signal generation.
     *
     * @param strategyName - Unique strategy identifier
     * @param interval - Signal throttling interval (e.g., "5m")
     * @param prompt - Strategy logic from getPrompt()
     * @returns Generated addStrategy() call with getSignal() function
     */
    getStrategyTemplate: (strategyName: StrategyName$1, interval: CandleInterval, prompt: string) => Promise<string>;
    /**
     * Generates Exchange configuration code.
     * Uses CCXT Binance with standard formatters.
     *
     * @param symbol - Trading pair symbol (unused, for consistency)
     * @param exchangeName - Unique exchange identifier
     * @returns Generated addExchange() call with CCXT integration
     */
    getExchangeTemplate: (symbol: string, exchangeName: ExchangeName$1) => Promise<string>;
    /**
     * Generates Frame (timeframe) configuration code.
     *
     * @param symbol - Trading pair symbol (unused, for consistency)
     * @param frameName - Unique frame identifier
     * @param interval - Candle interval (e.g., "1m")
     * @param startDate - Frame start date
     * @param endDate - Frame end date
     * @returns Generated addFrame() call
     */
    getFrameTemplate: (symbol: string, frameName: FrameName$1, interval: CandleInterval, startDate: Date, endDate: Date) => Promise<string>;
    /**
     * Generates launcher code to run Walker with event listeners.
     * Includes progress tracking and completion handlers.
     *
     * @param symbol - Trading pair symbol
     * @param walkerName - Walker name to launch
     * @returns Generated Walker.background() call with listeners
     */
    getLauncherTemplate: (symbol: string, walkerName: WalkerName) => Promise<string>;
    /**
     * Generates dumpJson() helper function for debug output.
     * Saves LLM conversations and results to ./dump/strategy/{resultId}/
     *
     * @param symbol - Trading pair symbol (unused, for consistency)
     * @returns Generated async dumpJson() function
     */
    getJsonDumpTemplate: (symbol: string) => Promise<string>;
    /**
     * Generates text() helper for LLM text generation.
     * Uses Ollama deepseek-v3.1:671b model for market analysis.
     *
     * @param symbol - Trading pair symbol (used in prompt)
     * @returns Generated async text() function
     */
    getTextTemplate: (symbol: string) => Promise<string>;
    /**
     * Generates json() helper for structured LLM output.
     * Uses Ollama with JSON schema for trading signals.
     *
     * Signal schema:
     * - position: "wait" | "long" | "short"
     * - note: strategy explanation
     * - priceOpen: entry price
     * - priceTakeProfit: target price
     * - priceStopLoss: stop price
     * - minuteEstimatedTime: expected duration (max 360 min)
     *
     * @param symbol - Trading pair symbol (unused, for consistency)
     * @returns Generated async json() function with signal schema
     */
    getJsonTemplate: (symbol: string) => Promise<string>;
}

/**
 * Service for managing optimizer schema registration and retrieval.
 * Provides validation and registry management for optimizer configurations.
 *
 * Uses ToolRegistry for immutable schema storage.
 */
declare class OptimizerSchemaService {
    readonly loggerService: LoggerService;
    private _registry;
    /**
     * Registers a new optimizer schema.
     * Validates required fields before registration.
     *
     * @param key - Unique optimizer name
     * @param value - Optimizer schema configuration
     * @throws Error if schema validation fails
     */
    register: (key: OptimizerName, value: IOptimizerSchema) => void;
    /**
     * Validates optimizer schema structure.
     * Checks required fields: optimizerName, rangeTrain, source, getPrompt.
     *
     * @param optimizerSchema - Schema to validate
     * @throws Error if validation fails
     */
    private validateShallow;
    /**
     * Partially overrides an existing optimizer schema.
     * Merges provided values with existing schema.
     *
     * @param key - Optimizer name to override
     * @param value - Partial schema values to merge
     * @returns Updated complete schema
     * @throws Error if optimizer not found
     */
    override: (key: OptimizerName, value: Partial<IOptimizerSchema>) => IOptimizerSchema;
    /**
     * Retrieves optimizer schema by name.
     *
     * @param key - Optimizer name
     * @returns Complete optimizer schema
     * @throws Error if optimizer not found
     */
    get: (key: OptimizerName) => IOptimizerSchema;
}

/**
 * Service for validating optimizer existence and managing optimizer registry.
 * Maintains a Map of registered optimizers for validation purposes.
 *
 * Uses memoization for efficient repeated validation checks.
 */
declare class OptimizerValidationService {
    private readonly loggerService;
    private _optimizerMap;
    /**
     * Adds optimizer to validation registry.
     * Prevents duplicate optimizer names.
     *
     * @param optimizerName - Unique optimizer identifier
     * @param optimizerSchema - Complete optimizer schema
     * @throws Error if optimizer with same name already exists
     */
    addOptimizer: (optimizerName: OptimizerName, optimizerSchema: IOptimizerSchema) => void;
    /**
     * Validates that optimizer exists in registry.
     * Memoized for performance on repeated checks.
     *
     * @param optimizerName - Optimizer name to validate
     * @param source - Source method name for error messages
     * @throws Error if optimizer not found
     */
    validate: (optimizerName: OptimizerName, source: string) => void;
    /**
     * Lists all registered optimizer schemas.
     *
     * @returns Array of all optimizer schemas
     */
    list: () => Promise<IOptimizerSchema[]>;
}

/**
 * Client implementation for optimizer operations.
 *
 * Features:
 * - Data collection from multiple sources with pagination
 * - LLM conversation history building
 * - Strategy code generation with templates
 * - File export with callbacks
 *
 * Used by OptimizerConnectionService to create optimizer instances.
 */
declare class ClientOptimizer implements IOptimizer {
    readonly params: IOptimizerParams;
    readonly onProgress: (progress: ProgressOptimizerContract) => void;
    constructor(params: IOptimizerParams, onProgress: (progress: ProgressOptimizerContract) => void);
    /**
     * Fetches data from all sources and generates strategy metadata.
     * Processes each training range and builds LLM conversation history.
     *
     * @param symbol - Trading pair symbol
     * @returns Array of generated strategies with conversation context
     */
    getData: (symbol: string) => Promise<IOptimizerStrategy[]>;
    /**
     * Generates complete executable strategy code.
     * Includes imports, helpers, strategies, walker, and launcher.
     *
     * @param symbol - Trading pair symbol
     * @returns Generated TypeScript/JavaScript code as string
     */
    getCode: (symbol: string) => Promise<string>;
    /**
     * Generates and saves strategy code to file.
     * Creates directory if needed, writes .mjs file.
     *
     * @param symbol - Trading pair symbol
     * @param path - Output directory path (default: "./")
     */
    dump: (symbol: string, path?: string) => Promise<void>;
}

/**
 * Type helper for optimizer method signatures.
 * Maps IOptimizer interface methods to any return type.
 */
type TOptimizer$1 = {
    [key in keyof IOptimizer]: any;
};
/**
 * Service for creating and caching optimizer client instances.
 * Handles dependency injection and template merging.
 *
 * Features:
 * - Memoized optimizer instances (one per optimizerName)
 * - Template merging (custom + defaults)
 * - Logger injection
 * - Delegates to ClientOptimizer for actual operations
 */
declare class OptimizerConnectionService implements TOptimizer$1 {
    private readonly loggerService;
    private readonly optimizerSchemaService;
    private readonly optimizerTemplateService;
    /**
     * Creates or retrieves cached optimizer instance.
     * Memoized by optimizerName for performance.
     *
     * Merges custom templates from schema with defaults from OptimizerTemplateService.
     *
     * @param optimizerName - Unique optimizer identifier
     * @returns ClientOptimizer instance with resolved dependencies
     */
    getOptimizer: ((optimizerName: OptimizerName) => ClientOptimizer) & functools_kit.IClearableMemoize<string> & functools_kit.IControlMemoize<string, ClientOptimizer>;
    /**
     * Fetches data from all sources and generates strategy metadata.
     *
     * @param symbol - Trading pair symbol
     * @param optimizerName - Optimizer identifier
     * @returns Array of generated strategies with conversation context
     */
    getData: (symbol: string, optimizerName: string) => Promise<IOptimizerStrategy[]>;
    /**
     * Generates complete executable strategy code.
     *
     * @param symbol - Trading pair symbol
     * @param optimizerName - Optimizer identifier
     * @returns Generated TypeScript/JavaScript code as string
     */
    getCode: (symbol: string, optimizerName: string) => Promise<string>;
    /**
     * Generates and saves strategy code to file.
     *
     * @param symbol - Trading pair symbol
     * @param optimizerName - Optimizer identifier
     * @param path - Output directory path (optional)
     */
    dump: (symbol: string, optimizerName: string, path?: string) => Promise<void>;
}

/**
 * Type definition for optimizer methods.
 * Maps all keys of IOptimizer to any type.
 * Used for dynamic method routing in OptimizerGlobalService.
 */
type TOptimizer = {
    [key in keyof IOptimizer]: any;
};
/**
 * Global service for optimizer operations with validation.
 * Entry point for public API, performs validation before delegating to ConnectionService.
 *
 * Workflow:
 * 1. Log operation
 * 2. Validate optimizer exists
 * 3. Delegate to OptimizerConnectionService
 */
declare class OptimizerGlobalService implements TOptimizer {
    private readonly loggerService;
    private readonly optimizerConnectionService;
    private readonly optimizerValidationService;
    /**
     * Fetches data from all sources and generates strategy metadata.
     * Validates optimizer existence before execution.
     *
     * @param symbol - Trading pair symbol
     * @param optimizerName - Optimizer identifier
     * @returns Array of generated strategies with conversation context
     * @throws Error if optimizer not found
     */
    getData: (symbol: string, optimizerName: string) => Promise<IOptimizerStrategy[]>;
    /**
     * Generates complete executable strategy code.
     * Validates optimizer existence before execution.
     *
     * @param symbol - Trading pair symbol
     * @param optimizerName - Optimizer identifier
     * @returns Generated TypeScript/JavaScript code as string
     * @throws Error if optimizer not found
     */
    getCode: (symbol: string, optimizerName: string) => Promise<string>;
    /**
     * Generates and saves strategy code to file.
     * Validates optimizer existence before execution.
     *
     * @param symbol - Trading pair symbol
     * @param optimizerName - Optimizer identifier
     * @param path - Output directory path (optional)
     * @throws Error if optimizer not found
     */
    dump: (symbol: string, optimizerName: string, path?: string) => Promise<void>;
}

/**
 * Main engine object containing all services.
 * Provides unified access to the entire service layer.
 */
declare const engine: {
    optimizerGlobalService: OptimizerGlobalService;
    optimizerConnectionService: OptimizerConnectionService;
    optimizerValidationService: OptimizerValidationService;
    optimizerSchemaService: OptimizerSchemaService;
    optimizerTemplateService: OptimizerTemplateService;
    outlineMarkdownService: OutlineMarkdownService;
    promptCacheService: PromptCacheService;
    resolvePromptService: ResolvePromptService;
    runnerPublicService: RunnerPublicService;
    runnerPrivateService: RunnerPrivateService;
    contextService: {
        readonly context: IContext;
    };
    loggerService: LoggerService;
};

export { CompletionName, type IOptimizerCallbacks, type IOptimizerData, type IOptimizerFetchArgs, type IOptimizerFilterArgs, type IOptimizerRange, type IOptimizerSchema, type IOptimizerSource, type IOptimizerStrategy, type IOptimizerTemplate, type MessageModel, type MessageRole, Module, Optimizer, type ProgressOptimizerContract, Prompt, type PromptModel, addOptimizerSchema, alibaba, claude, cohere, commitPrompt, deepseek, dumpSignalData, getOptimizerSchema, glm4, gpt5, grok, groq, hf, engine as lib, listOptimizerSchema, listenError, listenOptimizerProgress, mistral, ollama, perplexity, setLogger, validate };

import { ILogger } from "./Logger.interface";
import { MessageModel } from "../model/Message.model";
import ProgressOptimizerContract from "../contract/ProgressOptimizer.contract";

/**
 * Candle interval type for trading timeframes.
 */
export type CandleInterval = "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h" | "12h" | "1d" | "3d" | "1w" | "1M";

/**
 * Unique string identifier for registered exchanges.
 */
export type ExchangeName = string;

/**
 * Unique string identifier for registered frames.
 */
export type FrameName = string;

/**
 * Unique string identifier for registered walkers.
 */
export type WalkerName = string;

/**
 * Unique string identifier for registered strategies.
 */
export type StrategyName = string;

/**
 * Unique identifier for data rows in optimizer sources.
 * Can be either a string or numeric ID.
 */
type RowId = string | number;

/**
 * Time range configuration for optimizer training or testing periods.
 * Used to define date boundaries for data collection.
 */
export interface IOptimizerRange {
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
export interface IOptimizerData {
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
export interface IOptimizerFilterArgs {
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
export interface IOptimizerFetchArgs extends IOptimizerFilterArgs {
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
export interface IOptimizerSourceFn<Data extends IOptimizerData = any> {
  (args: IOptimizerFetchArgs): Data[] | Promise<Data[]>;
}

/**
 * Generated strategy data with LLM conversation history.
 * Contains the full context used to generate a trading strategy.
 */
export interface IOptimizerStrategy {
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
export interface IOptimizerSource<Data extends IOptimizerData = any> {
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
  user?: (
    symbol: string,
    data: Data[],
    name: string
  ) => string | Promise<string>;

  /**
   * Optional custom formatter for assistant messages.
   * If not provided, uses default template from OptimizerTemplateService.
   *
   * @param symbol - Trading pair symbol
   * @param data - Fetched data array
   * @param name - Source name
   * @returns Formatted assistant message content
   */
  assistant?: (
    symbol: string,
    data: Data[],
    name: string
  ) => string | Promise<string>;
}

/**
 * Union type for data source configuration.
 * Can be either a simple fetch function or a full source configuration object.
 */
type Source<Data extends IOptimizerData = any> =
  | IOptimizerSourceFn<Data>
  | IOptimizerSource<Data>;

/**
 * Lifecycle callbacks for optimizer events.
 * Provides hooks for monitoring and validating optimizer operations.
 */
export interface IOptimizerCallbacks {
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
  onSourceData?: <Data extends IOptimizerData = any>(
    symbol: string,
    sourceName: string,
    data: Data[],
    startDate: Date,
    endDate: Date
  ) => void | Promise<void>;
}

/**
 * Template interface for generating code snippets and LLM messages.
 * Each method returns TypeScript/JavaScript code as a string.
 */
export interface IOptimizerTemplate {
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
  getUserMessage<Data extends IOptimizerData = any>(
    symbol: string,
    data: Data[],
    name: string
  ): string | Promise<string>;

  /**
   * Generates default assistant message content for LLM conversation.
   *
   * @param symbol - Trading pair symbol
   * @param data - Data array from source
   * @param name - Source name
   * @returns Formatted assistant message content
   */
  getAssistantMessage<Data extends IOptimizerData = any>(
    symbol: string,
    data: Data[],
    name: string
  ): string | Promise<string>;

  /**
   * Generates Walker configuration code.
   *
   * @param walkerName - Unique walker identifier
   * @param exchangeName - Exchange name to use
   * @param frameName - Frame name for testing
   * @param strategies - Array of strategy names to compare
   * @returns Generated addWalker() call
   */
  getWalkerTemplate(
    walkerName: WalkerName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    strategies: string[]
  ): string | Promise<string>;

  /**
   * Generates Exchange configuration code.
   *
   * @param symbol - Trading pair symbol
   * @param exchangeName - Unique exchange identifier
   * @returns Generated addExchange() call with CCXT integration
   */
  getExchangeTemplate(
    symbol: string,
    exchangeName: ExchangeName
  ): string | Promise<string>;

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
  getFrameTemplate(
    symbol: string,
    frameName: FrameName,
    interval: CandleInterval,
    startDate: Date,
    endDate: Date
  ): string | Promise<string>;

  /**
   * Generates Strategy configuration code with LLM integration.
   *
   * @param strategyName - Unique strategy identifier
   * @param interval - Signal throttling interval (e.g., "5m")
   * @param prompt - Strategy logic prompt from getPrompt()
   * @returns Generated addStrategy() call with getSignal() function
   */
  getStrategyTemplate(
    strategyName: StrategyName,
    interval: CandleInterval,
    prompt: string
  ): string | Promise<string>;

  /**
   * Generates launcher code to run Walker and listen to events.
   *
   * @param symbol - Trading pair symbol
   * @param walkerName - Walker name to launch
   * @returns Generated Walker.background() call with event listeners
   */
  getLauncherTemplate(
    symbol: string,
    walkerName: WalkerName
  ): string | Promise<string>;

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
export interface IOptimizerSchema {
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
  getPrompt: (
    symbol: string,
    messages: MessageModel[]
  ) => string | Promise<string>;

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
export interface IOptimizerParams extends IOptimizerSchema {
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
export interface IOptimizer {
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
export type OptimizerName = string;

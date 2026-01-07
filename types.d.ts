import * as di_scoped from 'di-scoped';
import * as functools_kit from 'functools-kit';
import { Subject } from 'functools-kit';

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
     * Exchange name enum to validate
     * @example { BINANCE: "binance", BYBIT: "bybit" }
     */
    ExchangeName?: T;
    /**
     * Frame (timeframe) name enum to validate
     * @example { Q1_2024: "2024-Q1", Q2_2024: "2024-Q2" }
     */
    FrameName?: T;
    /**
     * Strategy name enum to validate
     * @example { MOMENTUM_BTC: "momentum-btc" }
     */
    StrategyName?: T;
    /**
     * Risk profile name enum to validate
     * @example { CONSERVATIVE: "conservative", AGGRESSIVE: "aggressive" }
     */
    RiskName?: T;
    /**
     * Sizing strategy name enum to validate
     * @example { FIXED_1000: "fixed-1000" }
     */
    SizingName?: T;
    /**
     * Optimizer name enum to validate
     * @example { GRID_SEARCH: "grid-search" }
     */
    OptimizerName?: T;
    /**
     * Walker (parameter sweep) name enum to validate
     * @example { RSI_SWEEP: "rsi-sweep" }
     */
    WalkerName?: T;
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

/**
 * Stops the strategy from generating new signals.
 *
 * Sets internal flag to prevent strategy from opening new signals.
 * Current active signal (if any) will complete normally.
 * Backtest/Live mode will stop at the next safe point (idle state or after signal closes).
 *
 * Automatically detects backtest/live mode from execution context.
 *
 * @param symbol - Trading pair symbol
 * @param strategyName - Strategy name to stop
 * @returns Promise that resolves when stop flag is set
 *
 * @example
 * ```typescript
 * import { stop } from "backtest-kit";
 *
 * // Stop strategy after some condition
 * await stop("BTCUSDT", "my-strategy");
 * ```
 */
declare function stop(symbol: string): Promise<void>;
/**
 * Cancels the scheduled signal without stopping the strategy.
 *
 * Clears the scheduled signal (waiting for priceOpen activation).
 * Does NOT affect active pending signals or strategy operation.
 * Does NOT set stop flag - strategy can continue generating new signals.
 *
 * Automatically detects backtest/live mode from execution context.
 *
 * @param symbol - Trading pair symbol
 * @param strategyName - Strategy name
 * @param cancelId - Optional cancellation ID for tracking user-initiated cancellations
 * @returns Promise that resolves when scheduled signal is cancelled
 *
 * @example
 * ```typescript
 * import { cancel } from "backtest-kit";
 *
 * // Cancel scheduled signal with custom ID
 * await cancel("BTCUSDT", "my-strategy", "manual-cancel-001");
 * ```
 */
declare function cancel(symbol: string, cancelId?: string): Promise<void>;
/**
 * Executes partial close at profit level (moving toward TP).
 *
 * Closes a percentage of the active pending position at profit.
 * Price must be moving toward take profit (in profit direction).
 *
 * Automatically detects backtest/live mode from execution context.
 *
 * @param symbol - Trading pair symbol
 * @param percentToClose - Percentage of position to close (0-100, absolute value)
 * @returns Promise that resolves when state is updated
 *
 * @throws Error if currentPrice is not in profit direction:
 *   - LONG: currentPrice must be > priceOpen
 *   - SHORT: currentPrice must be < priceOpen
 *
 * @example
 * ```typescript
 * import { partialProfit } from "backtest-kit";
 *
 * // Close 30% of LONG position at profit
 * await partialProfit("BTCUSDT", 30, 45000);
 * ```
 */
declare function partialProfit(symbol: string, percentToClose: number): Promise<void>;
/**
 * Executes partial close at loss level (moving toward SL).
 *
 * Closes a percentage of the active pending position at loss.
 * Price must be moving toward stop loss (in loss direction).
 *
 * Automatically detects backtest/live mode from execution context.
 *
 * @param symbol - Trading pair symbol
 * @param percentToClose - Percentage of position to close (0-100, absolute value)
 * @returns Promise that resolves when state is updated
 *
 * @throws Error if currentPrice is not in loss direction:
 *   - LONG: currentPrice must be < priceOpen
 *   - SHORT: currentPrice must be > priceOpen
 *
 * @example
 * ```typescript
 * import { partialLoss } from "backtest-kit";
 *
 * // Close 40% of LONG position at loss
 * await partialLoss("BTCUSDT", 40, 38000);
 * ```
 */
declare function partialLoss(symbol: string, percentToClose: number): Promise<void>;

declare const GLOBAL_CONFIG: {
    /**
     * Time to wait for scheduled signal to activate (in minutes)
     * If signal does not activate within this time, it will be cancelled.
     */
    CC_SCHEDULE_AWAIT_MINUTES: number;
    /**
     * Number of candles to use for average price calculation (VWAP)
     * Default: 5 candles (last 5 minutes when using 1m interval)
     */
    CC_AVG_PRICE_CANDLES_COUNT: number;
    /**
     * Slippage percentage applied to entry and exit prices.
     * Simulates market impact and order book depth.
     * Applied twice (entry and exit) for realistic execution simulation.
     * Default: 0.1% per transaction
     */
    CC_PERCENT_SLIPPAGE: number;
    /**
     * Fee percentage charged per transaction.
     * Applied twice (entry and exit) for total fee calculation.
     * Default: 0.1% per transaction (total 0.2%)
     */
    CC_PERCENT_FEE: number;
    /**
     * Minimum TakeProfit distance from priceOpen (percentage)
     * Must be greater than (slippage + fees) to ensure profitable trades
     *
     * Calculation:
     * - Slippage effect: ~0.2% (0.1% × 2 transactions)
     * - Fees: 0.2% (0.1% × 2 transactions)
     * - Minimum profit buffer: 0.1%
     * - Total: 0.5%
     *
     * Default: 0.5% (covers all costs + minimum profit margin)
     */
    CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: number;
    /**
     * Minimum StopLoss distance from priceOpen (percentage)
     * Prevents signals from being immediately stopped out due to price volatility
     * Default: 0.5% (buffer to avoid instant stop loss on normal market fluctuations)
     */
    CC_MIN_STOPLOSS_DISTANCE_PERCENT: number;
    /**
     * Maximum StopLoss distance from priceOpen (percentage)
     * Prevents catastrophic losses from extreme StopLoss values
     * Default: 20% (one signal cannot lose more than 20% of position)
     */
    CC_MAX_STOPLOSS_DISTANCE_PERCENT: number;
    /**
     * Maximum signal lifetime in minutes
     * Prevents eternal signals that block risk limits for weeks/months
     * Default: 1440 minutes (1 day)
     */
    CC_MAX_SIGNAL_LIFETIME_MINUTES: number;
    /**
     * Maximum time allowed for signal generation (in seconds).
     * Prevents long-running or stuck signal generation routines from blocking
     * execution or consuming resources indefinitely. If generation exceeds this
     * threshold the attempt should be aborted, logged and optionally retried.
     *
     * Default: 180 seconds (3 minutes)
     */
    CC_MAX_SIGNAL_GENERATION_SECONDS: number;
    /**
     * Number of retries for getCandles function
     * Default: 3 retries
     */
    CC_GET_CANDLES_RETRY_COUNT: number;
    /**
     * Delay between retries for getCandles function (in milliseconds)
     * Default: 5000 ms (5 seconds)
     */
    CC_GET_CANDLES_RETRY_DELAY_MS: number;
    /**
     * Maximum allowed deviation factor for price anomaly detection.
     * Price should not be more than this factor lower than reference price.
     *
     * Reasoning:
     * - Incomplete candles from Binance API typically have prices near 0 (e.g., $0.01-1)
     * - Normal BTC price ranges: $20,000-100,000
     * - Factor 1000 catches prices below $20-100 when median is $20,000-100,000
     * - Factor 100 would be too permissive (allows $200 when median is $20,000)
     * - Factor 10000 might be too strict for low-cap altcoins
     *
     * Example: BTC at $50,000 median → threshold $50 (catches $0.01-1 anomalies)
     */
    CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR: number;
    /**
     * Minimum number of candles required for reliable median calculation.
     * Below this threshold, use simple average instead of median.
     *
     * Reasoning:
     * - Each candle provides 4 price points (OHLC)
     * - 5 candles = 20 price points, sufficient for robust median calculation
     * - Below 5 candles, single anomaly can heavily skew median
     * - Statistical rule of thumb: minimum 7-10 data points for median stability
     * - Average is more stable than median for small datasets (n < 20)
     *
     * Example: 3 candles = 12 points (use average), 5 candles = 20 points (use median)
     */
    CC_GET_CANDLES_MIN_CANDLES_FOR_MEDIAN: number;
    /**
     * Controls visibility of signal notes in markdown report tables.
     * When enabled, the "Note" column will be displayed in all markdown reports
     * (backtest, live, schedule, risk, etc.)
     *
     * Default: false (notes are hidden to reduce table width and improve readability)
     */
    CC_REPORT_SHOW_SIGNAL_NOTE: boolean;
};
/**
 * Type for global configuration object.
 */
type GlobalConfig = typeof GLOBAL_CONFIG;

/**
 * Mapping of available table/markdown reports to their column definitions.
 *
 * Each property references a column definition object imported from
 * `src/assets/*.columns`. These are used by markdown/report generators
 * (backtest, live, schedule, risk, heat, performance, partial, walker).
 */
declare const COLUMN_CONFIG: {
    /** Columns used in backtest markdown tables and reports */
    backtest_columns: ColumnModel<IStrategyTickResultClosed>[];
    /** Columns used by heatmap / heat reports */
    heat_columns: ColumnModel<IHeatmapRow>[];
    /** Columns for live trading reports and logs */
    live_columns: ColumnModel<TickEvent>[];
    /** Columns for partial-results / incremental reports */
    partial_columns: ColumnModel<PartialEvent>[];
    /** Columns for performance summary reports */
    performance_columns: ColumnModel<MetricStats>[];
    /** Columns for risk-related reports */
    risk_columns: ColumnModel<RiskEvent>[];
    /** Columns for scheduled report output */
    schedule_columns: ColumnModel<ScheduledEvent>[];
    /** Walker: PnL summary columns */
    walker_pnl_columns: ColumnModel<SignalData$1>[];
    /** Walker: strategy-level summary columns */
    walker_strategy_columns: ColumnModel<IStrategyResult>[];
};
/**
 * Type for the column configuration object.
 */
type ColumnConfig = typeof COLUMN_CONFIG;

/**
 * Interface representing a logging mechanism for the swarm system.
 * Provides methods to record messages at different severity levels, used across components like agents, sessions, states, storage, swarms, history, embeddings, completions, and policies.
 * Logs are utilized to track lifecycle events (e.g., initialization, disposal), operational details (e.g., tool calls, message emissions), validation outcomes (e.g., policy checks), and errors (e.g., persistence failures), aiding in debugging, monitoring, and auditing.
*/
interface ILogger {
    /**
     * Logs a general-purpose message.
     * Used throughout the swarm system to record significant events or state changes, such as agent execution, session connections, or storage updates.
     */
    log(topic: string, ...args: any[]): void;
    /**
     * Logs a debug-level message.
     * Employed for detailed diagnostic information, such as intermediate states during agent tool calls, swarm navigation changes, or embedding creation processes, typically enabled in development or troubleshooting scenarios.
     */
    debug(topic: string, ...args: any[]): void;
    /**
     * Logs an info-level message.
     * Used to record informational updates, such as successful completions, policy validations, or history commits, providing a high-level overview of system activity without excessive detail.
     */
    info(topic: string, ...args: any[]): void;
    /**
     * Logs a warning-level message.
     * Used to record potentially problematic situations that don't prevent execution but may require attention, such as missing data, unexpected conditions, or deprecated usage.
     */
    warn(topic: string, ...args: any[]): void;
}

/**
 * Sets custom logger implementation for the framework.
 *
 * All log messages from internal services will be forwarded to the provided logger
 * with automatic context injection (strategyName, exchangeName, symbol, etc.).
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
declare function setLogger(logger: ILogger): void;
/**
 * Sets global configuration parameters for the framework.
 * @param config - Partial configuration object to override default settings
 * @param _unsafe - Skip config validations - required for testbed
 *
 * @example
 * ```typescript
 * setConfig({
 *   CC_SCHEDULE_AWAIT_MINUTES: 90,
 * });
 * ```
 */
declare function setConfig(config: Partial<GlobalConfig>, _unsafe?: boolean): void;
/**
 * Retrieves a copy of the current global configuration.
 *
 * Returns a shallow copy of the current GLOBAL_CONFIG to prevent accidental mutations.
 * Use this to inspect the current configuration state without modifying it.
 *
 * @returns {GlobalConfig} A copy of the current global configuration object
 *
 * @example
 * ```typescript
 * const currentConfig = getConfig();
 * console.log(currentConfig.CC_SCHEDULE_AWAIT_MINUTES);
 * ```
 */
declare function getConfig(): {
    CC_SCHEDULE_AWAIT_MINUTES: number;
    CC_AVG_PRICE_CANDLES_COUNT: number;
    CC_PERCENT_SLIPPAGE: number;
    CC_PERCENT_FEE: number;
    CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: number;
    CC_MIN_STOPLOSS_DISTANCE_PERCENT: number;
    CC_MAX_STOPLOSS_DISTANCE_PERCENT: number;
    CC_MAX_SIGNAL_LIFETIME_MINUTES: number;
    CC_MAX_SIGNAL_GENERATION_SECONDS: number;
    CC_GET_CANDLES_RETRY_COUNT: number;
    CC_GET_CANDLES_RETRY_DELAY_MS: number;
    CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR: number;
    CC_GET_CANDLES_MIN_CANDLES_FOR_MEDIAN: number;
    CC_REPORT_SHOW_SIGNAL_NOTE: boolean;
};
/**
 * Retrieves the default configuration object for the framework.
 *
 * Returns a reference to the default configuration with all preset values.
 * Use this to see what configuration options are available and their default values.
 *
 * @returns {GlobalConfig} The default configuration object
 *
 * @example
 * ```typescript
 * const defaultConfig = getDefaultConfig();
 * console.log(defaultConfig.CC_SCHEDULE_AWAIT_MINUTES);
 * ```
 */
declare function getDefaultConfig(): Readonly<{
    CC_SCHEDULE_AWAIT_MINUTES: number;
    CC_AVG_PRICE_CANDLES_COUNT: number;
    CC_PERCENT_SLIPPAGE: number;
    CC_PERCENT_FEE: number;
    CC_MIN_TAKEPROFIT_DISTANCE_PERCENT: number;
    CC_MIN_STOPLOSS_DISTANCE_PERCENT: number;
    CC_MAX_STOPLOSS_DISTANCE_PERCENT: number;
    CC_MAX_SIGNAL_LIFETIME_MINUTES: number;
    CC_MAX_SIGNAL_GENERATION_SECONDS: number;
    CC_GET_CANDLES_RETRY_COUNT: number;
    CC_GET_CANDLES_RETRY_DELAY_MS: number;
    CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR: number;
    CC_GET_CANDLES_MIN_CANDLES_FOR_MEDIAN: number;
    CC_REPORT_SHOW_SIGNAL_NOTE: boolean;
}>;
/**
 * Sets custom column configurations for markdown report generation.
 *
 * Allows overriding default column definitions for any report type.
 * All columns are validated before assignment to ensure structural correctness.
 *
 * @param columns - Partial column configuration object to override default column settings
 * @param _unsafe - Skip column validations - required for testbed
 *
 * @example
 * ```typescript
 * setColumns({
 *   backtest_columns: [
 *     {
 *       key: "customId",
 *       label: "Custom ID",
 *       format: (data) => data.signal.id,
 *       isVisible: () => true
 *     }
 *   ],
 * });
 * ```
 *
 * @throws {Error} If column configuration is invalid
 */
declare function setColumns(columns: Partial<ColumnConfig>, _unsafe?: boolean): void;
/**
 * Retrieves a copy of the current column configuration for markdown report generation.
 *
 * Returns a shallow copy of the current COLUMN_CONFIG to prevent accidental mutations.
 * Use this to inspect the current column definitions without modifying them.
 *
 * @returns {ColumnConfig} A copy of the current column configuration object
 *
 * @example
 * ```typescript
 * const currentColumns = getColumns();
 * console.log(currentColumns.backtest_columns.length);
 * ```
 */
declare function getColumns(): {
    backtest_columns: ColumnModel<IStrategyTickResultClosed>[];
    heat_columns: ColumnModel<IHeatmapRow>[];
    live_columns: ColumnModel<TickEvent>[];
    partial_columns: ColumnModel<PartialEvent>[];
    performance_columns: ColumnModel<MetricStats>[];
    risk_columns: ColumnModel<RiskEvent>[];
    schedule_columns: ColumnModel<ScheduledEvent>[];
    walker_pnl_columns: ColumnModel<SignalData$1>[];
    walker_strategy_columns: ColumnModel<IStrategyResult>[];
};
/**
 * Retrieves the default column configuration object for markdown report generation.
 *
 * Returns a reference to the default column definitions with all preset values.
 * Use this to see what column options are available and their default definitions.
 *
 * @returns {ColumnConfig} The default column configuration object
 *
 * @example
 * ```typescript
 * const defaultColumns = getDefaultColumns();
 * console.log(defaultColumns.backtest_columns);
 * ```
 */
declare function getDefaultColumns(): Readonly<{
    backtest_columns: ColumnModel<IStrategyTickResultClosed>[];
    heat_columns: ColumnModel<IHeatmapRow>[];
    live_columns: ColumnModel<TickEvent>[];
    partial_columns: ColumnModel<PartialEvent>[];
    performance_columns: ColumnModel<MetricStats>[];
    risk_columns: ColumnModel<RiskEvent>[];
    schedule_columns: ColumnModel<ScheduledEvent>[];
    walker_pnl_columns: ColumnModel<SignalData$1>[];
    walker_strategy_columns: ColumnModel<IStrategyResult>[];
}>;

/**
 * Execution context containing runtime parameters for strategy/exchange operations.
 *
 * Propagated through ExecutionContextService to provide implicit context
 * for getCandles(), tick(), backtest() and other operations.
 */
interface IExecutionContext {
    /** Trading pair symbol (e.g., "BTCUSDT") */
    symbol: string;
    /** Current timestamp for operation */
    when: Date;
    /** Whether running in backtest mode (true) or live mode (false) */
    backtest: boolean;
}
/**
 * Scoped service for execution context propagation.
 *
 * Uses di-scoped for implicit context passing without explicit parameters.
 * Context includes symbol, when (timestamp), and backtest flag.
 *
 * Used by GlobalServices to inject context into operations.
 *
 * @example
 * ```typescript
 * ExecutionContextService.runInContext(
 *   async () => {
 *     // Inside this callback, context is automatically available
 *     return await someOperation();
 *   },
 *   { symbol: "BTCUSDT", when: new Date(), backtest: true }
 * );
 * ```
 */
declare const ExecutionContextService: (new () => {
    readonly context: IExecutionContext;
}) & Omit<{
    new (context: IExecutionContext): {
        readonly context: IExecutionContext;
    };
}, "prototype"> & di_scoped.IScopedClassRun<[context: IExecutionContext]>;
/**
 * Type helper for ExecutionContextService instance.
 * Used for dependency injection type annotations.
 */
type TExecutionContextService = InstanceType<typeof ExecutionContextService>;

/**
 * Candle time interval for fetching historical data.
 */
type CandleInterval = "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h";
/**
 * Single OHLCV candle data point.
 * Used for VWAP calculation and backtesting.
 */
interface ICandleData {
    /** Unix timestamp in milliseconds when candle opened */
    timestamp: number;
    /** Opening price at candle start */
    open: number;
    /** Highest price during candle period */
    high: number;
    /** Lowest price during candle period */
    low: number;
    /** Closing price at candle end */
    close: number;
    /** Trading volume during candle period */
    volume: number;
}
/**
 * Exchange parameters passed to ClientExchange constructor.
 * Combines schema with runtime dependencies.
 */
interface IExchangeParams extends IExchangeSchema {
    /** Logger service for debug output */
    logger: ILogger;
    /** Execution context service (symbol, when, backtest flag) */
    execution: TExecutionContextService;
}
/**
 * Optional callbacks for exchange data events.
 */
interface IExchangeCallbacks {
    /** Called when candle data is fetched */
    onCandleData: (symbol: string, interval: CandleInterval, since: Date, limit: number, data: ICandleData[]) => void;
}
/**
 * Exchange schema registered via addExchange().
 * Defines candle data source and formatting logic.
 */
interface IExchangeSchema {
    /** Unique exchange identifier for registration */
    exchangeName: ExchangeName;
    /** Optional developer note for documentation */
    note?: string;
    /**
     * Fetch candles from data source (API or database).
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param interval - Candle time interval (e.g., "1m", "1h")
     * @param since - Start date for candle fetching
     * @param limit - Maximum number of candles to fetch
     * @returns Promise resolving to array of OHLCV candle data
     */
    getCandles: (symbol: string, interval: CandleInterval, since: Date, limit: number) => Promise<ICandleData[]>;
    /**
     * Format quantity according to exchange precision rules.
     *
     * @param symbol - Trading pair symbol
     * @param quantity - Raw quantity value
     * @returns Promise resolving to formatted quantity string
     */
    formatQuantity: (symbol: string, quantity: number) => Promise<string>;
    /**
     * Format price according to exchange precision rules.
     *
     * @param symbol - Trading pair symbol
     * @param price - Raw price value
     * @returns Promise resolving to formatted price string
     */
    formatPrice: (symbol: string, price: number) => Promise<string>;
    /** Optional lifecycle event callbacks (onCandleData) */
    callbacks?: Partial<IExchangeCallbacks>;
}
/**
 * Exchange interface implemented by ClientExchange.
 * Provides candle data access and VWAP calculation.
 */
interface IExchange {
    /**
     * Fetch historical candles backwards from execution context time.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param interval - Candle time interval (e.g., "1m", "1h")
     * @param limit - Maximum number of candles to fetch
     * @returns Promise resolving to array of candle data
     */
    getCandles: (symbol: string, interval: CandleInterval, limit: number) => Promise<ICandleData[]>;
    /**
     * Fetch future candles forward from execution context time (for backtest).
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param interval - Candle time interval (e.g., "1m", "1h")
     * @param limit - Maximum number of candles to fetch
     * @returns Promise resolving to array of candle data
     */
    getNextCandles: (symbol: string, interval: CandleInterval, limit: number) => Promise<ICandleData[]>;
    /**
     * Format quantity for exchange precision.
     *
     * @param symbol - Trading pair symbol
     * @param quantity - Raw quantity value
     * @returns Promise resolving to formatted quantity string
     */
    formatQuantity: (symbol: string, quantity: number) => Promise<string>;
    /**
     * Format price for exchange precision.
     *
     * @param symbol - Trading pair symbol
     * @param price - Raw price value
     * @returns Promise resolving to formatted price string
     */
    formatPrice: (symbol: string, price: number) => Promise<string>;
    /**
     * Calculate VWAP from last 5 1-minute candles.
     *
     * Formula: VWAP = Σ(Typical Price × Volume) / Σ(Volume)
     * where Typical Price = (High + Low + Close) / 3
     *
     * @param symbol - Trading pair symbol
     * @returns Promise resolving to volume-weighted average price
     */
    getAveragePrice: (symbol: string) => Promise<number>;
}
/**
 * Unique exchange identifier.
 */
type ExchangeName = string;

/**
 * Timeframe interval for backtest period generation.
 * Determines the granularity of timestamps in the generated timeframe array.
 *
 * Minutes: 1m, 3m, 5m, 15m, 30m
 * Hours: 1h, 2h, 4h, 6h, 8h, 12h
 * Days: 1d, 3d
 */
type FrameInterval = "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h" | "12h" | "1d" | "3d";
/**
 * Frame parameters passed to ClientFrame constructor.
 * Extends IFrameSchema with logger instance for internal logging.
 */
interface IFrameParams extends IFrameSchema {
    /** Logger service for debug output */
    logger: ILogger;
}
/**
 * Callbacks for frame lifecycle events.
 */
interface IFrameCallbacks {
    /**
     * Called after timeframe array generation.
     * Useful for logging or validating the generated timeframes.
     *
     * @param timeframe - Array of Date objects representing tick timestamps
     * @param startDate - Start of the backtest period
     * @param endDate - End of the backtest period
     * @param interval - Interval used for generation
     */
    onTimeframe: (timeframe: Date[], startDate: Date, endDate: Date, interval: FrameInterval) => void;
}
/**
 * Frame schema registered via addFrame().
 * Defines backtest period and interval for timestamp generation.
 *
 * @example
 * ```typescript
 * addFrame({
 *   frameName: "1d-backtest",
 *   interval: "1m",
 *   startDate: new Date("2024-01-01T00:00:00Z"),
 *   endDate: new Date("2024-01-02T00:00:00Z"),
 *   callbacks: {
 *     onTimeframe: (timeframe, startDate, endDate, interval) => {
 *       console.log(`Generated ${timeframe.length} timestamps`);
 *     },
 *   },
 * });
 * ```
 */
interface IFrameSchema {
    /** Unique identifier for this frame */
    frameName: FrameName;
    /** Optional developer note for documentation */
    note?: string;
    /** Interval for timestamp generation */
    interval: FrameInterval;
    /** Start of backtest period (inclusive) */
    startDate: Date;
    /** End of backtest period (inclusive) */
    endDate: Date;
    /** Optional lifecycle callbacks */
    callbacks?: Partial<IFrameCallbacks>;
}
/**
 * Frame interface for timeframe generation.
 * Used internally by backtest orchestration.
 */
interface IFrame {
    /**
     * Generates array of timestamps for backtest iteration.
     * Timestamps are spaced according to the configured interval.
     *
     * @param symbol - Trading pair symbol (unused, for API consistency)
     * @returns Promise resolving to array of Date objects
     */
    getTimeframe: (symbol: string, frameName: FrameName) => Promise<Date[]>;
}
/**
 * Unique identifier for a frame schema.
 * Used to retrieve frame instances via dependency injection.
 */
type FrameName = string;

/**
 * Method context containing schema names for operation routing.
 *
 * Propagated through MethodContextService to provide implicit context
 * for retrieving correct strategy/exchange/frame instances.
 */
interface IMethodContext {
    /** Name of exchange schema to use */
    exchangeName: ExchangeName;
    /** Name of strategy schema to use */
    strategyName: StrategyName;
    /** Name of frame schema to use (empty string for live mode) */
    frameName: FrameName;
}
/**
 * Scoped service for method context propagation.
 *
 * Uses di-scoped for implicit context passing without explicit parameters.
 * Context includes strategyName, exchangeName, and frameName.
 *
 * Used by PublicServices to inject schema names into ConnectionServices.
 *
 * @example
 * ```typescript
 * MethodContextService.runAsyncIterator(
 *   backtestGenerator,
 *   {
 *     strategyName: "my-strategy",
 *     exchangeName: "my-exchange",
 *     frameName: "1d-backtest"
 *   }
 * );
 * ```
 */
declare const MethodContextService: (new () => {
    readonly context: IMethodContext;
}) & Omit<{
    new (context: IMethodContext): {
        readonly context: IMethodContext;
    };
}, "prototype"> & di_scoped.IScopedClassRun<[context: IMethodContext]>;

/**
 * Risk rejection result type.
 * Can be void, null, or an IRiskRejectionResult object.
 */
type RiskRejection = void | IRiskRejectionResult | string | null;
/**
 * Risk check arguments for evaluating whether to allow opening a new position.
 * Called BEFORE signal creation to validate if conditions allow new signals.
 * Contains only passthrough arguments from ClientStrategy context.
 */
interface IRiskCheckArgs {
    /** Trading pair symbol (e.g., "BTCUSDT") */
    symbol: string;
    /** Pending signal to apply */
    pendingSignal: ISignalDto;
    /** Strategy name requesting to open a position */
    strategyName: StrategyName;
    /** Exchange name */
    exchangeName: ExchangeName;
    /** Frame name */
    frameName: string;
    /** Current VWAP price */
    currentPrice: number;
    /** Current timestamp */
    timestamp: number;
}
/**
 * Active position tracked by ClientRisk for cross-strategy analysis.
 */
interface IRiskActivePosition {
    /** Strategy name owning the position */
    strategyName: string;
    /** Exchange name */
    exchangeName: string;
    /** Timestamp when the position was opened */
    openTimestamp: number;
}
/**
 * Optional callbacks for risk events.
 */
interface IRiskCallbacks {
    /** Called when a signal is rejected due to risk limits */
    onRejected: (symbol: string, params: IRiskCheckArgs) => void;
    /** Called when a signal passes risk checks */
    onAllowed: (symbol: string, params: IRiskCheckArgs) => void;
}
/**
 * Payload passed to risk validation functions.
 * Extends IRiskCheckArgs with portfolio state data.
 */
interface IRiskValidationPayload extends IRiskCheckArgs {
    /** Pending signal to apply */
    pendingSignal: ISignalDto;
    /** Number of currently active positions across all strategies */
    activePositionCount: number;
    /** List of currently active positions across all strategies */
    activePositions: IRiskActivePosition[];
}
/**
 * Risk validation rejection result.
 * Returned when validation fails, contains debugging information.
 */
interface IRiskRejectionResult {
    /** Unique identifier for this rejection instance */
    id: string | null;
    /** Human-readable reason for rejection */
    note: string;
}
/**
 * Risk validation function type.
 * Returns null/void if validation passes, IRiskRejectionResult if validation fails.
 * Can also throw error which will be caught and converted to IRiskRejectionResult.
 */
interface IRiskValidationFn {
    (payload: IRiskValidationPayload): RiskRejection | Promise<RiskRejection>;
}
/**
 * Risk validation configuration.
 * Defines validation logic with optional documentation.
 */
interface IRiskValidation {
    /**
     * The validation function to apply to the risk check parameters.
     */
    validate: IRiskValidationFn;
    /**
     * Optional description for documentation purposes.
     * Aids in understanding the purpose or behavior of the validation.
     */
    note?: string;
}
/**
 * Risk schema registered via addRisk().
 * Defines portfolio-level risk controls via custom validations.
 */
interface IRiskSchema {
    /** Unique risk profile identifier */
    riskName: RiskName;
    /** Optional developer note for documentation */
    note?: string;
    /** Optional lifecycle event callbacks (onRejected, onAllowed) */
    callbacks?: Partial<IRiskCallbacks>;
    /** Custom validations array for risk logic */
    validations: (IRiskValidation | IRiskValidationFn)[];
}
/**
 * Risk parameters passed to ClientRisk constructor.
 * Combines schema with runtime dependencies and emission callbacks.
 */
interface IRiskParams extends IRiskSchema {
    /** Logger service for debug output */
    logger: ILogger;
    /** True if backtest mode, false if live mode */
    backtest: boolean;
    /**
     * Callback invoked when a signal is rejected due to risk limits.
     * Called before emitting to riskSubject.
     * Used for event emission to riskSubject (separate from schema callbacks).
     *
     * @param symbol - Trading pair symbol
     * @param params - Risk check arguments
     * @param activePositionCount - Number of active positions at rejection time
     * @param rejectionResult - Rejection result with id and note
     * @param timestamp - Event timestamp in milliseconds
     * @param backtest - True if backtest mode, false if live mode
     */
    onRejected: (symbol: string, params: IRiskCheckArgs, activePositionCount: number, rejectionResult: IRiskRejectionResult, timestamp: number, backtest: boolean) => void | Promise<void>;
}
/**
 * Risk interface implemented by ClientRisk.
 * Provides risk checking for signals and position tracking.
 */
interface IRisk {
    /**
     * Check if a signal should be allowed based on risk limits.
     *
     * @param params - Risk check arguments (position size, portfolio state, etc.)
     * @returns Promise resolving to risk check result
     */
    checkSignal: (params: IRiskCheckArgs) => Promise<boolean>;
    /**
     * Register a new opened signal/position.
     *
     * @param symbol - Trading pair symbol
     * @param context - Context information (strategyName, riskName, exchangeName, frameName)
     */
    addSignal: (symbol: string, context: {
        strategyName: string;
        riskName: string;
        exchangeName: string;
        frameName: string;
    }) => Promise<void>;
    /**
     * Remove a closed signal/position.
     *
     * @param symbol - Trading pair symbol
     * @param context - Context information (strategyName, riskName, exchangeName, frameName)
     */
    removeSignal: (symbol: string, context: {
        strategyName: string;
        riskName: string;
        exchangeName: string;
        frameName: string;
    }) => Promise<void>;
}
/**
 * Unique risk profile identifier.
 */
type RiskName = string;

/**
 * Profit or loss level milestone in percentage points.
 * Represents 10%, 20%, 30%, ..., 100% profit or loss thresholds.
 *
 * Used to track when a signal reaches specific profit/loss milestones.
 * Each level is emitted only once per signal (deduplication via Set).
 *
 * @example
 * ```typescript
 * const level: PartialLevel = 50; // 50% profit or loss milestone
 * ```
 */
type PartialLevel = 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90 | 100;
/**
 * Serializable partial data for persistence layer.
 * Converts Sets to arrays for JSON serialization.
 *
 * Stored in PersistPartialAdapter as Record<signalId, IPartialData>.
 * Loaded on initialization and converted back to IPartialState.
 */
interface IPartialData {
    /**
     * Array of profit levels that have been reached for this signal.
     * Serialized form of IPartialState.profitLevels Set.
     */
    profitLevels: PartialLevel[];
    /**
     * Array of loss levels that have been reached for this signal.
     * Serialized form of IPartialState.lossLevels Set.
     */
    lossLevels: PartialLevel[];
}
/**
 * Partial profit/loss tracking interface.
 * Implemented by ClientPartial and PartialConnectionService.
 *
 * Tracks profit/loss level milestones for active trading signals.
 * Emits events when signals reach 10%, 20%, 30%, etc profit or loss.
 *
 * @example
 * ```typescript
 * import { ClientPartial } from "./client/ClientPartial";
 *
 * const partial = new ClientPartial({
 *   logger: loggerService,
 *   onProfit: (symbol, data, price, level, backtest, timestamp) => {
 *     console.log(`Signal ${data.id} reached ${level}% profit`);
 *   },
 *   onLoss: (symbol, data, price, level, backtest, timestamp) => {
 *     console.log(`Signal ${data.id} reached ${level}% loss`);
 *   }
 * });
 *
 * await partial.waitForInit("BTCUSDT");
 *
 * // During signal monitoring
 * await partial.profit("BTCUSDT", signal, 51000, 15.5, false, new Date());
 * // Emits event when reaching 10% profit milestone
 *
 * // When signal closes
 * await partial.clear("BTCUSDT", signal, 52000);
 * ```
 */
interface IPartial {
    /**
     * Processes profit state and emits events for new profit levels reached.
     *
     * Called by ClientStrategy during signal monitoring when revenuePercent > 0.
     * Checks which profit levels (10%, 20%, 30%, etc) have been reached
     * and emits events for new levels only (Set-based deduplication).
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param data - Signal row data
     * @param currentPrice - Current market price
     * @param revenuePercent - Current profit percentage (positive value)
     * @param backtest - True if backtest mode, false if live mode
     * @param when - Event timestamp (current time for live, candle time for backtest)
     * @returns Promise that resolves when profit processing is complete
     *
     * @example
     * ```typescript
     * // Signal opened at $50000, current price $51500
     * // Revenue: 3% profit
     * await partial.profit("BTCUSDT", signal, 51500, 3.0, false, new Date());
     * // No events emitted (below 10% threshold)
     *
     * // Price rises to $55000
     * // Revenue: 10% profit
     * await partial.profit("BTCUSDT", signal, 55000, 10.0, false, new Date());
     * // Emits partialProfitSubject event for 10% level
     *
     * // Price rises to $61000
     * // Revenue: 22% profit
     * await partial.profit("BTCUSDT", signal, 61000, 22.0, false, new Date());
     * // Emits events for 20% level only (10% already emitted)
     * ```
     */
    profit(symbol: string, data: ISignalRow, currentPrice: number, revenuePercent: number, backtest: boolean, when: Date): Promise<void>;
    /**
     * Processes loss state and emits events for new loss levels reached.
     *
     * Called by ClientStrategy during signal monitoring when revenuePercent < 0.
     * Checks which loss levels (10%, 20%, 30%, etc) have been reached
     * and emits events for new levels only (Set-based deduplication).
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param data - Signal row data
     * @param currentPrice - Current market price
     * @param lossPercent - Current loss percentage (negative value)
     * @param backtest - True if backtest mode, false if live mode
     * @param when - Event timestamp (current time for live, candle time for backtest)
     * @returns Promise that resolves when loss processing is complete
     *
     * @example
     * ```typescript
     * // Signal opened at $50000, current price $48000
     * // Loss: -4% loss
     * await partial.loss("BTCUSDT", signal, 48000, -4.0, false, new Date());
     * // No events emitted (below -10% threshold)
     *
     * // Price drops to $45000
     * // Loss: -10% loss
     * await partial.loss("BTCUSDT", signal, 45000, -10.0, false, new Date());
     * // Emits partialLossSubject event for 10% level
     *
     * // Price drops to $39000
     * // Loss: -22% loss
     * await partial.loss("BTCUSDT", signal, 39000, -22.0, false, new Date());
     * // Emits events for 20% level only (10% already emitted)
     * ```
     */
    loss(symbol: string, data: ISignalRow, currentPrice: number, lossPercent: number, backtest: boolean, when: Date): Promise<void>;
    /**
     * Clears partial profit/loss state when signal closes.
     *
     * Called by ClientStrategy when signal completes (TP/SL/time_expired).
     * Removes signal state from memory and persists changes to disk.
     * Cleans up memoized ClientPartial instance in PartialConnectionService.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param data - Signal row data
     * @param priceClose - Final closing price
     * @returns Promise that resolves when clear is complete
     *
     * @example
     * ```typescript
     * // Signal closes at take profit
     * await partial.clear("BTCUSDT", signal, 52000);
     * // State removed from _states Map
     * // Persisted to disk without this signal's data
     * // Memoized instance cleared from getPartial cache
     * ```
     */
    clear(symbol: string, data: ISignalRow, priceClose: number, backtest: boolean): Promise<void>;
}

/**
 * Signal generation interval for throttling.
 * Enforces minimum time between getSignal calls.
 */
type SignalInterval = "1m" | "3m" | "5m" | "15m" | "30m" | "1h";
/**
 * Signal data transfer object returned by getSignal.
 * Will be validated and augmented with auto-generated id.
 */
interface ISignalDto {
    /** Optional signal ID (auto-generated if not provided) */
    id?: string;
    /** Trade direction: "long" (buy) or "short" (sell) */
    position: "long" | "short";
    /** Human-readable description of signal reason */
    note?: string;
    /** Entry price for the position */
    priceOpen?: number;
    /** Take profit target price (must be > priceOpen for long, < priceOpen for short) */
    priceTakeProfit: number;
    /** Stop loss exit price (must be < priceOpen for long, > priceOpen for short) */
    priceStopLoss: number;
    /** Expected duration in minutes before time_expired */
    minuteEstimatedTime: number;
}
/**
 * Complete signal with auto-generated id.
 * Used throughout the system after validation.
 */
interface ISignalRow extends ISignalDto {
    /** Unique signal identifier (UUID v4 auto-generated) */
    id: string;
    /** Entry price for the position */
    priceOpen: number;
    /** Unique exchange identifier for execution */
    exchangeName: ExchangeName;
    /** Unique strategy identifier for execution */
    strategyName: StrategyName;
    /** Unique frame identifier for execution (empty string for live mode) */
    frameName: FrameName;
    /** Signal creation timestamp in milliseconds (when signal was first created/scheduled) */
    scheduledAt: number;
    /** Pending timestamp in milliseconds (when position became pending/active at priceOpen) */
    pendingAt: number;
    /** Trading pair symbol (e.g., "BTCUSDT") */
    symbol: string;
    /** Internal runtime marker for scheduled signals */
    _isScheduled: boolean;
    /**
     * History of partial closes for PNL calculation.
     * Each entry contains type (profit/loss), percent closed, and price.
     * Used to calculate weighted PNL: Σ(percent_i × pnl_i) for each partial + (remaining% × final_pnl)
     *
     * Computed values (derived from this array):
     * - _tpClosed: Sum of all "profit" type partial close percentages
     * - _slClosed: Sum of all "loss" type partial close percentages
     * - _totalClosed: Sum of all partial close percentages (profit + loss)
     */
    _partial?: Array<{
        /** Type of partial close: profit (moving toward TP) or loss (moving toward SL) */
        type: "profit" | "loss";
        /** Percentage of position closed (0-100) */
        percent: number;
        /** Price at which this partial was executed */
        price: number;
    }>;
}
/**
 * Scheduled signal row for delayed entry at specific price.
 * Inherits from ISignalRow - represents a signal waiting for price to reach priceOpen.
 * Once price reaches priceOpen, will be converted to regular _pendingSignal.
 * Note: pendingAt will be set to scheduledAt until activation, then updated to actual pending time.
 */
interface IScheduledSignalRow extends ISignalRow {
    /** Entry price for the position */
    priceOpen: number;
}
/**
 * Scheduled signal row with cancellation ID.
 * Extends IScheduledSignalRow to include optional cancelId for user-initiated cancellations.
 */
interface IScheduledSignalCancelRow extends IScheduledSignalRow {
    /** Cancellation ID (only for user-initiated cancellations) */
    cancelId?: string;
}
/**
 * Optional lifecycle callbacks for signal events.
 * Called when signals are opened, active, idle, closed, scheduled, or cancelled.
 */
interface IStrategyCallbacks {
    /** Called on every tick with the result */
    onTick: (symbol: string, result: IStrategyTickResult, backtest: boolean) => void;
    /** Called when new signal is opened (after validation) */
    onOpen: (symbol: string, data: ISignalRow, currentPrice: number, backtest: boolean) => void;
    /** Called when signal is being monitored (active state) */
    onActive: (symbol: string, data: ISignalRow, currentPrice: number, backtest: boolean) => void;
    /** Called when no active signal exists (idle state) */
    onIdle: (symbol: string, currentPrice: number, backtest: boolean) => void;
    /** Called when signal is closed with final price */
    onClose: (symbol: string, data: ISignalRow, priceClose: number, backtest: boolean) => void;
    /** Called when scheduled signal is created (delayed entry) */
    onSchedule: (symbol: string, data: IScheduledSignalRow, currentPrice: number, backtest: boolean) => void;
    /** Called when scheduled signal is cancelled without opening position */
    onCancel: (symbol: string, data: IScheduledSignalRow, currentPrice: number, backtest: boolean) => void;
    /** Called when signal is written to persist storage (for testing) */
    onWrite: (symbol: string, data: ISignalRow | null, backtest: boolean) => void;
    /** Called when signal is in partial profit state (price moved favorably but not reached TP yet) */
    onPartialProfit: (symbol: string, data: ISignalRow, currentPrice: number, revenuePercent: number, backtest: boolean) => void;
    /** Called when signal is in partial loss state (price moved against position but not hit SL yet) */
    onPartialLoss: (symbol: string, data: ISignalRow, currentPrice: number, lossPercent: number, backtest: boolean) => void;
    /** Called every minute regardless of strategy interval (for custom monitoring like checking if signal should be cancelled) */
    onPing: (symbol: string, data: IScheduledSignalRow, when: Date, backtest: boolean) => void | Promise<void>;
}
/**
 * Strategy schema registered via addStrategy().
 * Defines signal generation logic and configuration.
 */
interface IStrategySchema {
    /** Unique strategy identifier for registration */
    strategyName: StrategyName;
    /** Optional developer note for documentation */
    note?: string;
    /** Minimum interval between getSignal calls (throttling) */
    interval: SignalInterval;
    /**
     * Signal generation function (returns null if no signal, validated DTO if signal).
     * If priceOpen is provided - becomes scheduled signal waiting for price to reach entry point.
     * If priceOpen is omitted - opens immediately at current price.
     */
    getSignal: (symbol: string, when: Date) => Promise<ISignalDto | null>;
    /** Optional lifecycle event callbacks (onOpen, onClose) */
    callbacks?: Partial<IStrategyCallbacks>;
    /** Optional risk profile identifier for risk management */
    riskName?: RiskName;
    /** Optional several risk profile list for risk management (if multiple required) */
    riskList?: RiskName[];
}
/**
 * Reason why signal was closed.
 * Used in discriminated union for type-safe handling.
 */
type StrategyCloseReason = "time_expired" | "take_profit" | "stop_loss";
/**
 * Reason why scheduled signal was cancelled.
 * Used in discriminated union for type-safe handling.
 */
type StrategyCancelReason = "timeout" | "price_reject" | "user";
/**
 * Profit and loss calculation result.
 * Includes adjusted prices with fees (0.1%) and slippage (0.1%).
 */
interface IStrategyPnL {
    /** Profit/loss as percentage (e.g., 1.5 for +1.5%, -2.3 for -2.3%) */
    pnlPercentage: number;
    /** Entry price adjusted with slippage and fees */
    priceOpen: number;
    /** Exit price adjusted with slippage and fees */
    priceClose: number;
}
/**
 * Tick result: no active signal, idle state.
 */
interface IStrategyTickResultIdle {
    /** Discriminator for type-safe union */
    action: "idle";
    /** No signal in idle state */
    signal: null;
    /** Strategy name for tracking idle events */
    strategyName: StrategyName;
    /** Exchange name for tracking idle events */
    exchangeName: ExchangeName;
    /** Time frame name for tracking (e.g., "1m", "5m") */
    frameName: FrameName;
    /** Trading pair symbol (e.g., "BTCUSDT") */
    symbol: string;
    /** Current VWAP price during idle state */
    currentPrice: number;
    /** Whether this event is from backtest mode (true) or live mode (false) */
    backtest: boolean;
}
/**
 * Tick result: scheduled signal created, waiting for price to reach entry point.
 * Triggered when getSignal returns signal with priceOpen specified.
 */
interface IStrategyTickResultScheduled {
    /** Discriminator for type-safe union */
    action: "scheduled";
    /** Scheduled signal waiting for activation */
    signal: IScheduledSignalRow;
    /** Strategy name for tracking */
    strategyName: StrategyName;
    /** Exchange name for tracking */
    exchangeName: ExchangeName;
    /** Time frame name for tracking (e.g., "1m", "5m") */
    frameName: FrameName;
    /** Trading pair symbol (e.g., "BTCUSDT") */
    symbol: string;
    /** Current VWAP price when scheduled signal created */
    currentPrice: number;
    /** Whether this event is from backtest mode (true) or live mode (false) */
    backtest: boolean;
}
/**
 * Tick result: new signal just created.
 * Triggered after getSignal validation and persistence.
 */
interface IStrategyTickResultOpened {
    /** Discriminator for type-safe union */
    action: "opened";
    /** Newly created and validated signal with generated ID */
    signal: ISignalRow;
    /** Strategy name for tracking */
    strategyName: StrategyName;
    /** Exchange name for tracking */
    exchangeName: ExchangeName;
    /** Time frame name for tracking (e.g., "1m", "5m") */
    frameName: FrameName;
    /** Trading pair symbol (e.g., "BTCUSDT") */
    symbol: string;
    /** Current VWAP price at signal open */
    currentPrice: number;
    /** Whether this event is from backtest mode (true) or live mode (false) */
    backtest: boolean;
}
/**
 * Tick result: signal is being monitored.
 * Waiting for TP/SL or time expiration.
 */
interface IStrategyTickResultActive {
    /** Discriminator for type-safe union */
    action: "active";
    /** Currently monitored signal */
    signal: ISignalRow;
    /** Current VWAP price for monitoring */
    currentPrice: number;
    /** Strategy name for tracking */
    strategyName: StrategyName;
    /** Exchange name for tracking */
    exchangeName: ExchangeName;
    /** Time frame name for tracking (e.g., "1m", "5m") */
    frameName: FrameName;
    /** Trading pair symbol (e.g., "BTCUSDT") */
    symbol: string;
    /** Percentage progress towards take profit (0-100%, 0 if moving towards SL) */
    percentTp: number;
    /** Percentage progress towards stop loss (0-100%, 0 if moving towards TP) */
    percentSl: number;
    /** Whether this event is from backtest mode (true) or live mode (false) */
    backtest: boolean;
}
/**
 * Tick result: signal closed with PNL.
 * Final state with close reason and profit/loss calculation.
 */
interface IStrategyTickResultClosed {
    /** Discriminator for type-safe union */
    action: "closed";
    /** Completed signal with original parameters */
    signal: ISignalRow;
    /** Final VWAP price at close */
    currentPrice: number;
    /** Why signal closed (time_expired | take_profit | stop_loss) */
    closeReason: StrategyCloseReason;
    /** Unix timestamp in milliseconds when signal closed */
    closeTimestamp: number;
    /** Profit/loss calculation with fees and slippage */
    pnl: IStrategyPnL;
    /** Strategy name for tracking */
    strategyName: StrategyName;
    /** Exchange name for tracking */
    exchangeName: ExchangeName;
    /** Time frame name for tracking (e.g., "1m", "5m") */
    frameName: FrameName;
    /** Trading pair symbol (e.g., "BTCUSDT") */
    symbol: string;
    /** Whether this event is from backtest mode (true) or live mode (false) */
    backtest: boolean;
}
/**
 * Tick result: scheduled signal cancelled without opening position.
 * Occurs when scheduled signal doesn't activate or hits stop loss before entry.
 */
interface IStrategyTickResultCancelled {
    /** Discriminator for type-safe union */
    action: "cancelled";
    /** Cancelled scheduled signal */
    signal: IScheduledSignalRow;
    /** Final VWAP price at cancellation */
    currentPrice: number;
    /** Unix timestamp in milliseconds when signal cancelled */
    closeTimestamp: number;
    /** Strategy name for tracking */
    strategyName: StrategyName;
    /** Exchange name for tracking */
    exchangeName: ExchangeName;
    /** Time frame name for tracking (e.g., "1m", "5m") */
    frameName: FrameName;
    /** Trading pair symbol (e.g., "BTCUSDT") */
    symbol: string;
    /** Whether this event is from backtest mode (true) or live mode (false) */
    backtest: boolean;
    /** Reason for cancellation */
    reason: StrategyCancelReason;
    /** Optional cancellation ID (provided when user calls Backtest.cancel() or Live.cancel()) */
    cancelId?: string;
}
/**
 * Discriminated union of all tick results.
 * Use type guards: `result.action === "closed"` for type safety.
 */
type IStrategyTickResult = IStrategyTickResultIdle | IStrategyTickResultScheduled | IStrategyTickResultOpened | IStrategyTickResultActive | IStrategyTickResultClosed | IStrategyTickResultCancelled;
/**
 * Backtest returns closed result (TP/SL or time_expired) or cancelled result (scheduled signal never activated).
 */
type IStrategyBacktestResult = IStrategyTickResultClosed | IStrategyTickResultCancelled;
/**
 * Strategy interface implemented by ClientStrategy.
 * Defines core strategy execution methods.
 */
interface IStrategy {
    /**
     * Single tick of strategy execution with VWAP monitoring.
     * Checks for signal generation (throttled) and TP/SL conditions.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param strategyName - Name of the strategy
     * @returns Promise resolving to tick result (idle | opened | active | closed)
     */
    tick: (symbol: string, strategyName: StrategyName) => Promise<IStrategyTickResult>;
    /**
     * Retrieves the currently active pending signal for the symbol.
     * If no active signal exists, returns null.
     * Used internally for monitoring TP/SL and time expiration.
     *
     * @param symbol - Trading pair symbol
     * @returns Promise resolving to pending signal or null
     */
    getPendingSignal: (symbol: string) => Promise<ISignalRow | null>;
    /**
     * Retrieves the currently active scheduled signal for the symbol.
     * If no scheduled signal exists, returns null.
     * Used internally for monitoring scheduled signal activation.
     *
     * @param symbol - Trading pair symbol
     * @returns Promise resolving to scheduled signal or null
     */
    getScheduledSignal: (symbol: string) => Promise<IScheduledSignalRow | null>;
    /**
     * Checks if the strategy has been stopped.
     *
     * Returns the stopped state indicating whether the strategy should
     * cease processing new ticks or signals.
     *
     * @param symbol - Trading pair symbol
     * @returns Promise resolving to true if strategy is stopped, false otherwise
     */
    getStopped: (symbol: string) => Promise<boolean>;
    /**
     * Fast backtest using historical candles.
     * Iterates through candles, calculates VWAP, checks TP/SL on each candle.
     *
     * For scheduled signals: first monitors activation/cancellation,
     * then if activated continues with TP/SL monitoring.
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Name of the strategy
     * @param candles - Array of historical candle data
     * @returns Promise resolving to closed result (always completes signal)
     */
    backtest: (symbol: string, strategyName: StrategyName, candles: ICandleData[]) => Promise<IStrategyBacktestResult>;
    /**
     * Stops the strategy from generating new signals.
     *
     * Sets internal flag to prevent getSignal from being called on subsequent ticks.
     * Does NOT force-close active pending signals - they continue monitoring until natural closure (TP/SL/time_expired).
     *
     * Use case: Graceful shutdown in live trading mode without abandoning open positions.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @returns Promise that resolves immediately when stop flag is set
     *
     * @example
     * ```typescript
     * // Graceful shutdown in Live.background() cancellation
     * const cancel = await Live.background("BTCUSDT", { ... });
     *
     * // Later: stop new signals, let existing ones close naturally
     * await cancel();
     * ```
     */
    stop: (symbol: string, backtest: boolean) => Promise<void>;
    /**
     * Cancels the scheduled signal without stopping the strategy.
     *
     * Clears the scheduled signal (waiting for priceOpen activation).
     * Does NOT affect active pending signals or strategy operation.
     * Does NOT set stop flag - strategy can continue generating new signals.
     *
     * Use case: Cancel a scheduled entry that is no longer desired without stopping the entire strategy.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param cancelId - Optional cancellation ID
     * @returns Promise that resolves when scheduled signal is cleared
     *
     * @example
     * ```typescript
     * // Cancel scheduled signal without stopping strategy
     * await strategy.cancel("BTCUSDT");
     * // Strategy continues, can generate new signals
     * ```
     */
    cancel: (symbol: string, backtest: boolean, cancelId?: string) => Promise<void>;
    /**
     * Executes partial close at profit level (moving toward TP).
     *
     * Closes specified percentage of position at current price.
     * Updates _tpClosed, _totalClosed, and _partialHistory state.
     * Persists updated signal state for crash recovery.
     *
     * Validations:
     * - Throws if no pending signal exists
     * - Throws if called on scheduled signal (not yet activated)
     * - Throws if percentToClose <= 0 or > 100
     * - Does nothing if _totalClosed + percentToClose > 100 (prevents over-closing)
     *
     * Use case: User-controlled partial close triggered from onPartialProfit callback.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param percentToClose - Absolute percentage of position to close (0-100)
     * @param currentPrice - Current market price for partial close
     * @param backtest - Whether running in backtest mode
     * @returns Promise that resolves when partial close is complete
     *
     * @example
     * ```typescript
     * callbacks: {
     *   onPartialProfit: async (symbol, signal, currentPrice, percentTp, backtest) => {
     *     if (percentTp >= 50) {
     *       await strategy.partialProfit(symbol, 25, currentPrice, backtest);
     *     }
     *   }
     * }
     * ```
     */
    partialProfit: (symbol: string, percentToClose: number, currentPrice: number, backtest: boolean) => Promise<void>;
    /**
     * Executes partial close at loss level (moving toward SL).
     *
     * Closes specified percentage of position at current price.
     * Updates _slClosed, _totalClosed, and _partialHistory state.
     * Persists updated signal state for crash recovery.
     *
     * Validations:
     * - Throws if no pending signal exists
     * - Throws if called on scheduled signal (not yet activated)
     * - Throws if percentToClose <= 0 or > 100
     * - Does nothing if _totalClosed + percentToClose > 100 (prevents over-closing)
     *
     * Use case: User-controlled partial close triggered from onPartialLoss callback.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param percentToClose - Absolute percentage of position to close (0-100)
     * @param currentPrice - Current market price for partial close
     * @param backtest - Whether running in backtest mode
     * @returns Promise that resolves when partial close is complete
     *
     * @example
     * ```typescript
     * callbacks: {
     *   onPartialLoss: async (symbol, signal, currentPrice, percentSl, backtest) => {
     *     if (percentSl >= 80) {
     *       await strategy.partialLoss(symbol, 50, currentPrice, backtest);
     *     }
     *   }
     * }
     * ```
     */
    partialLoss: (symbol: string, percentToClose: number, currentPrice: number, backtest: boolean) => Promise<void>;
}
/**
 * Unique strategy identifier.
 */
type StrategyName = string;

/**
 * Statistical data calculated from backtest results.
 *
 * All numeric values are null if calculation is unsafe (NaN, Infinity, etc).
 * Provides comprehensive metrics for strategy performance analysis.
 *
 * @example
 * ```typescript
 * const stats = await Backtest.getData("my-strategy");
 *
 * console.log(`Total signals: ${stats.totalSignals}`);
 * console.log(`Win rate: ${stats.winRate}%`);
 * console.log(`Sharpe Ratio: ${stats.sharpeRatio}`);
 *
 * // Access raw signal data
 * stats.signalList.forEach(signal => {
 *   console.log(`Signal ${signal.signal.id}: ${signal.pnl.pnlPercentage}%`);
 * });
 * ```
 */
interface BacktestStatisticsModel {
    /** Array of all closed signals with full details (price, PNL, timestamps, etc.) */
    signalList: IStrategyTickResultClosed[];
    /** Total number of closed signals */
    totalSignals: number;
    /** Number of winning signals (PNL > 0) */
    winCount: number;
    /** Number of losing signals (PNL < 0) */
    lossCount: number;
    /** Win rate as percentage (0-100), null if unsafe. Higher is better. */
    winRate: number | null;
    /** Average PNL per signal as percentage, null if unsafe. Higher is better. */
    avgPnl: number | null;
    /** Cumulative PNL across all signals as percentage, null if unsafe. Higher is better. */
    totalPnl: number | null;
    /** Standard deviation of returns (volatility metric), null if unsafe. Lower is better. */
    stdDev: number | null;
    /** Sharpe Ratio (risk-adjusted return = avgPnl / stdDev), null if unsafe. Higher is better. */
    sharpeRatio: number | null;
    /** Annualized Sharpe Ratio (sharpeRatio × √365), null if unsafe. Higher is better. */
    annualizedSharpeRatio: number | null;
    /** Certainty Ratio (avgWin / |avgLoss|), null if unsafe. Higher is better. */
    certaintyRatio: number | null;
    /** Expected yearly returns based on average trade duration and PNL, null if unsafe. Higher is better. */
    expectedYearlyReturns: number | null;
}

/**
 * Contract for walker completion events.
 *
 * Emitted when all strategies have been tested and final results are available.
 * Contains complete results of the walker comparison including the best strategy.
 *
 * @example
 * ```typescript
 * import { walkerCompleteSubject } from "backtest-kit";
 *
 * walkerCompleteSubject
 *   .filter((event) => event.symbol === "BTCUSDT")
 *   .connect((event) => {
 *     console.log("Walker completed:", event.walkerName);
 *     console.log("Best strategy:", event.bestStrategy);
 *     console.log("Best metric:", event.bestMetric);
 *   });
 * ```
 */
interface WalkerCompleteContract {
    /** walkerName - Walker name */
    walkerName: WalkerName;
    /** symbol - Symbol tested */
    symbol: string;
    /** exchangeName - Exchange used */
    exchangeName: ExchangeName;
    /** frameName - Frame used */
    frameName: FrameName;
    /** metric - Metric used for optimization */
    metric: WalkerMetric;
    /** totalStrategies - Total number of strategies tested */
    totalStrategies: number;
    /** bestStrategy - Best performing strategy name */
    bestStrategy: StrategyName | null;
    /** bestMetric - Best metric value achieved */
    bestMetric: number | null;
    /** bestStats - Best strategy statistics */
    bestStats: BacktestStatisticsModel | null;
}

/**
 * Optimization metric for comparing strategies.
 * Higher values are always better (metric is maximized).
 */
type WalkerMetric = "sharpeRatio" | "annualizedSharpeRatio" | "winRate" | "totalPnl" | "certaintyRatio" | "avgPnl" | "expectedYearlyReturns";
/**
 * Walker schema registered via addWalker().
 * Defines A/B testing configuration for multiple strategies.
 */
interface IWalkerSchema {
    /** Unique walker identifier for registration */
    walkerName: WalkerName;
    /** Optional developer note for documentation */
    note?: string;
    /** Exchange to use for backtesting all strategies */
    exchangeName: ExchangeName;
    /** Timeframe generator to use for backtesting all strategies */
    frameName: FrameName;
    /** List of strategy names to compare (must be registered via addStrategy) */
    strategies: StrategyName[];
    /** Metric to optimize (default: "sharpeRatio") */
    metric?: WalkerMetric;
    /** Optional lifecycle event callbacks */
    callbacks?: Partial<IWalkerCallbacks>;
}
/**
 * Optional lifecycle callbacks for walker events.
 * Called during strategy comparison process.
 */
interface IWalkerCallbacks {
    /** Called when starting to test a specific strategy */
    onStrategyStart: (strategyName: StrategyName, symbol: string) => void;
    /** Called when a strategy backtest completes */
    onStrategyComplete: (strategyName: StrategyName, symbol: string, stats: BacktestStatisticsModel, metric: number | null) => void;
    /** Called when a strategy backtest fails with an error */
    onStrategyError: (strategyName: StrategyName, symbol: string, error: Error | unknown) => void;
    /** Called when all strategies have been tested */
    onComplete: (results: IWalkerResults) => void;
}
/**
 * Result for a single strategy in the comparison.
 */
interface IWalkerStrategyResult {
    /** Strategy name */
    strategyName: StrategyName;
    /** Backtest statistics for this strategy */
    stats: BacktestStatisticsModel;
    /** Metric value used for comparison (null if invalid) */
    metric: number | null;
    /** Rank position (1 = best, 2 = second best, etc.) */
    rank: number;
}
/**
 * Complete walker results after comparing all strategies.
 */
interface IWalkerResults extends WalkerCompleteContract {
    /** Symbol tested */
    symbol: string;
    /** Exchange used */
    exchangeName: ExchangeName;
    /** Walker name */
    walkerName: WalkerName;
    /** Frame used */
    frameName: FrameName;
}
/**
 * Unique walker identifier.
 */
type WalkerName = string;

/**
 * Base parameters common to all sizing calculations.
 */
interface ISizingCalculateParamsBase {
    /** Trading pair symbol (e.g., "BTCUSDT") */
    symbol: string;
    /** Current account balance */
    accountBalance: number;
    /** Planned entry price */
    priceOpen: number;
}
/**
 * Public API parameters for fixed percentage sizing (without method field).
 */
interface IPositionSizeFixedPercentageParams extends ISizingCalculateParamsBase {
    /** Stop-loss price */
    priceStopLoss: number;
}
/**
 * Public API parameters for Kelly Criterion sizing (without method field).
 */
interface IPositionSizeKellyParams extends ISizingCalculateParamsBase {
    /** Win rate (0-1) */
    winRate: number;
    /** Average win/loss ratio */
    winLossRatio: number;
}
/**
 * Public API parameters for ATR-based sizing (without method field).
 */
interface IPositionSizeATRParams extends ISizingCalculateParamsBase {
    /** Current ATR value */
    atr: number;
}
/**
 * Parameters for fixed percentage sizing calculation.
 */
interface ISizingCalculateParamsFixedPercentage extends ISizingCalculateParamsBase {
    method: "fixed-percentage";
    /** Stop-loss price */
    priceStopLoss: number;
}
/**
 * Parameters for Kelly Criterion sizing calculation.
 */
interface ISizingCalculateParamsKelly extends ISizingCalculateParamsBase {
    method: "kelly-criterion";
    /** Win rate (0-1) */
    winRate: number;
    /** Average win/loss ratio */
    winLossRatio: number;
}
/**
 * Parameters for ATR-based sizing calculation.
 */
interface ISizingCalculateParamsATR extends ISizingCalculateParamsBase {
    method: "atr-based";
    /** Current ATR value */
    atr: number;
}
/**
 * Discriminated union for position size calculation parameters.
 * Type-safe parameters based on sizing method.
 */
type ISizingCalculateParams = ISizingCalculateParamsFixedPercentage | ISizingCalculateParamsKelly | ISizingCalculateParamsATR;
/**
 * Fixed percentage sizing parameters for ClientSizing constructor.
 */
interface ISizingParamsFixedPercentage extends ISizingSchemaFixedPercentage {
    /** Logger service for debug output */
    logger: ILogger;
}
/**
 * Kelly Criterion sizing parameters for ClientSizing constructor.
 */
interface ISizingParamsKelly extends ISizingSchemaKelly {
    /** Logger service for debug output */
    logger: ILogger;
}
/**
 * ATR-based sizing parameters for ClientSizing constructor.
 */
interface ISizingParamsATR extends ISizingSchemaATR {
    /** Logger service for debug output */
    logger: ILogger;
}
/**
 * Discriminated union for sizing parameters passed to ClientSizing constructor.
 * Extends ISizingSchema with logger instance for internal logging.
 */
type ISizingParams = ISizingParamsFixedPercentage | ISizingParamsKelly | ISizingParamsATR;
/**
 * Callbacks for sizing lifecycle events.
 */
interface ISizingCallbacks {
    /**
     * Called after position size calculation.
     * Useful for logging or validating the calculated size.
     *
     * @param quantity - Calculated position size
     * @param params - Parameters used for calculation
     */
    onCalculate: (quantity: number, params: ISizingCalculateParams) => void;
}
/**
 * Base sizing schema with common fields.
 */
interface ISizingSchemaBase {
    /** Unique identifier for this sizing configuration */
    sizingName: SizingName;
    /** Optional developer note for documentation */
    note?: string;
    /** Maximum position size as % of account (0-100) */
    maxPositionPercentage?: number;
    /** Minimum position size (absolute value) */
    minPositionSize?: number;
    /** Maximum position size (absolute value) */
    maxPositionSize?: number;
    /** Optional lifecycle callbacks */
    callbacks?: Partial<ISizingCallbacks>;
}
/**
 * Fixed percentage sizing schema.
 *
 * @example
 * ```typescript
 * addSizing({
 *   sizingName: "conservative",
 *   method: "fixed-percentage",
 *   riskPercentage: 1,
 * });
 * ```
 */
interface ISizingSchemaFixedPercentage extends ISizingSchemaBase {
    method: "fixed-percentage";
    /** Risk percentage per trade (0-100) */
    riskPercentage: number;
}
/**
 * Kelly Criterion sizing schema.
 *
 * @example
 * ```typescript
 * addSizing({
 *   sizingName: "kelly",
 *   method: "kelly-criterion",
 *   kellyMultiplier: 0.25,
 * });
 * ```
 */
interface ISizingSchemaKelly extends ISizingSchemaBase {
    method: "kelly-criterion";
    /** Kelly Criterion multiplier (0-1, default 0.25 for quarter Kelly) */
    kellyMultiplier?: number;
}
/**
 * ATR-based sizing schema.
 *
 * @example
 * ```typescript
 * addSizing({
 *   sizingName: "atr",
 *   method: "atr-based",
 *   riskPercentage: 2,
 *   atrMultiplier: 2,
 * });
 * ```
 */
interface ISizingSchemaATR extends ISizingSchemaBase {
    method: "atr-based";
    /** Risk percentage per trade (0-100) */
    riskPercentage: number;
    /** ATR multiplier for stop distance calculation */
    atrMultiplier?: number;
}
/**
 * Discriminated union for sizing schemas.
 * Type-safe configuration based on sizing method.
 */
type ISizingSchema = ISizingSchemaFixedPercentage | ISizingSchemaKelly | ISizingSchemaATR;
/**
 * Sizing interface for position size calculation.
 * Used internally by strategy execution.
 */
interface ISizing {
    /**
     * Calculates position size based on risk parameters.
     *
     * @param params - Calculation parameters (symbol, balance, prices, etc.)
     * @returns Promise resolving to calculated position size
     */
    calculate: (params: ISizingCalculateParams) => Promise<number>;
}
/**
 * Unique identifier for a sizing schema.
 * Used to retrieve sizing instances via dependency injection.
 */
type SizingName = string;

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
    getWalkerTemplate(walkerName: string, exchangeName: string, frameName: string, strategies: string[]): string | Promise<string>;
    /**
     * Generates Exchange configuration code.
     *
     * @param symbol - Trading pair symbol
     * @param exchangeName - Unique exchange identifier
     * @returns Generated addExchange() call with CCXT integration
     */
    getExchangeTemplate(symbol: string, exchangeName: string): string | Promise<string>;
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
    getFrameTemplate(symbol: string, frameName: string, interval: CandleInterval, startDate: Date, endDate: Date): string | Promise<string>;
    /**
     * Generates Strategy configuration code with LLM integration.
     *
     * @param strategyName - Unique strategy identifier
     * @param interval - Signal throttling interval (e.g., "5m")
     * @param prompt - Strategy logic prompt from getPrompt()
     * @returns Generated addStrategy() call with getSignal() function
     */
    getStrategyTemplate(strategyName: string, interval: string, prompt: string): string | Promise<string>;
    /**
     * Generates launcher code to run Walker and listen to events.
     *
     * @param symbol - Trading pair symbol
     * @param walkerName - Walker name to launch
     * @returns Generated Walker.background() call with event listeners
     */
    getLauncherTemplate(symbol: string, walkerName: string): string | Promise<string>;
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
 * Registers a trading strategy in the framework.
 *
 * The strategy will be validated for:
 * - Signal validation (prices, TP/SL logic, timestamps)
 * - Interval throttling (prevents signal spam)
 * - Crash-safe persistence in live mode
 *
 * @param strategySchema - Strategy configuration object
 * @param strategySchema.strategyName - Unique strategy identifier
 * @param strategySchema.interval - Signal generation interval ("1m" | "3m" | "5m" | "15m" | "30m" | "1h")
 * @param strategySchema.getSignal - Async function that generates trading signals
 * @param strategySchema.callbacks - Optional lifecycle callbacks (onOpen, onClose)
 *
 * @example
 * ```typescript
 * addStrategy({
 *   strategyName: "my-strategy",
 *   interval: "5m",
 *   getSignal: async (symbol) => ({
 *     position: "long",
 *     priceOpen: 50000,
 *     priceTakeProfit: 51000,
 *     priceStopLoss: 49000,
 *     minuteEstimatedTime: 60,
 *     timestamp: Date.now(),
 *   }),
 *   callbacks: {
 *     onOpen: (symbol, signal, currentPrice, backtest) => console.log("Signal opened"),
 *     onClose: (symbol, signal, priceClose, backtest) => console.log("Signal closed"),
 *   },
 * });
 * ```
 */
declare function addStrategy(strategySchema: IStrategySchema): void;
/**
 * Registers an exchange data source in the framework.
 *
 * The exchange provides:
 * - Historical candle data via getCandles
 * - Price/quantity formatting for the exchange
 * - VWAP calculation from last 5 1m candles
 *
 * @param exchangeSchema - Exchange configuration object
 * @param exchangeSchema.exchangeName - Unique exchange identifier
 * @param exchangeSchema.getCandles - Async function to fetch candle data
 * @param exchangeSchema.formatPrice - Async function to format prices
 * @param exchangeSchema.formatQuantity - Async function to format quantities
 * @param exchangeSchema.callbacks - Optional callback for candle data events
 *
 * @example
 * ```typescript
 * addExchange({
 *   exchangeName: "binance",
 *   getCandles: async (symbol, interval, since, limit) => {
 *     // Fetch from Binance API or database
 *     return [{
 *       timestamp: Date.now(),
 *       open: 50000,
 *       high: 51000,
 *       low: 49000,
 *       close: 50500,
 *       volume: 1000,
 *     }];
 *   },
 *   formatPrice: async (symbol, price) => price.toFixed(2),
 *   formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
 * });
 * ```
 */
declare function addExchange(exchangeSchema: IExchangeSchema): void;
/**
 * Registers a timeframe generator for backtesting.
 *
 * The frame defines:
 * - Start and end dates for backtest period
 * - Interval for timeframe generation
 * - Callback for timeframe generation events
 *
 * @param frameSchema - Frame configuration object
 * @param frameSchema.frameName - Unique frame identifier
 * @param frameSchema.interval - Timeframe interval ("1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h" | "12h" | "1d" | "3d")
 * @param frameSchema.startDate - Start date for timeframe generation
 * @param frameSchema.endDate - End date for timeframe generation
 * @param frameSchema.callbacks - Optional callback for timeframe events
 *
 * @example
 * ```typescript
 * addFrame({
 *   frameName: "1d-backtest",
 *   interval: "1m",
 *   startDate: new Date("2024-01-01T00:00:00Z"),
 *   endDate: new Date("2024-01-02T00:00:00Z"),
 *   callbacks: {
 *     onTimeframe: (timeframe, startDate, endDate, interval) => {
 *       console.log(`Generated ${timeframe.length} timeframes`);
 *     },
 *   },
 * });
 * ```
 */
declare function addFrame(frameSchema: IFrameSchema): void;
/**
 * Registers a walker for strategy comparison.
 *
 * The walker executes backtests for multiple strategies on the same
 * historical data and compares their performance using a specified metric.
 *
 * @param walkerSchema - Walker configuration object
 * @param walkerSchema.walkerName - Unique walker identifier
 * @param walkerSchema.exchangeName - Exchange to use for all strategies
 * @param walkerSchema.frameName - Timeframe to use for all strategies
 * @param walkerSchema.strategies - Array of strategy names to compare
 * @param walkerSchema.metric - Metric to optimize (default: "sharpeRatio")
 * @param walkerSchema.callbacks - Optional lifecycle callbacks
 *
 * @example
 * ```typescript
 * addWalker({
 *   walkerName: "llm-prompt-optimizer",
 *   exchangeName: "binance",
 *   frameName: "1d-backtest",
 *   strategies: [
 *     "my-strategy-v1",
 *     "my-strategy-v2",
 *     "my-strategy-v3"
 *   ],
 *   metric: "sharpeRatio",
 *   callbacks: {
 *     onStrategyComplete: (strategyName, symbol, stats, metric) => {
 *       console.log(`${strategyName}: ${metric}`);
 *     },
 *     onComplete: (results) => {
 *       console.log(`Best strategy: ${results.bestStrategy}`);
 *     }
 *   }
 * });
 * ```
 */
declare function addWalker(walkerSchema: IWalkerSchema): void;
/**
 * Registers a position sizing configuration in the framework.
 *
 * The sizing configuration defines:
 * - Position sizing method (fixed-percentage, kelly-criterion, atr-based)
 * - Risk parameters (risk percentage, Kelly multiplier, ATR multiplier)
 * - Position constraints (min/max size, max position percentage)
 * - Callback for calculation events
 *
 * @param sizingSchema - Sizing configuration object (discriminated union)
 * @param sizingSchema.sizingName - Unique sizing identifier
 * @param sizingSchema.method - Sizing method ("fixed-percentage" | "kelly-criterion" | "atr-based")
 * @param sizingSchema.riskPercentage - Risk percentage per trade (for fixed-percentage and atr-based)
 * @param sizingSchema.kellyMultiplier - Kelly multiplier (for kelly-criterion, default: 0.25)
 * @param sizingSchema.atrMultiplier - ATR multiplier (for atr-based, default: 2)
 * @param sizingSchema.maxPositionPercentage - Optional max position size as % of account
 * @param sizingSchema.minPositionSize - Optional minimum position size
 * @param sizingSchema.maxPositionSize - Optional maximum position size
 * @param sizingSchema.callbacks - Optional lifecycle callbacks
 *
 * @example
 * ```typescript
 * // Fixed percentage sizing
 * addSizing({
 *   sizingName: "conservative",
 *   method: "fixed-percentage",
 *   riskPercentage: 1,
 *   maxPositionPercentage: 10,
 * });
 *
 * // Kelly Criterion sizing
 * addSizing({
 *   sizingName: "kelly",
 *   method: "kelly-criterion",
 *   kellyMultiplier: 0.25,
 *   maxPositionPercentage: 20,
 * });
 *
 * // ATR-based sizing
 * addSizing({
 *   sizingName: "atr-dynamic",
 *   method: "atr-based",
 *   riskPercentage: 2,
 *   atrMultiplier: 2,
 *   callbacks: {
 *     onCalculate: (quantity, params) => {
 *       console.log(`Calculated size: ${quantity} for ${params.symbol}`);
 *     },
 *   },
 * });
 * ```
 */
declare function addSizing(sizingSchema: ISizingSchema): void;
/**
 * Registers a risk management configuration in the framework.
 *
 * The risk configuration defines:
 * - Maximum concurrent positions across all strategies
 * - Custom validations for advanced risk logic (portfolio metrics, correlations, etc.)
 * - Callbacks for rejected/allowed signals
 *
 * Multiple ClientStrategy instances share the same ClientRisk instance,
 * enabling cross-strategy risk analysis. ClientRisk tracks all active positions
 * and provides access to them via validation functions.
 *
 * @param riskSchema - Risk configuration object
 * @param riskSchema.riskName - Unique risk profile identifier
 * @param riskSchema.maxConcurrentPositions - Optional max number of open positions across all strategies
 * @param riskSchema.validations - Optional custom validation functions with access to params and active positions
 * @param riskSchema.callbacks - Optional lifecycle callbacks (onRejected, onAllowed)
 *
 * @example
 * ```typescript
 * // Basic risk limit
 * addRisk({
 *   riskName: "conservative",
 *   maxConcurrentPositions: 5,
 * });
 *
 * // With custom validations (access to signal data and portfolio state)
 * addRisk({
 *   riskName: "advanced",
 *   maxConcurrentPositions: 10,
 *   validations: [
 *     {
 *       validate: async ({ params }) => {
 *         // params contains: symbol, strategyName, exchangeName, signal, currentPrice, timestamp
 *         // Calculate portfolio metrics from external data source
 *         const portfolio = await getPortfolioState();
 *         if (portfolio.drawdown > 20) {
 *           throw new Error("Portfolio drawdown exceeds 20%");
 *         }
 *       },
 *       docDescription: "Prevents trading during high drawdown",
 *     },
 *     ({ params }) => {
 *       // Access signal details
 *       const positionValue = calculatePositionValue(params.signal, params.currentPrice);
 *       if (positionValue > 10000) {
 *         throw new Error("Position value exceeds $10,000 limit");
 *       }
 *     },
 *   ],
 *   callbacks: {
 *     onRejected: (symbol, reason, limit, params) => {
 *       console.log(`[RISK] Signal rejected for ${symbol}: ${reason}`);
 *     },
 *     onAllowed: (symbol, params) => {
 *       console.log(`[RISK] Signal allowed for ${symbol}`);
 *     },
 *   },
 * });
 * ```
 */
declare function addRisk(riskSchema: IRiskSchema): void;
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
 * addOptimizer({
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
declare function addOptimizer(optimizerSchema: IOptimizerSchema): void;

/**
 * Returns a list of all registered exchange schemas.
 *
 * Retrieves all exchanges that have been registered via addExchange().
 * Useful for debugging, documentation, or building dynamic UIs.
 *
 * @returns Array of exchange schemas with their configurations
 *
 * @example
 * ```typescript
 * import { listExchanges, addExchange } from "backtest-kit";
 *
 * addExchange({
 *   exchangeName: "binance",
 *   note: "Binance cryptocurrency exchange",
 *   getCandles: async (symbol, interval, since, limit) => [...],
 *   formatPrice: async (symbol, price) => price.toFixed(2),
 *   formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
 * });
 *
 * const exchanges = listExchanges();
 * console.log(exchanges);
 * // [{ exchangeName: "binance", note: "Binance cryptocurrency exchange", ... }]
 * ```
 */
declare function listExchanges(): Promise<IExchangeSchema[]>;
/**
 * Returns a list of all registered strategy schemas.
 *
 * Retrieves all strategies that have been registered via addStrategy().
 * Useful for debugging, documentation, or building dynamic UIs.
 *
 * @returns Array of strategy schemas with their configurations
 *
 * @example
 * ```typescript
 * import { listStrategies, addStrategy } from "backtest-kit";
 *
 * addStrategy({
 *   strategyName: "my-strategy",
 *   note: "Simple moving average crossover strategy",
 *   interval: "5m",
 *   getSignal: async (symbol) => ({
 *     position: "long",
 *     priceOpen: 50000,
 *     priceTakeProfit: 51000,
 *     priceStopLoss: 49000,
 *     minuteEstimatedTime: 60,
 *   }),
 * });
 *
 * const strategies = listStrategies();
 * console.log(strategies);
 * // [{ strategyName: "my-strategy", note: "Simple moving average...", ... }]
 * ```
 */
declare function listStrategies(): Promise<IStrategySchema[]>;
/**
 * Returns a list of all registered frame schemas.
 *
 * Retrieves all frames that have been registered via addFrame().
 * Useful for debugging, documentation, or building dynamic UIs.
 *
 * @returns Array of frame schemas with their configurations
 *
 * @example
 * ```typescript
 * import { listFrames, addFrame } from "backtest-kit";
 *
 * addFrame({
 *   frameName: "1d-backtest",
 *   note: "One day backtest period for testing",
 *   interval: "1m",
 *   startDate: new Date("2024-01-01T00:00:00Z"),
 *   endDate: new Date("2024-01-02T00:00:00Z"),
 * });
 *
 * const frames = listFrames();
 * console.log(frames);
 * // [{ frameName: "1d-backtest", note: "One day backtest...", ... }]
 * ```
 */
declare function listFrames(): Promise<IFrameSchema[]>;
/**
 * Returns a list of all registered walker schemas.
 *
 * Retrieves all walkers that have been registered via addWalker().
 * Useful for debugging, documentation, or building dynamic UIs.
 *
 * @returns Array of walker schemas with their configurations
 *
 * @example
 * ```typescript
 * import { listWalkers, addWalker } from "backtest-kit";
 *
 * addWalker({
 *   walkerName: "llm-prompt-optimizer",
 *   note: "Compare LLM-based trading strategies",
 *   exchangeName: "binance",
 *   frameName: "1d-backtest",
 *   strategies: ["my-strategy-v1", "my-strategy-v2"],
 *   metric: "sharpeRatio",
 * });
 *
 * const walkers = listWalkers();
 * console.log(walkers);
 * // [{ walkerName: "llm-prompt-optimizer", note: "Compare LLM...", ... }]
 * ```
 */
declare function listWalkers(): Promise<IWalkerSchema[]>;
/**
 * Returns a list of all registered sizing schemas.
 *
 * Retrieves all sizing configurations that have been registered via addSizing().
 * Useful for debugging, documentation, or building dynamic UIs.
 *
 * @returns Array of sizing schemas with their configurations
 *
 * @example
 * ```typescript
 * import { listSizings, addSizing } from "backtest-kit";
 *
 * addSizing({
 *   sizingName: "conservative",
 *   note: "Low risk fixed percentage sizing",
 *   method: "fixed-percentage",
 *   riskPercentage: 1,
 *   maxPositionPercentage: 10,
 * });
 *
 * addSizing({
 *   sizingName: "kelly",
 *   note: "Kelly Criterion with quarter multiplier",
 *   method: "kelly-criterion",
 *   kellyMultiplier: 0.25,
 * });
 *
 * const sizings = listSizings();
 * console.log(sizings);
 * // [
 * //   { sizingName: "conservative", method: "fixed-percentage", ... },
 * //   { sizingName: "kelly", method: "kelly-criterion", ... }
 * // ]
 * ```
 */
declare function listSizings(): Promise<ISizingSchema[]>;
/**
 * Returns a list of all registered risk schemas.
 *
 * Retrieves all risk configurations that have been registered via addRisk().
 * Useful for debugging, documentation, or building dynamic UIs.
 *
 * @returns Array of risk schemas with their configurations
 *
 * @example
 * ```typescript
 * import { listRisks, addRisk } from "backtest-kit";
 *
 * addRisk({
 *   riskName: "conservative",
 *   note: "Conservative risk management with tight position limits",
 *   maxConcurrentPositions: 5,
 * });
 *
 * addRisk({
 *   riskName: "aggressive",
 *   note: "Aggressive risk management with loose limits",
 *   maxConcurrentPositions: 10,
 * });
 *
 * const risks = listRisks();
 * console.log(risks);
 * // [
 * //   { riskName: "conservative", maxConcurrentPositions: 5, ... },
 * //   { riskName: "aggressive", maxConcurrentPositions: 10, ... }
 * // ]
 * ```
 */
declare function listRisks(): Promise<IRiskSchema[]>;
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
declare function listOptimizers(): Promise<IOptimizerSchema[]>;

/**
 * Contract for background execution completion events.
 *
 * Emitted when Live.background() or Backtest.background() completes execution.
 * Contains metadata about the completed execution context.
 *
 * @example
 * ```typescript
 * import { listenDone } from "backtest-kit";
 *
 * listenDone((event) => {
 *   if (event.backtest) {
 *     console.log("Backtest completed:", event.symbol);
 *   } else {
 *     console.log("Live trading completed:", event.symbol);
 *   }
 * });
 * ```
 */
interface DoneContract {
    /** exchangeName - Name of the exchange used in execution */
    exchangeName: string;
    /** strategyName - Name of the strategy that completed */
    strategyName: string;
    /** frameName - Name of the frame (empty string for live mode) */
    frameName: string;
    /** backtest - True if backtest mode, false if live mode */
    backtest: boolean;
    /** symbol - Trading symbol (e.g., "BTCUSDT") */
    symbol: string;
}

/**
 * Contract for backtest progress events.
 *
 * Emitted during Backtest.background() execution to track progress.
 * Contains information about total frames, processed frames, and completion percentage.
 *
 * @example
 * ```typescript
 * import { listenBacktestProgress } from "backtest-kit";
 *
 * listenBacktestProgress((event) => {
 *   console.log(`Progress: ${(event.progress * 100).toFixed(2)}%`);
 *   console.log(`Processed: ${event.processedFrames} / ${event.totalFrames}`);
 * });
 * ```
 */
interface ProgressBacktestContract {
    /** exchangeName - Name of the exchange used in execution */
    exchangeName: string;
    /** strategyName - Name of the strategy being executed */
    strategyName: string;
    /** symbol - Trading symbol (e.g., "BTCUSDT") */
    symbol: string;
    /** totalFrames - Total number of frames to process */
    totalFrames: number;
    /** processedFrames - Number of frames processed so far */
    processedFrames: number;
    /** progress - Completion percentage from 0.0 to 1.0 */
    progress: number;
}

/**
 * Contract for walker progress events.
 *
 * Emitted during Walker.background() execution to track progress.
 * Contains information about total strategies, processed strategies, and completion percentage.
 *
 * @example
 * ```typescript
 * import { listenWalkerProgress } from "backtest-kit";
 *
 * listenWalkerProgress((event) => {
 *   console.log(`Progress: ${(event.progress * 100).toFixed(2)}%`);
 *   console.log(`Processed: ${event.processedStrategies} / ${event.totalStrategies}`);
 * });
 * ```
 */
interface ProgressWalkerContract {
    /** walkerName - Name of the walker being executed */
    walkerName: string;
    /** exchangeName - Name of the exchange used in execution */
    exchangeName: string;
    /** frameName - Name of the frame being used */
    frameName: string;
    /** symbol - Trading symbol (e.g., "BTCUSDT") */
    symbol: string;
    /** totalStrategies - Total number of strategies to process */
    totalStrategies: number;
    /** processedStrategies - Number of strategies processed so far */
    processedStrategies: number;
    /** progress - Completion percentage from 0.0 to 1.0 */
    progress: number;
}

/**
 * Contract for optimizer progress events.
 *
 * Emitted during optimizer execution to track progress.
 * Contains information about total sources, processed sources, and completion percentage.
 *
 * @example
 * ```typescript
 * import { listenOptimizerProgress } from "backtest-kit";
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
 * Performance metric types tracked by the system.
 *
 * Backtest metrics:
 * - backtest_total: Total backtest duration from start to finish
 * - backtest_timeframe: Duration to process a single timeframe iteration
 * - backtest_signal: Duration to process a signal (tick + getNextCandles + backtest)
 *
 * Live metrics:
 * - live_tick: Duration of a single live tick iteration
 */
type PerformanceMetricType = "backtest_total" | "backtest_timeframe" | "backtest_signal" | "live_tick";
/**
 * Contract for performance tracking events.
 *
 * Emitted during execution to track performance metrics for various operations.
 * Useful for profiling and identifying bottlenecks.
 *
 * @example
 * ```typescript
 * import { listenPerformance } from "backtest-kit";
 *
 * listenPerformance((event) => {
 *   console.log(`${event.metricType}: ${event.duration.toFixed(2)}ms`);
 *   console.log(`${event.strategyName} @ ${event.exchangeName}`);
 * });
 * ```
 */
interface PerformanceContract {
    /** Timestamp when the metric was recorded (milliseconds since epoch) */
    timestamp: number;
    /** Timestamp of the previous event (milliseconds since epoch, null for first event) */
    previousTimestamp: number | null;
    /** Type of operation being measured */
    metricType: PerformanceMetricType;
    /** Duration of the operation in milliseconds */
    duration: number;
    /** Strategy name associated with this metric */
    strategyName: string;
    /** Exchange name associated with this metric */
    exchangeName: string;
    /** Frame name associated with this metric (empty string for live mode) */
    frameName: string;
    /** Trading symbol associated with this metric */
    symbol: string;
    /** Whether this metric is from backtest mode (true) or live mode (false) */
    backtest: boolean;
}

/**
 * Contract for walker progress events during strategy comparison.
 * Emitted each time a strategy completes testing with its current ranking.
 */
interface WalkerContract {
    /** Walker name */
    walkerName: WalkerName;
    /** Exchange name */
    exchangeName: ExchangeName;
    /** Frame name */
    frameName: string;
    /** Symbol being tested */
    symbol: string;
    /** Strategy that just completed */
    strategyName: StrategyName;
    /** Backtest statistics for this strategy */
    stats: BacktestStatisticsModel;
    /** Metric value for this strategy (null if invalid) */
    metricValue: number | null;
    /** Metric being optimized */
    metric: WalkerMetric;
    /** Current best metric value across all tested strategies so far */
    bestMetric: number | null;
    /** Current best strategy name */
    bestStrategy: StrategyName | null;
    /** Number of strategies tested so far */
    strategiesTested: number;
    /** Total number of strategies to test */
    totalStrategies: number;
}

/**
 * Contract for partial profit level events.
 *
 * Emitted by partialProfitSubject when a signal reaches a profit level milestone (10%, 20%, 30%, etc).
 * Used for tracking partial take-profit execution and monitoring strategy performance.
 *
 * Events are emitted only once per level per signal (Set-based deduplication in ClientPartial).
 * Multiple levels can be emitted in a single tick if price jumps significantly.
 *
 * Consumers:
 * - PartialMarkdownService: Accumulates events for report generation
 * - User callbacks via listenPartialProfit() / listenPartialProfitOnce()
 *
 * @example
 * ```typescript
 * import { listenPartialProfit } from "backtest-kit";
 *
 * // Listen to all partial profit events
 * listenPartialProfit((event) => {
 *   console.log(`[${event.backtest ? "Backtest" : "Live"}] Signal ${event.data.id} reached ${event.level}% profit`);
 *   console.log(`Symbol: ${event.symbol}, Price: ${event.currentPrice}`);
 *   console.log(`Position: ${event.data.position}, Entry: ${event.data.priceOpen}`);
 * });
 *
 * // Wait for first 50% profit level
 * listenPartialProfitOnce(
 *   (event) => event.level === 50,
 *   (event) => console.log("50% profit reached:", event.data.id)
 * );
 * ```
 */
interface PartialProfitContract {
    /**
     * Trading pair symbol (e.g., "BTCUSDT").
     * Identifies which market this profit event belongs to.
     */
    symbol: string;
    /**
     * Strategy name that generated this signal.
     * Identifies which strategy execution this profit event belongs to.
     */
    strategyName: string;
    /**
     * Exchange name where this signal is being executed.
     * Identifies which exchange this profit event belongs to.
     */
    exchangeName: string;
    /**
     * Frame name where this signal is being executed.
     * Identifies which frame this profit event belongs to (empty string for live mode).
     */
    frameName: string;
    /**
     * Complete signal row data.
     * Contains all signal information: id, position, priceOpen, priceTakeProfit, priceStopLoss, etc.
     */
    data: ISignalRow;
    /**
     * Current market price at which this profit level was reached.
     * Used to calculate actual profit percentage.
     */
    currentPrice: number;
    /**
     * Profit level milestone reached (10, 20, 30, 40, 50, 60, 70, 80, 90, or 100).
     * Represents percentage profit relative to entry price.
     *
     * @example
     * ```typescript
     * // If entry was $50000 and level is 20:
     * // currentPrice >= $60000 (20% profit)
     * ```
     */
    level: PartialLevel;
    /**
     * Execution mode flag.
     * - true: Event from backtest execution (historical candle data)
     * - false: Event from live trading (real-time tick)
     */
    backtest: boolean;
    /**
     * Event timestamp in milliseconds since Unix epoch.
     *
     * Timing semantics:
     * - Live mode: when.getTime() at the moment profit level was detected
     * - Backtest mode: candle.timestamp of the candle that triggered the level
     *
     * @example
     * ```typescript
     * const eventDate = new Date(event.timestamp);
     * console.log(`Profit reached at: ${eventDate.toISOString()}`);
     * ```
     */
    timestamp: number;
}

/**
 * Contract for partial loss level events.
 *
 * Emitted by partialLossSubject when a signal reaches a loss level milestone (-10%, -20%, -30%, etc).
 * Used for tracking partial stop-loss execution and monitoring strategy drawdown.
 *
 * Events are emitted only once per level per signal (Set-based deduplication in ClientPartial).
 * Multiple levels can be emitted in a single tick if price drops significantly.
 *
 * Consumers:
 * - PartialMarkdownService: Accumulates events for report generation
 * - User callbacks via listenPartialLoss() / listenPartialLossOnce()
 *
 * @example
 * ```typescript
 * import { listenPartialLoss } from "backtest-kit";
 *
 * // Listen to all partial loss events
 * listenPartialLoss((event) => {
 *   console.log(`[${event.backtest ? "Backtest" : "Live"}] Signal ${event.data.id} reached -${event.level}% loss`);
 *   console.log(`Symbol: ${event.symbol}, Price: ${event.currentPrice}`);
 *   console.log(`Position: ${event.data.position}, Entry: ${event.data.priceOpen}`);
 *
 *   // Alert on significant loss
 *   if (event.level >= 30 && !event.backtest) {
 *     console.warn("HIGH LOSS ALERT:", event.data.id);
 *   }
 * });
 *
 * // Wait for first 20% loss level
 * listenPartialLossOnce(
 *   (event) => event.level === 20,
 *   (event) => console.log("20% loss reached:", event.data.id)
 * );
 * ```
 */
interface PartialLossContract {
    /**
     * Trading pair symbol (e.g., "BTCUSDT").
     * Identifies which market this loss event belongs to.
     */
    symbol: string;
    /**
     * Strategy name that generated this signal.
     * Identifies which strategy execution this loss event belongs to.
     */
    strategyName: string;
    /**
     * Exchange name where this signal is being executed.
     * Identifies which exchange this loss event belongs to.
     */
    exchangeName: string;
    /**
     * Frame name where this signal is being executed.
     * Identifies which frame this loss event belongs to (empty string for live mode).
     */
    frameName: string;
    /**
     * Complete signal row data.
     * Contains all signal information: id, position, priceOpen, priceTakeProfit, priceStopLoss, etc.
     */
    data: ISignalRow;
    /**
     * Current market price at which this loss level was reached.
     * Used to calculate actual loss percentage.
     */
    currentPrice: number;
    /**
     * Loss level milestone reached (10, 20, 30, 40, 50, 60, 70, 80, 90, or 100).
     * Represents percentage loss relative to entry price (absolute value).
     *
     * Note: Stored as positive number, but represents negative loss.
     * level=20 means -20% loss from entry price.
     *
     * @example
     * ```typescript
     * // If entry was $50000 and level is 20:
     * // currentPrice <= $40000 (-20% loss)
     * // Level is stored as 20, not -20
     * ```
     */
    level: PartialLevel;
    /**
     * Execution mode flag.
     * - true: Event from backtest execution (historical candle data)
     * - false: Event from live trading (real-time tick)
     */
    backtest: boolean;
    /**
     * Event timestamp in milliseconds since Unix epoch.
     *
     * Timing semantics:
     * - Live mode: when.getTime() at the moment loss level was detected
     * - Backtest mode: candle.timestamp of the candle that triggered the level
     *
     * @example
     * ```typescript
     * const eventDate = new Date(event.timestamp);
     * console.log(`Loss reached at: ${eventDate.toISOString()}`);
     *
     * // Calculate time in loss
     * const entryTime = event.data.pendingAt;
     * const timeInLoss = event.timestamp - entryTime;
     * console.log(`In loss for ${timeInLoss / 1000 / 60} minutes`);
     * ```
     */
    timestamp: number;
}

/**
 * Contract for risk rejection events.
 *
 * Emitted by riskSubject ONLY when a signal is REJECTED due to risk validation failure.
 * Used for tracking actual risk violations and monitoring rejected signals.
 *
 * Events are emitted only when risk limits are violated (not for allowed signals).
 * This prevents spam and allows focusing on actual risk management interventions.
 *
 * Consumers:
 * - RiskMarkdownService: Accumulates rejection events for report generation
 * - User callbacks via listenRisk() / listenRiskOnce()
 *
 * @example
 * ```typescript
 * import { listenRisk } from "backtest-kit";
 *
 * // Listen to all risk rejection events
 * listenRisk((event) => {
 *   console.log(`[RISK REJECTED] Signal for ${event.symbol}`);
 *   console.log(`Strategy: ${event.strategyName}`);
 *   console.log(`Active positions: ${event.activePositionCount}`);
 *   console.log(`Price: ${event.currentPrice}`);
 *   console.log(`Timestamp: ${new Date(event.timestamp).toISOString()}`);
 * });
 *
 * // Alert on risk rejections for specific symbol
 * listenRisk((event) => {
 *   if (event.symbol === "BTCUSDT") {
 *     console.warn("BTC signal rejected due to risk limits!");
 *   }
 * });
 * ```
 */
interface RiskContract {
    /**
     * Trading pair symbol (e.g., "BTCUSDT").
     * Identifies which market this rejected signal belongs to.
     */
    symbol: string;
    /**
     * Pending signal to apply.
     * Contains signal details (position, priceOpen, priceTakeProfit, priceStopLoss, etc).
     */
    pendingSignal: ISignalDto;
    /**
     * Strategy name requesting to open a position.
     * Identifies which strategy attempted to create the signal.
     */
    strategyName: StrategyName;
    /**
     * Frame name used in backtest execution.
     * Identifies which frame this signal was for in backtest execution.
     */
    frameName: FrameName;
    /**
     * Exchange name.
     * Identifies which exchange this signal was for.
     */
    exchangeName: ExchangeName;
    /**
     * Current VWAP price at the time of rejection.
     * Market price when risk check was performed.
     */
    currentPrice: number;
    /**
     * Number of currently active positions across all strategies at rejection time.
     * Used to track portfolio-level exposure when signal was rejected.
     */
    activePositionCount: number;
    /**
     * Unique identifier for this rejection instance.
     * Generated by ClientRisk for tracking and debugging purposes.
     * Null if validation threw exception without custom ID.
     */
    rejectionId: string | null;
    /**
     * Human-readable reason why the signal was rejected.
     * Captured from IRiskValidation.note or error message.
     *
     * @example
     * ```typescript
     * console.log(`Rejection reason: ${event.rejectionNote}`);
     * // Output: "Rejection reason: Max 3 positions allowed"
     * ```
     */
    rejectionNote: string;
    /**
     * Event timestamp in milliseconds since Unix epoch.
     * Represents when the signal was rejected.
     *
     * @example
     * ```typescript
     * const eventDate = new Date(event.timestamp);
     * console.log(`Signal rejected at: ${eventDate.toISOString()}`);
     * ```
     */
    timestamp: number;
    /**
     * Whether this event is from backtest mode (true) or live mode (false).
     * Used to separate backtest and live risk rejection tracking.
     */
    backtest: boolean;
}

/**
 * Contract for ping events during scheduled signal monitoring.
 *
 * Emitted by pingSubject every minute when a scheduled signal is being monitored.
 * Used for tracking scheduled signal lifecycle and custom monitoring logic.
 *
 * Events are emitted only when scheduled signal is active (not cancelled, not activated).
 * Allows users to implement custom cancellation logic via onPing callback.
 *
 * Consumers:
 * - User callbacks via listenPing() / listenPingOnce()
 *
 * @example
 * ```typescript
 * import { listenPing } from "backtest-kit";
 *
 * // Listen to all ping events
 * listenPing((event) => {
 *   console.log(`[${event.backtest ? "Backtest" : "Live"}] Ping for ${event.symbol}`);
 *   console.log(`Strategy: ${event.strategyName}, Exchange: ${event.exchangeName}`);
 *   console.log(`Signal ID: ${event.data.id}, priceOpen: ${event.data.priceOpen}`);
 *   console.log(`Timestamp: ${new Date(event.timestamp).toISOString()}`);
 * });
 *
 * // Wait for specific ping
 * listenPingOnce(
 *   (event) => event.symbol === "BTCUSDT",
 *   (event) => console.log("BTCUSDT ping received:", event.timestamp)
 * );
 * ```
 */
interface PingContract {
    /**
     * Trading pair symbol (e.g., "BTCUSDT").
     * Identifies which market this ping event belongs to.
     */
    symbol: string;
    /**
     * Strategy name that is monitoring this scheduled signal.
     * Identifies which strategy execution this ping event belongs to.
     */
    strategyName: string;
    /**
     * Exchange name where this scheduled signal is being monitored.
     * Identifies which exchange this ping event belongs to.
     */
    exchangeName: string;
    /**
     * Complete scheduled signal row data.
     * Contains all signal information: id, position, priceOpen, priceTakeProfit, priceStopLoss, etc.
     */
    data: IScheduledSignalRow;
    /**
     * Execution mode flag.
     * - true: Event from backtest execution (historical candle data)
     * - false: Event from live trading (real-time tick)
     */
    backtest: boolean;
    /**
     * Event timestamp in milliseconds since Unix epoch.
     *
     * Timing semantics:
     * - Live mode: when.getTime() at the moment of ping
     * - Backtest mode: candle.timestamp of the candle being processed
     *
     * @example
     * ```typescript
     * const eventDate = new Date(event.timestamp);
     * console.log(`Ping at: ${eventDate.toISOString()}`);
     * ```
     */
    timestamp: number;
}

/**
 * Subscribes to all signal events with queued async processing.
 *
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle signal events (idle, opened, active, closed)
 * @returns Unsubscribe function to stop listening
 *
 * @example
 * ```typescript
 * import { listenSignal } from "./function/event";
 *
 * const unsubscribe = listenSignal((event) => {
 *   if (event.action === "opened") {
 *     console.log("New signal opened:", event.signal);
 *   } else if (event.action === "closed") {
 *     console.log("Signal closed with PNL:", event.pnl.pnlPercentage);
 *   }
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
declare function listenSignal(fn: (event: IStrategyTickResult) => void): () => void;
/**
 * Subscribes to filtered signal events with one-time execution.
 *
 * Listens for events matching the filter predicate, then executes callback once
 * and automatically unsubscribes. Useful for waiting for specific signal conditions.
 *
 * @param filterFn - Predicate to filter which events trigger the callback
 * @param fn - Callback function to handle the filtered event (called only once)
 * @returns Unsubscribe function to cancel the listener before it fires
 *
 * @example
 * ```typescript
 * import { listenSignalOnce } from "./function/event";
 *
 * // Wait for first take profit hit
 * listenSignalOnce(
 *   (event) => event.action === "closed" && event.closeReason === "take_profit",
 *   (event) => {
 *     console.log("Take profit hit! PNL:", event.pnl.pnlPercentage);
 *   }
 * );
 *
 * // Wait for any signal to close on BTCUSDT
 * const cancel = listenSignalOnce(
 *   (event) => event.action === "closed" && event.signal.symbol === "BTCUSDT",
 *   (event) => console.log("BTCUSDT signal closed")
 * );
 *
 * // Cancel if needed before event fires
 * cancel();
 * ```
 */
declare function listenSignalOnce(filterFn: (event: IStrategyTickResult) => boolean, fn: (event: IStrategyTickResult) => void): () => void;
/**
 * Subscribes to live trading signal events with queued async processing.
 *
 * Only receives events from Live.run() execution.
 * Events are processed sequentially in order received.
 *
 * @param fn - Callback function to handle live signal events
 * @returns Unsubscribe function to stop listening
 *
 * @example
 * ```typescript
 * import { listenSignalLive } from "./function/event";
 *
 * const unsubscribe = listenSignalLive((event) => {
 *   if (event.action === "closed") {
 *     console.log("Live signal closed:", event.pnl.pnlPercentage);
 *   }
 * });
 * ```
 */
declare function listenSignalLive(fn: (event: IStrategyTickResult) => void): () => void;
/**
 * Subscribes to filtered live signal events with one-time execution.
 *
 * Only receives events from Live.run() execution.
 * Executes callback once and automatically unsubscribes.
 *
 * @param filterFn - Predicate to filter which events trigger the callback
 * @param fn - Callback function to handle the filtered event (called only once)
 * @returns Unsubscribe function to cancel the listener before it fires
 *
 * @example
 * ```typescript
 * import { listenSignalLiveOnce } from "./function/event";
 *
 * // Wait for first live take profit hit
 * listenSignalLiveOnce(
 *   (event) => event.action === "closed" && event.closeReason === "take_profit",
 *   (event) => console.log("Live take profit:", event.pnl.pnlPercentage)
 * );
 * ```
 */
declare function listenSignalLiveOnce(filterFn: (event: IStrategyTickResult) => boolean, fn: (event: IStrategyTickResult) => void): () => void;
/**
 * Subscribes to backtest signal events with queued async processing.
 *
 * Only receives events from Backtest.run() execution.
 * Events are processed sequentially in order received.
 *
 * @param fn - Callback function to handle backtest signal events
 * @returns Unsubscribe function to stop listening
 *
 * @example
 * ```typescript
 * import { listenSignalBacktest } from "./function/event";
 *
 * const unsubscribe = listenSignalBacktest((event) => {
 *   if (event.action === "closed") {
 *     console.log("Backtest signal closed:", event.pnl.pnlPercentage);
 *   }
 * });
 * ```
 */
declare function listenSignalBacktest(fn: (event: IStrategyTickResult) => void): () => void;
/**
 * Subscribes to filtered backtest signal events with one-time execution.
 *
 * Only receives events from Backtest.run() execution.
 * Executes callback once and automatically unsubscribes.
 *
 * @param filterFn - Predicate to filter which events trigger the callback
 * @param fn - Callback function to handle the filtered event (called only once)
 * @returns Unsubscribe function to cancel the listener before it fires
 *
 * @example
 * ```typescript
 * import { listenSignalBacktestOnce } from "./function/event";
 *
 * // Wait for first backtest stop loss hit
 * listenSignalBacktestOnce(
 *   (event) => event.action === "closed" && event.closeReason === "stop_loss",
 *   (event) => console.log("Backtest stop loss:", event.pnl.pnlPercentage)
 * );
 * ```
 */
declare function listenSignalBacktestOnce(filterFn: (event: IStrategyTickResult) => boolean, fn: (event: IStrategyTickResult) => void): () => void;
/**
 * Subscribes to recoverable execution errors with queued async processing.
 *
 * Listens to recoverable errors during strategy execution (e.g., failed API calls).
 * These errors are caught and handled gracefully - execution continues.
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle error events
 * @returns Unsubscribe function to stop listening
 *
 * @example
 * ```typescript
 * import { listenError } from "./function/event";
 *
 * const unsubscribe = listenError((error) => {
 *   console.error("Recoverable error (execution continues):", error.message);
 *   // Log to monitoring service, send alerts, etc.
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
declare function listenError(fn: (error: Error) => void): () => void;
/**
 * Subscribes to fatal execution errors with queued async processing.
 *
 * Listens to critical errors that terminate execution (Live.background, Backtest.background, Walker.background).
 * Unlike listenError (recoverable errors), these errors stop the current process.
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle fatal error events
 * @returns Unsubscribe function to stop listening
 *
 * @example
 * ```typescript
 * import { listenExit } from "./function/event";
 *
 * const unsubscribe = listenExit((error) => {
 *   console.error("Fatal error (execution terminated):", error.message);
 *   // Log to monitoring, send alerts, restart process, etc.
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
declare function listenExit(fn: (error: Error) => void): () => void;
/**
 * Subscribes to live background execution completion events with queued async processing.
 *
 * Emits when Live.background() completes execution.
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle completion events
 * @returns Unsubscribe function to stop listening to events
 *
 * @example
 * ```typescript
 * import { listenDoneLive, Live } from "backtest-kit";
 *
 * const unsubscribe = listenDoneLive((event) => {
 *   console.log("Live completed:", event.strategyName, event.exchangeName, event.symbol);
 * });
 *
 * Live.background("BTCUSDT", {
 *   strategyName: "my-strategy",
 *   exchangeName: "binance"
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
declare function listenDoneLive(fn: (event: DoneContract) => void): () => void;
/**
 * Subscribes to filtered live background execution completion events with one-time execution.
 *
 * Emits when Live.background() completes execution.
 * Executes callback once and automatically unsubscribes.
 *
 * @param filterFn - Predicate to filter which events trigger the callback
 * @param fn - Callback function to handle the filtered event (called only once)
 * @returns Unsubscribe function to cancel the listener before it fires
 *
 * @example
 * ```typescript
 * import { listenDoneLiveOnce, Live } from "backtest-kit";
 *
 * // Wait for first live completion
 * listenDoneLiveOnce(
 *   (event) => event.symbol === "BTCUSDT",
 *   (event) => console.log("BTCUSDT live completed:", event.strategyName)
 * );
 *
 * Live.background("BTCUSDT", {
 *   strategyName: "my-strategy",
 *   exchangeName: "binance"
 * });
 * ```
 */
declare function listenDoneLiveOnce(filterFn: (event: DoneContract) => boolean, fn: (event: DoneContract) => void): () => void;
/**
 * Subscribes to backtest background execution completion events with queued async processing.
 *
 * Emits when Backtest.background() completes execution.
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle completion events
 * @returns Unsubscribe function to stop listening to events
 *
 * @example
 * ```typescript
 * import { listenDoneBacktest, Backtest } from "backtest-kit";
 *
 * const unsubscribe = listenDoneBacktest((event) => {
 *   console.log("Backtest completed:", event.strategyName, event.exchangeName, event.symbol);
 * });
 *
 * Backtest.background("BTCUSDT", {
 *   strategyName: "my-strategy",
 *   exchangeName: "binance",
 *   frameName: "1d-backtest"
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
declare function listenDoneBacktest(fn: (event: DoneContract) => void): () => void;
/**
 * Subscribes to filtered backtest background execution completion events with one-time execution.
 *
 * Emits when Backtest.background() completes execution.
 * Executes callback once and automatically unsubscribes.
 *
 * @param filterFn - Predicate to filter which events trigger the callback
 * @param fn - Callback function to handle the filtered event (called only once)
 * @returns Unsubscribe function to cancel the listener before it fires
 *
 * @example
 * ```typescript
 * import { listenDoneBacktestOnce, Backtest } from "backtest-kit";
 *
 * // Wait for first backtest completion
 * listenDoneBacktestOnce(
 *   (event) => event.symbol === "BTCUSDT",
 *   (event) => console.log("BTCUSDT backtest completed:", event.strategyName)
 * );
 *
 * Backtest.background("BTCUSDT", {
 *   strategyName: "my-strategy",
 *   exchangeName: "binance",
 *   frameName: "1d-backtest"
 * });
 * ```
 */
declare function listenDoneBacktestOnce(filterFn: (event: DoneContract) => boolean, fn: (event: DoneContract) => void): () => void;
/**
 * Subscribes to walker background execution completion events with queued async processing.
 *
 * Emits when Walker.background() completes execution.
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle completion events
 * @returns Unsubscribe function to stop listening to events
 *
 * @example
 * ```typescript
 * import { listenDoneWalker, Walker } from "backtest-kit";
 *
 * const unsubscribe = listenDoneWalker((event) => {
 *   console.log("Walker completed:", event.strategyName, event.exchangeName, event.symbol);
 * });
 *
 * Walker.background("BTCUSDT", {
 *   walkerName: "my-walker"
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
declare function listenDoneWalker(fn: (event: DoneContract) => void): () => void;
/**
 * Subscribes to filtered walker background execution completion events with one-time execution.
 *
 * Emits when Walker.background() completes execution.
 * Executes callback once and automatically unsubscribes.
 *
 * @param filterFn - Predicate to filter which events trigger the callback
 * @param fn - Callback function to handle the filtered event (called only once)
 * @returns Unsubscribe function to cancel the listener before it fires
 *
 * @example
 * ```typescript
 * import { listenDoneWalkerOnce, Walker } from "backtest-kit";
 *
 * // Wait for first walker completion
 * listenDoneWalkerOnce(
 *   (event) => event.symbol === "BTCUSDT",
 *   (event) => console.log("BTCUSDT walker completed:", event.strategyName)
 * );
 *
 * Walker.background("BTCUSDT", {
 *   walkerName: "my-walker"
 * });
 * ```
 */
declare function listenDoneWalkerOnce(filterFn: (event: DoneContract) => boolean, fn: (event: DoneContract) => void): () => void;
/**
 * Subscribes to backtest progress events with queued async processing.
 *
 * Emits during Backtest.background() execution to track progress.
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle progress events
 * @returns Unsubscribe function to stop listening to events
 *
 * @example
 * ```typescript
 * import { listenBacktestProgress, Backtest } from "backtest-kit";
 *
 * const unsubscribe = listenBacktestProgress((event) => {
 *   console.log(`Progress: ${(event.progress * 100).toFixed(2)}%`);
 *   console.log(`${event.processedFrames} / ${event.totalFrames} frames`);
 *   console.log(`Strategy: ${event.strategyName}, Symbol: ${event.symbol}`);
 * });
 *
 * Backtest.background("BTCUSDT", {
 *   strategyName: "my-strategy",
 *   exchangeName: "binance",
 *   frameName: "1d-backtest"
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
declare function listenBacktestProgress(fn: (event: ProgressBacktestContract) => void): () => void;
/**
 * Subscribes to walker progress events with queued async processing.
 *
 * Emits during Walker.run() execution after each strategy completes.
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle walker progress events
 * @returns Unsubscribe function to stop listening to events
 *
 * @example
 * ```typescript
 * import { listenWalkerProgress, Walker } from "backtest-kit";
 *
 * const unsubscribe = listenWalkerProgress((event) => {
 *   console.log(`Progress: ${(event.progress * 100).toFixed(2)}%`);
 *   console.log(`${event.processedStrategies} / ${event.totalStrategies} strategies`);
 *   console.log(`Walker: ${event.walkerName}, Symbol: ${event.symbol}`);
 * });
 *
 * Walker.run("BTCUSDT", {
 *   walkerName: "my-walker",
 *   exchangeName: "binance",
 *   frameName: "1d-backtest"
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
declare function listenWalkerProgress(fn: (event: ProgressWalkerContract) => void): () => void;
/**
 * Subscribes to optimizer progress events with queued async processing.
 *
 * Emits during optimizer execution to track data source processing progress.
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle optimizer progress events
 * @returns Unsubscribe function to stop listening to events
 *
 * @example
 * ```typescript
 * import { listenOptimizerProgress } from "backtest-kit";
 *
 * const unsubscribe = listenOptimizerProgress((event) => {
 *   console.log(`Progress: ${(event.progress * 100).toFixed(2)}%`);
 *   console.log(`${event.processedSources} / ${event.totalSources} sources`);
 *   console.log(`Optimizer: ${event.optimizerName}, Symbol: ${event.symbol}`);
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
declare function listenOptimizerProgress(fn: (event: ProgressOptimizerContract) => void): () => void;
/**
 * Subscribes to performance metric events with queued async processing.
 *
 * Emits during strategy execution to track timing metrics for operations.
 * Useful for profiling and identifying performance bottlenecks.
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle performance events
 * @returns Unsubscribe function to stop listening to events
 *
 * @example
 * ```typescript
 * import { listenPerformance, Backtest } from "backtest-kit";
 *
 * const unsubscribe = listenPerformance((event) => {
 *   console.log(`${event.metricType}: ${event.duration.toFixed(2)}ms`);
 *   if (event.duration > 100) {
 *     console.warn("Slow operation detected:", event.metricType);
 *   }
 * });
 *
 * Backtest.background("BTCUSDT", {
 *   strategyName: "my-strategy",
 *   exchangeName: "binance",
 *   frameName: "1d-backtest"
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
declare function listenPerformance(fn: (event: PerformanceContract) => void): () => void;
/**
 * Subscribes to walker progress events with queued async processing.
 *
 * Emits during Walker.run() execution after each strategy completes.
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle walker progress events
 * @returns Unsubscribe function to stop listening to events
 *
 * @example
 * ```typescript
 * import { listenWalker, Walker } from "backtest-kit";
 *
 * const unsubscribe = listenWalker((event) => {
 *   console.log(`Progress: ${event.strategiesTested} / ${event.totalStrategies}`);
 *   console.log(`Best strategy: ${event.bestStrategy} (${event.bestMetric})`);
 *   console.log(`Current strategy: ${event.strategyName} (${event.metricValue})`);
 * });
 *
 * Walker.run("BTCUSDT", {
 *   walkerName: "my-walker",
 *   exchangeName: "binance",
 *   frameName: "1d-backtest"
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
declare function listenWalker(fn: (event: WalkerContract) => void): () => void;
/**
 * Subscribes to filtered walker progress events with one-time execution.
 *
 * Listens for events matching the filter predicate, then executes callback once
 * and automatically unsubscribes. Useful for waiting for specific walker conditions.
 *
 * @param filterFn - Predicate to filter which events trigger the callback
 * @param fn - Callback function to handle the filtered event (called only once)
 * @returns Unsubscribe function to cancel the listener before it fires
 *
 * @example
 * ```typescript
 * import { listenWalkerOnce, Walker } from "backtest-kit";
 *
 * // Wait for walker to complete all strategies
 * listenWalkerOnce(
 *   (event) => event.strategiesTested === event.totalStrategies,
 *   (event) => {
 *     console.log("Walker completed!");
 *     console.log("Best strategy:", event.bestStrategy, event.bestMetric);
 *   }
 * );
 *
 * // Wait for specific strategy to be tested
 * const cancel = listenWalkerOnce(
 *   (event) => event.strategyName === "my-strategy-v2",
 *   (event) => console.log("Strategy v2 tested:", event.metricValue)
 * );
 *
 * Walker.run("BTCUSDT", {
 *   walkerName: "my-walker",
 *   exchangeName: "binance",
 *   frameName: "1d-backtest"
 * });
 *
 * // Cancel if needed before event fires
 * cancel();
 * ```
 */
declare function listenWalkerOnce(filterFn: (event: WalkerContract) => boolean, fn: (event: WalkerContract) => void): () => void;
/**
 * Subscribes to walker completion events with queued async processing.
 *
 * Emits when Walker.run() completes testing all strategies.
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle walker completion event
 * @returns Unsubscribe function to stop listening to events
 *
 * @example
 * ```typescript
 * import { listenWalkerComplete, Walker } from "backtest-kit";
 *
 * const unsubscribe = listenWalkerComplete((results) => {
 *   console.log(`Walker ${results.walkerName} completed!`);
 *   console.log(`Best strategy: ${results.bestStrategy}`);
 *   console.log(`Best ${results.metric}: ${results.bestMetric}`);
 *   console.log(`Tested ${results.totalStrategies} strategies`);
 * });
 *
 * Walker.run("BTCUSDT", {
 *   walkerName: "my-walker",
 *   exchangeName: "binance",
 *   frameName: "1d-backtest"
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
declare function listenWalkerComplete(fn: (event: WalkerCompleteContract) => void): () => void;
/**
 * Subscribes to risk validation errors with queued async processing.
 *
 * Emits when risk validation functions throw errors during signal checking.
 * Useful for debugging and monitoring risk validation failures.
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle validation errors
 * @returns Unsubscribe function to stop listening to events
 *
 * @example
 * ```typescript
 * import { listenValidation } from "./function/event";
 *
 * const unsubscribe = listenValidation((error) => {
 *   console.error("Risk validation error:", error.message);
 *   // Log to monitoring service for debugging
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
declare function listenValidation(fn: (error: Error) => void): () => void;
/**
 * Subscribes to partial profit level events with queued async processing.
 *
 * Emits when a signal reaches a profit level milestone (10%, 20%, 30%, etc).
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle partial profit events
 * @returns Unsubscribe function to stop listening to events
 *
 * @example
 * ```typescript
 * import { listenPartialProfit } from "./function/event";
 *
 * const unsubscribe = listenPartialProfit((event) => {
 *   console.log(`Signal ${event.data.id} reached ${event.level}% profit`);
 *   console.log(`Symbol: ${event.symbol}, Price: ${event.currentPrice}`);
 *   console.log(`Mode: ${event.backtest ? "Backtest" : "Live"}`);
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
declare function listenPartialProfit(fn: (event: PartialProfitContract) => void): () => void;
/**
 * Subscribes to filtered partial profit level events with one-time execution.
 *
 * Listens for events matching the filter predicate, then executes callback once
 * and automatically unsubscribes. Useful for waiting for specific profit conditions.
 *
 * @param filterFn - Predicate to filter which events trigger the callback
 * @param fn - Callback function to handle the filtered event (called only once)
 * @returns Unsubscribe function to cancel the listener before it fires
 *
 * @example
 * ```typescript
 * import { listenPartialProfitOnce } from "./function/event";
 *
 * // Wait for first 50% profit level on any signal
 * listenPartialProfitOnce(
 *   (event) => event.level === 50,
 *   (event) => console.log("50% profit reached:", event.data.id)
 * );
 *
 * // Wait for 30% profit on BTCUSDT
 * const cancel = listenPartialProfitOnce(
 *   (event) => event.symbol === "BTCUSDT" && event.level === 30,
 *   (event) => console.log("BTCUSDT hit 30% profit")
 * );
 *
 * // Cancel if needed before event fires
 * cancel();
 * ```
 */
declare function listenPartialProfitOnce(filterFn: (event: PartialProfitContract) => boolean, fn: (event: PartialProfitContract) => void): () => void;
/**
 * Subscribes to partial loss level events with queued async processing.
 *
 * Emits when a signal reaches a loss level milestone (10%, 20%, 30%, etc).
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle partial loss events
 * @returns Unsubscribe function to stop listening to events
 *
 * @example
 * ```typescript
 * import { listenPartialLoss } from "./function/event";
 *
 * const unsubscribe = listenPartialLoss((event) => {
 *   console.log(`Signal ${event.data.id} reached ${event.level}% loss`);
 *   console.log(`Symbol: ${event.symbol}, Price: ${event.currentPrice}`);
 *   console.log(`Mode: ${event.backtest ? "Backtest" : "Live"}`);
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
declare function listenPartialLoss(fn: (event: PartialLossContract) => void): () => void;
/**
 * Subscribes to filtered partial loss level events with one-time execution.
 *
 * Listens for events matching the filter predicate, then executes callback once
 * and automatically unsubscribes. Useful for waiting for specific loss conditions.
 *
 * @param filterFn - Predicate to filter which events trigger the callback
 * @param fn - Callback function to handle the filtered event (called only once)
 * @returns Unsubscribe function to cancel the listener before it fires
 *
 * @example
 * ```typescript
 * import { listenPartialLossOnce } from "./function/event";
 *
 * // Wait for first 20% loss level on any signal
 * listenPartialLossOnce(
 *   (event) => event.level === 20,
 *   (event) => console.log("20% loss reached:", event.data.id)
 * );
 *
 * // Wait for 10% loss on ETHUSDT in live mode
 * const cancel = listenPartialLossOnce(
 *   (event) => event.symbol === "ETHUSDT" && event.level === 10 && !event.backtest,
 *   (event) => console.log("ETHUSDT hit 10% loss in live mode")
 * );
 *
 * // Cancel if needed before event fires
 * cancel();
 * ```
 */
declare function listenPartialLossOnce(filterFn: (event: PartialLossContract) => boolean, fn: (event: PartialLossContract) => void): () => void;
/**
 * Subscribes to risk rejection events with queued async processing.
 *
 * Emits ONLY when a signal is rejected due to risk validation failure.
 * Does not emit for allowed signals (prevents spam).
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle risk rejection events
 * @returns Unsubscribe function to stop listening to events
 *
 * @example
 * ```typescript
 * import { listenRisk } from "./function/event";
 *
 * const unsubscribe = listenRisk((event) => {
 *   console.log(`[RISK REJECTED] Signal for ${event.symbol}`);
 *   console.log(`Strategy: ${event.strategyName}`);
 *   console.log(`Position: ${event.pendingSignal.position}`);
 *   console.log(`Active positions: ${event.activePositionCount}`);
 *   console.log(`Reason: ${event.comment}`);
 *   console.log(`Price: ${event.currentPrice}`);
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
declare function listenRisk(fn: (event: RiskContract) => void): () => void;
/**
 * Subscribes to filtered risk rejection events with one-time execution.
 *
 * Listens for events matching the filter predicate, then executes callback once
 * and automatically unsubscribes. Useful for waiting for specific risk rejection conditions.
 *
 * @param filterFn - Predicate to filter which events trigger the callback
 * @param fn - Callback function to handle the filtered event (called only once)
 * @returns Unsubscribe function to cancel the listener before it fires
 *
 * @example
 * ```typescript
 * import { listenRiskOnce } from "./function/event";
 *
 * // Wait for first risk rejection on BTCUSDT
 * listenRiskOnce(
 *   (event) => event.symbol === "BTCUSDT",
 *   (event) => {
 *     console.log("BTCUSDT signal rejected!");
 *     console.log("Reason:", event.comment);
 *   }
 * );
 *
 * // Wait for rejection due to position limit
 * const cancel = listenRiskOnce(
 *   (event) => event.comment.includes("Max") && event.activePositionCount >= 3,
 *   (event) => console.log("Position limit reached:", event.activePositionCount)
 * );
 *
 * // Cancel if needed before event fires
 * cancel();
 * ```
 */
declare function listenRiskOnce(filterFn: (event: RiskContract) => boolean, fn: (event: RiskContract) => void): () => void;
/**
 * Subscribes to ping events during scheduled signal monitoring with queued async processing.
 *
 * Events are emitted every minute when a scheduled signal is being monitored (waiting for activation).
 * Allows tracking of scheduled signal lifecycle and custom monitoring logic.
 *
 * @param fn - Callback function to handle ping events
 * @returns Unsubscribe function to stop listening
 *
 * @example
 * ```typescript
 * import { listenPing } from "./function/event";
 *
 * const unsubscribe = listenPing((event) => {
 *   console.log(`Ping for ${event.symbol} at ${new Date(event.timestamp).toISOString()}`);
 *   console.log(`Strategy: ${event.strategyName}, Exchange: ${event.exchangeName}`);
 *   console.log(`Mode: ${event.backtest ? "Backtest" : "Live"}`);
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
declare function listenPing(fn: (event: PingContract) => void): () => void;
/**
 * Subscribes to filtered ping events with one-time execution.
 *
 * Listens for events matching the filter predicate, then executes callback once
 * and automatically unsubscribes. Useful for waiting for specific ping conditions.
 *
 * @param filterFn - Predicate to filter which events trigger the callback
 * @param fn - Callback function to handle the filtered event (called only once)
 * @returns Unsubscribe function to cancel the listener before it fires
 *
 * @example
 * ```typescript
 * import { listenPingOnce } from "./function/event";
 *
 * // Wait for first ping on BTCUSDT
 * listenPingOnce(
 *   (event) => event.symbol === "BTCUSDT",
 *   (event) => console.log("First BTCUSDT ping received")
 * );
 *
 * // Wait for ping in backtest mode
 * const cancel = listenPingOnce(
 *   (event) => event.backtest === true,
 *   (event) => console.log("Backtest ping received at", new Date(event.timestamp))
 * );
 *
 * // Cancel if needed before event fires
 * cancel();
 * ```
 */
declare function listenPingOnce(filterFn: (event: PingContract) => boolean, fn: (event: PingContract) => void): () => void;

/**
 * Checks if trade context is active (execution and method contexts).
 *
 * Returns true when both contexts are active, which is required for calling
 * exchange functions like getCandles, getAveragePrice, formatPrice, formatQuantity,
 * getDate, and getMode.
 *
 * @returns true if trade context is active, false otherwise
 *
 * @example
 * ```typescript
 * import { hasTradeContext, getCandles } from "backtest-kit";
 *
 * if (hasTradeContext()) {
 *   const candles = await getCandles("BTCUSDT", "1m", 100);
 * } else {
 *   console.log("Trade context not active");
 * }
 * ```
 */
declare function hasTradeContext(): boolean;
/**
 * Fetches historical candle data from the registered exchange.
 *
 * Candles are fetched backwards from the current execution context time.
 * Uses the exchange's getCandles implementation.
 *
 * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
 * @param interval - Candle interval ("1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h")
 * @param limit - Number of candles to fetch
 * @returns Promise resolving to array of candle data
 *
 * @example
 * ```typescript
 * const candles = await getCandles("BTCUSDT", "1m", 100);
 * console.log(candles[0]); // { timestamp, open, high, low, close, volume }
 * ```
 */
declare function getCandles(symbol: string, interval: CandleInterval, limit: number): Promise<ICandleData[]>;
/**
 * Calculates VWAP (Volume Weighted Average Price) for a symbol.
 *
 * Uses the last 5 1-minute candles to calculate:
 * - Typical Price = (high + low + close) / 3
 * - VWAP = sum(typical_price * volume) / sum(volume)
 *
 * If volume is zero, returns simple average of close prices.
 *
 * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
 * @returns Promise resolving to VWAP price
 *
 * @example
 * ```typescript
 * const vwap = await getAveragePrice("BTCUSDT");
 * console.log(vwap); // 50125.43
 * ```
 */
declare function getAveragePrice(symbol: string): Promise<number>;
/**
 * Formats a price value according to exchange rules.
 *
 * Uses the exchange's formatPrice implementation for proper decimal places.
 *
 * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
 * @param price - Raw price value
 * @returns Promise resolving to formatted price string
 *
 * @example
 * ```typescript
 * const formatted = await formatPrice("BTCUSDT", 50000.123456);
 * console.log(formatted); // "50000.12"
 * ```
 */
declare function formatPrice(symbol: string, price: number): Promise<string>;
/**
 * Formats a quantity value according to exchange rules.
 *
 * Uses the exchange's formatQuantity implementation for proper decimal places.
 *
 * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
 * @param quantity - Raw quantity value
 * @returns Promise resolving to formatted quantity string
 *
 * @example
 * ```typescript
 * const formatted = await formatQuantity("BTCUSDT", 0.123456789);
 * console.log(formatted); // "0.12345678"
 * ```
 */
declare function formatQuantity(symbol: string, quantity: number): Promise<string>;
/**
 * Gets the current date from execution context.
 *
 * In backtest mode: returns the current timeframe date being processed
 * In live mode: returns current real-time date
 *
 * @returns Promise resolving to current execution context date
 *
 * @example
 * ```typescript
 * const date = await getDate();
 * console.log(date); // 2024-01-01T12:00:00.000Z
 * ```
 */
declare function getDate(): Promise<Date>;
/**
 * Gets the current execution mode.
 *
 * @returns Promise resolving to "backtest" or "live"
 *
 * @example
 * ```typescript
 * const mode = await getMode();
 * if (mode === "backtest") {
 *   console.log("Running in backtest mode");
 * } else {
 *   console.log("Running in live mode");
 * }
 * ```
 */
declare function getMode(): Promise<"backtest" | "live">;

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
declare function dumpSignal(signalId: string | number, history: MessageModel[], signal: ISignalDto, outputDir?: string): Promise<void>;

/**
 * Portfolio heatmap statistics for a single symbol.
 * Aggregated metrics across all strategies for one trading pair.
 */
interface IHeatmapRow {
    /** Trading pair symbol (e.g., "BTCUSDT") */
    symbol: string;
    /** Total profit/loss percentage across all closed trades */
    totalPnl: number | null;
    /** Risk-adjusted return (Sharpe Ratio) */
    sharpeRatio: number | null;
    /** Maximum drawdown percentage (largest peak-to-trough decline) */
    maxDrawdown: number | null;
    /** Total number of closed trades */
    totalTrades: number;
    /** Number of winning trades */
    winCount: number;
    /** Number of losing trades */
    lossCount: number;
    /** Win rate percentage */
    winRate: number | null;
    /** Average PNL per trade */
    avgPnl: number | null;
    /** Standard deviation of PNL */
    stdDev: number | null;
    /** Profit factor: sum of wins / sum of losses */
    profitFactor: number | null;
    /** Average profit percentage on winning trades */
    avgWin: number | null;
    /** Average loss percentage on losing trades */
    avgLoss: number | null;
    /** Maximum consecutive winning trades */
    maxWinStreak: number;
    /** Maximum consecutive losing trades */
    maxLossStreak: number;
    /** Expectancy: (winRate * avgWin) - (lossRate * avgLoss) */
    expectancy: number | null;
}

/**
 * Column configuration for markdown table generation.
 * Generic interface that defines how to extract and format data from any data type.
 *
 * @template T - The data type that this column will format
 *
 * @example
 * ```typescript
 * // Column for formatting signal data
 * const signalColumn: ColumnModel<IStrategyTickResultClosed> = {
 *   key: "pnl",
 *   label: "PNL",
 *   format: (signal) => `${signal.pnl.pnlPercentage.toFixed(2)}%`,
 *   isVisible: () => true
 * };
 *
 * // Column for formatting heatmap rows
 * const heatmapColumn: ColumnModel<IHeatmapRow> = {
 *   key: "symbol",
 *   label: "Symbol",
 *   format: (row) => row.symbol,
 *   isVisible: () => true
 * };
 * ```
 */
interface ColumnModel<T extends object = any> {
    /** Unique column identifier */
    key: string;
    /** Display label for column header */
    label: string;
    /** Formatting function to convert data to string */
    format: (data: T, index: number) => string | Promise<string>;
    /** Function to determine if column should be visible */
    isVisible: () => boolean | Promise<boolean>;
}

/**
 * Signal opened notification.
 * Emitted when a new trading position is opened.
 */
interface SignalOpenedNotification {
    type: "signal.opened";
    id: string;
    timestamp: number;
    backtest: boolean;
    symbol: string;
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    signalId: string;
    position: "long" | "short";
    priceOpen: number;
    priceTakeProfit: number;
    priceStopLoss: number;
    note?: string;
}
/**
 * Signal closed notification.
 * Emitted when a trading position is closed (TP/SL hit).
 */
interface SignalClosedNotification {
    type: "signal.closed";
    id: string;
    timestamp: number;
    backtest: boolean;
    symbol: string;
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    signalId: string;
    position: "long" | "short";
    priceOpen: number;
    priceClose: number;
    pnlPercentage: number;
    closeReason: string;
    duration: number;
    note?: string;
}
/**
 * Partial profit notification.
 * Emitted when signal reaches profit level milestone (10%, 20%, etc).
 */
interface PartialProfitNotification {
    type: "partial.profit";
    id: string;
    timestamp: number;
    backtest: boolean;
    symbol: string;
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    signalId: string;
    level: PartialLevel;
    currentPrice: number;
    priceOpen: number;
    position: "long" | "short";
}
/**
 * Partial loss notification.
 * Emitted when signal reaches loss level milestone (-10%, -20%, etc).
 */
interface PartialLossNotification {
    type: "partial.loss";
    id: string;
    timestamp: number;
    backtest: boolean;
    symbol: string;
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    signalId: string;
    level: PartialLevel;
    currentPrice: number;
    priceOpen: number;
    position: "long" | "short";
}
/**
 * Risk rejection notification.
 * Emitted when a signal is rejected due to risk management rules.
 */
interface RiskRejectionNotification {
    type: "risk.rejection";
    id: string;
    timestamp: number;
    backtest: boolean;
    symbol: string;
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    rejectionNote: string;
    rejectionId: string | null;
    activePositionCount: number;
    currentPrice: number;
    pendingSignal: ISignalDto;
}
/**
 * Scheduled signal notification.
 * Emitted when a signal is scheduled for future execution.
 */
interface SignalScheduledNotification {
    type: "signal.scheduled";
    id: string;
    timestamp: number;
    backtest: boolean;
    symbol: string;
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    signalId: string;
    position: "long" | "short";
    priceOpen: number;
    scheduledAt: number;
    currentPrice: number;
}
/**
 * Signal cancelled notification.
 * Emitted when a scheduled signal is cancelled before activation.
 */
interface SignalCancelledNotification {
    type: "signal.cancelled";
    id: string;
    timestamp: number;
    backtest: boolean;
    symbol: string;
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    signalId: string;
    position: "long" | "short";
    cancelReason: string;
    cancelId: string;
    duration: number;
}
/**
 * Backtest completed notification.
 * Emitted when backtest execution completes.
 */
interface BacktestDoneNotification {
    type: "backtest.done";
    id: string;
    timestamp: number;
    backtest: true;
    symbol: string;
    strategyName: StrategyName;
    exchangeName: ExchangeName;
}
/**
 * Live trading completed notification.
 * Emitted when live trading execution completes.
 */
interface LiveDoneNotification {
    type: "live.done";
    id: string;
    timestamp: number;
    backtest: false;
    symbol: string;
    strategyName: StrategyName;
    exchangeName: ExchangeName;
}
/**
 * Error notification.
 * Emitted for recoverable errors in background tasks.
 */
interface InfoErrorNotification {
    type: "error.info";
    id: string;
    error: object;
    message: string;
    timestamp: number;
    backtest: boolean;
}
/**
 * Critical error notification.
 * Emitted for fatal errors requiring process termination.
 */
interface CriticalErrorNotification {
    type: "error.critical";
    id: string;
    error: object;
    message: string;
    timestamp: number;
    backtest: boolean;
}
/**
 * Validation error notification.
 * Emitted when risk validation functions throw errors.
 */
interface ValidationErrorNotification {
    type: "error.validation";
    id: string;
    error: object;
    message: string;
    timestamp: number;
    backtest: boolean;
}
/**
 * Progress update notification.
 * Emitted during backtest execution.
 */
interface ProgressBacktestNotification {
    type: "progress.backtest";
    id: string;
    timestamp: number;
    backtest: true;
    exchangeName: ExchangeName;
    strategyName: StrategyName;
    symbol: string;
    totalFrames: number;
    processedFrames: number;
    progress: number;
}
/**
 * Bootstrap notification.
 * Emitted when the notification system is initialized.
 * Marks the beginning of notification tracking session.
 */
interface BootstrapNotification {
    type: "bootstrap";
    id: string;
    timestamp: number;
}
/**
 * Root discriminated union of all notification types.
 * Type discrimination is done via the `type` field.
 *
 * @example
 * ```typescript
 * function handleNotification(notification: NotificationModel) {
 *   switch (notification.type) {
 *     case "signal.opened":
 *       console.log(`Position opened: ${notification.signalId}`);
 *       break;
 *     case "signal.closed":
 *       console.log(`PNL: ${notification.pnlPercentage}%`);
 *       break;
 *     case "partial.loss":
 *       if (notification.level >= 30) {
 *         console.warn("High loss alert!");
 *       }
 *       break;
 *     case "risk.rejection":
 *       console.error(`Signal rejected: ${notification.rejectionNote}`);
 *       break;
 *   }
 * }
 * ```
 */
type NotificationModel = SignalOpenedNotification | SignalClosedNotification | PartialProfitNotification | PartialLossNotification | RiskRejectionNotification | SignalScheduledNotification | SignalCancelledNotification | BacktestDoneNotification | LiveDoneNotification | InfoErrorNotification | CriticalErrorNotification | ValidationErrorNotification | ProgressBacktestNotification | BootstrapNotification;

/**
 * Unified tick event data for report generation.
 * Contains all information about a tick event regardless of action type.
 */
interface TickEvent {
    /** Event timestamp in milliseconds (pendingAt for opened/closed events) */
    timestamp: number;
    /** Event action type */
    action: "idle" | "opened" | "active" | "closed";
    /** Trading pair symbol (only for non-idle events) */
    symbol?: string;
    /** Signal ID (only for opened/active/closed) */
    signalId?: string;
    /** Position type (only for opened/active/closed) */
    position?: string;
    /** Signal note (only for opened/active/closed) */
    note?: string;
    /** Current price */
    currentPrice: number;
    /** Open price (only for opened/active/closed) */
    openPrice?: number;
    /** Take profit price (only for opened/active/closed) */
    takeProfit?: number;
    /** Stop loss price (only for opened/active/closed) */
    stopLoss?: number;
    /** Percentage progress towards take profit (only for active) */
    percentTp?: number;
    /** Percentage progress towards stop loss (only for active) */
    percentSl?: number;
    /** PNL percentage (only for closed) */
    pnl?: number;
    /** Close reason (only for closed) */
    closeReason?: string;
    /** Duration in minutes (only for closed) */
    duration?: number;
}
/**
 * Statistical data calculated from live trading results.
 *
 * All numeric values are null if calculation is unsafe (NaN, Infinity, etc).
 * Provides comprehensive metrics for live trading performance analysis.
 *
 * @example
 * ```typescript
 * const stats = await Live.getData("my-strategy");
 *
 * console.log(`Total events: ${stats.totalEvents}`);
 * console.log(`Closed signals: ${stats.totalClosed}`);
 * console.log(`Win rate: ${stats.winRate}%`);
 * console.log(`Sharpe Ratio: ${stats.sharpeRatio}`);
 *
 * // Access raw event data (includes idle, opened, active, closed)
 * stats.eventList.forEach(event => {
 *   if (event.action === "closed") {
 *     console.log(`Closed signal: ${event.pnl}%`);
 *   }
 * });
 * ```
 */
interface LiveStatisticsModel {
    /** Array of all events (idle, opened, active, closed) with full details */
    eventList: TickEvent[];
    /** Total number of all events (includes idle, opened, active, closed) */
    totalEvents: number;
    /** Total number of closed signals only */
    totalClosed: number;
    /** Number of winning closed signals (PNL > 0) */
    winCount: number;
    /** Number of losing closed signals (PNL < 0) */
    lossCount: number;
    /** Win rate as percentage (0-100) based on closed signals, null if unsafe. Higher is better. */
    winRate: number | null;
    /** Average PNL per closed signal as percentage, null if unsafe. Higher is better. */
    avgPnl: number | null;
    /** Cumulative PNL across all closed signals as percentage, null if unsafe. Higher is better. */
    totalPnl: number | null;
    /** Standard deviation of returns (volatility metric), null if unsafe. Lower is better. */
    stdDev: number | null;
    /** Sharpe Ratio (risk-adjusted return = avgPnl / stdDev), null if unsafe. Higher is better. */
    sharpeRatio: number | null;
    /** Annualized Sharpe Ratio (sharpeRatio × √365), null if unsafe. Higher is better. */
    annualizedSharpeRatio: number | null;
    /** Certainty Ratio (avgWin / |avgLoss|), null if unsafe. Higher is better. */
    certaintyRatio: number | null;
    /** Expected yearly returns based on average trade duration and PNL, null if unsafe. Higher is better. */
    expectedYearlyReturns: number | null;
}

/**
 * Portfolio heatmap statistics structure.
 * Contains aggregated data for all symbols in the portfolio.
 */
interface HeatmapStatisticsModel {
    /** Array of symbol statistics */
    symbols: IHeatmapRow[];
    /** Total number of symbols tracked */
    totalSymbols: number;
    /** Portfolio-wide total PNL */
    portfolioTotalPnl: number | null;
    /** Portfolio-wide Sharpe Ratio */
    portfolioSharpeRatio: number | null;
    /** Portfolio-wide total trades */
    portfolioTotalTrades: number;
}

/**
 * Unified scheduled signal event data for report generation.
 * Contains all information about scheduled, opened and cancelled events.
 */
interface ScheduledEvent {
    /** Event timestamp in milliseconds (scheduledAt for scheduled/cancelled events) */
    timestamp: number;
    /** Event action type */
    action: "scheduled" | "opened" | "cancelled";
    /** Trading pair symbol */
    symbol: string;
    /** Signal ID */
    signalId: string;
    /** Position type */
    position: string;
    /** Signal note */
    note?: string;
    /** Current market price */
    currentPrice: number;
    /** Scheduled entry price */
    priceOpen: number;
    /** Take profit price */
    takeProfit: number;
    /** Stop loss price */
    stopLoss: number;
    /** Close timestamp (only for cancelled) */
    closeTimestamp?: number;
    /** Duration in minutes (only for cancelled/opened) */
    duration?: number;
    /** Cancellation reason (only for cancelled events) */
    cancelReason?: "timeout" | "price_reject" | "user";
    /** Cancellation ID (only for user-initiated cancellations) */
    cancelId?: string;
}
/**
 * Statistical data calculated from scheduled signals.
 *
 * Provides metrics for scheduled signal tracking, activation and cancellation analysis.
 *
 * @example
 * ```typescript
 * const stats = await Schedule.getData("my-strategy");
 *
 * console.log(`Total events: ${stats.totalEvents}`);
 * console.log(`Scheduled signals: ${stats.totalScheduled}`);
 * console.log(`Opened signals: ${stats.totalOpened}`);
 * console.log(`Cancelled signals: ${stats.totalCancelled}`);
 * console.log(`Cancellation rate: ${stats.cancellationRate}%`);
 *
 * // Access raw event data (includes scheduled, opened, cancelled)
 * stats.eventList.forEach(event => {
 *   if (event.action === "cancelled") {
 *     console.log(`Cancelled signal: ${event.signalId}`);
 *   }
 * });
 * ```
 */
interface ScheduleStatisticsModel {
    /** Array of all scheduled/opened/cancelled events with full details */
    eventList: ScheduledEvent[];
    /** Total number of all events (includes scheduled, opened, cancelled) */
    totalEvents: number;
    /** Total number of scheduled signals */
    totalScheduled: number;
    /** Total number of opened signals (activated from scheduled) */
    totalOpened: number;
    /** Total number of cancelled signals */
    totalCancelled: number;
    /** Cancellation rate as percentage (0-100), null if no scheduled signals. Lower is better. */
    cancellationRate: number | null;
    /** Activation rate as percentage (0-100), null if no scheduled signals. Higher is better. */
    activationRate: number | null;
    /** Average waiting time for cancelled signals in minutes, null if no cancelled signals */
    avgWaitTime: number | null;
    /** Average waiting time for opened signals in minutes, null if no opened signals */
    avgActivationTime: number | null;
}

/**
 * Aggregated statistics for a specific metric type.
 */
interface MetricStats {
    /** Type of metric */
    metricType: PerformanceMetricType;
    /** Number of recorded samples */
    count: number;
    /** Total duration across all samples (ms) */
    totalDuration: number;
    /** Average duration (ms) */
    avgDuration: number;
    /** Minimum duration (ms) */
    minDuration: number;
    /** Maximum duration (ms) */
    maxDuration: number;
    /** Standard deviation of duration (ms) */
    stdDev: number;
    /** Median duration (ms) */
    median: number;
    /** 95th percentile duration (ms) */
    p95: number;
    /** 99th percentile duration (ms) */
    p99: number;
    /** Average wait time between events (ms) */
    avgWaitTime: number;
    /** Minimum wait time between events (ms) */
    minWaitTime: number;
    /** Maximum wait time between events (ms) */
    maxWaitTime: number;
}
/**
 * Performance statistics aggregated by strategy.
 */
interface PerformanceStatisticsModel {
    /** Strategy name */
    strategyName: string;
    /** Total number of performance events recorded */
    totalEvents: number;
    /** Total execution time across all metrics (ms) */
    totalDuration: number;
    /** Statistics grouped by metric type */
    metricStats: Record<string, MetricStats>;
    /** All raw performance events */
    events: PerformanceContract[];
}

/**
 * Signal data for PNL table.
 * Represents a single closed signal with essential trading information.
 */
interface SignalData$1 {
    /** Strategy that generated this signal */
    strategyName: StrategyName;
    /** Unique signal identifier */
    signalId: string;
    /** Trading pair symbol */
    symbol: string;
    /** Position type (long/short) */
    position: string;
    /** PNL as percentage */
    pnl: number;
    /** Reason why signal was closed */
    closeReason: string;
    /** Timestamp when signal opened */
    openTime: number;
    /** Timestamp when signal closed */
    closeTime: number;
}
/**
 * Strategy result entry for comparison table.
 * Contains strategy name, full statistics, and metric value for ranking.
 */
interface IStrategyResult {
    /** Strategy name */
    strategyName: StrategyName;
    /** Complete backtest statistics for this strategy */
    stats: BacktestStatisticsModel;
    /** Value of the optimization metric (null if invalid) */
    metricValue: number | null;
}
/**
 * Alias for walker statistics result interface.
 * Used for clarity in markdown service context.
 *
 * Extends IWalkerResults with additional strategy comparison data.
 */
interface WalkerStatisticsModel extends WalkerCompleteContract {
    /** Array of all strategy results for comparison and analysis */
    strategyResults: IStrategyResult[];
}

/**
 * Unified partial profit/loss event data for report generation.
 * Contains all information about profit and loss level milestones.
 */
interface PartialEvent {
    /** Event timestamp in milliseconds */
    timestamp: number;
    /** Event action type (profit or loss) */
    action: "profit" | "loss";
    /** Trading pair symbol */
    symbol: string;
    /** Strategy name */
    strategyName: string;
    /** Signal ID */
    signalId: string;
    /** Position type */
    position: string;
    /** Current market price */
    currentPrice: number;
    /** Profit/loss level reached (10, 20, 30, etc) */
    level: PartialLevel;
    /** True if backtest mode, false if live mode */
    backtest: boolean;
}
/**
 * Statistical data calculated from partial profit/loss events.
 *
 * Provides metrics for partial profit/loss milestone tracking.
 *
 * @example
 * ```typescript
 * const stats = await Partial.getData("BTCUSDT", "my-strategy");
 *
 * console.log(`Total events: ${stats.totalEvents}`);
 * console.log(`Profit events: ${stats.totalProfit}`);
 * console.log(`Loss events: ${stats.totalLoss}`);
 * ```
 */
interface PartialStatisticsModel {
    /** Array of all profit/loss events with full details */
    eventList: PartialEvent[];
    /** Total number of all events (includes profit, loss) */
    totalEvents: number;
    /** Total number of profit events */
    totalProfit: number;
    /** Total number of loss events */
    totalLoss: number;
}

/**
 * Risk rejection event data for report generation.
 * Contains all information about rejected signals due to risk limits.
 */
interface RiskEvent {
    /** Event timestamp in milliseconds */
    timestamp: number;
    /** Trading pair symbol */
    symbol: string;
    /** Pending signal details */
    pendingSignal: ISignalDto;
    /** Strategy name */
    strategyName: string;
    /** Exchange name */
    exchangeName: string;
    /** Time frame name */
    frameName: string;
    /** Current market price */
    currentPrice: number;
    /** Number of active positions at rejection time */
    activePositionCount: number;
    /** Unique identifier for this rejection instance (null if validation threw exception without custom ID) */
    rejectionId: string | null;
    /** Rejection reason from validation note */
    rejectionNote: string;
    /** Whether this event is from backtest mode (true) or live mode (false) */
    backtest: boolean;
}
/**
 * Statistical data calculated from risk rejection events.
 *
 * Provides metrics for risk management tracking.
 *
 * @example
 * ```typescript
 * const stats = await Risk.getData("BTCUSDT", "my-strategy");
 *
 * console.log(`Total rejections: ${stats.totalRejections}`);
 * console.log(`Rejections by symbol:`, stats.bySymbol);
 * ```
 */
interface RiskStatisticsModel {
    /** Array of all risk rejection events with full details */
    eventList: RiskEvent[];
    /** Total number of risk rejections */
    totalRejections: number;
    /** Rejections grouped by symbol */
    bySymbol: Record<string, number>;
    /** Rejections grouped by strategy */
    byStrategy: Record<string, number>;
}

declare const BASE_WAIT_FOR_INIT_SYMBOL: unique symbol;
/**
 * Signal data stored in persistence layer.
 * Contains nullable signal for atomic updates.
 */
type SignalData = ISignalRow | null;
/**
 * Type helper for PersistBase instance.
 */
type TPersistBase = InstanceType<typeof PersistBase>;
/**
 * Constructor type for PersistBase.
 * Used for custom persistence adapters.
 */
type TPersistBaseCtor<EntityName extends string = string, Entity extends IEntity | null = IEntity> = new (entityName: EntityName, baseDir: string) => IPersistBase<Entity>;
/**
 * Entity identifier - string or number.
 */
type EntityId = string | number;
/**
 * Base interface for persisted entities.
 */
interface IEntity {
}
/**
 * Persistence interface for CRUD operations.
 * Implemented by PersistBase.
 */
interface IPersistBase<Entity extends IEntity | null = IEntity> {
    /**
     * Initialize persistence directory and validate existing files.
     * Uses singleshot to ensure one-time execution.
     *
     * @param initial - Whether this is the first initialization
     * @returns Promise that resolves when initialization is complete
     */
    waitForInit(initial: boolean): Promise<void>;
    /**
     * Read entity from persistence storage.
     *
     * @param entityId - Unique entity identifier
     * @returns Promise resolving to entity data
     * @throws Error if entity not found or read fails
     */
    readValue(entityId: EntityId): Promise<Entity>;
    /**
     * Check if entity exists in storage.
     *
     * @param entityId - Unique entity identifier
     * @returns Promise resolving to true if exists, false otherwise
     */
    hasValue(entityId: EntityId): Promise<boolean>;
    /**
     * Write entity to storage with atomic file writes.
     *
     * @param entityId - Unique entity identifier
     * @param entity - Entity data to persist
     * @returns Promise that resolves when write is complete
     * @throws Error if write fails
     */
    writeValue(entityId: EntityId, entity: Entity): Promise<void>;
}
/**
 * Base class for file-based persistence with atomic writes.
 *
 * Features:
 * - Atomic file writes using writeFileAtomic
 * - Auto-validation and cleanup of corrupted files
 * - Async generator support for iteration
 * - Retry logic for file deletion
 *
 * @example
 * ```typescript
 * const persist = new PersistBase("my-entity", "./data");
 * await persist.waitForInit(true);
 * await persist.writeValue("key1", { data: "value" });
 * const value = await persist.readValue("key1");
 * ```
 */
declare const PersistBase: {
    new <EntityName extends string = string>(entityName: EntityName, baseDir?: string): {
        /** Computed directory path for entity storage */
        _directory: string;
        readonly entityName: EntityName;
        readonly baseDir: string;
        /**
         * Computes file path for entity ID.
         *
         * @param entityId - Entity identifier
         * @returns Full file path to entity JSON file
         */
        _getFilePath(entityId: EntityId): string;
        waitForInit(initial: boolean): Promise<void>;
        /**
         * Returns count of persisted entities.
         *
         * @returns Promise resolving to number of .json files in directory
         */
        getCount(): Promise<number>;
        readValue<T extends IEntity = IEntity>(entityId: EntityId): Promise<T>;
        hasValue(entityId: EntityId): Promise<boolean>;
        writeValue<T extends IEntity = IEntity>(entityId: EntityId, entity: T): Promise<void>;
        /**
         * Removes entity from storage.
         *
         * @param entityId - Entity identifier to remove
         * @returns Promise that resolves when entity is deleted
         * @throws Error if entity not found or deletion fails
         */
        removeValue(entityId: EntityId): Promise<void>;
        /**
         * Removes all entities from storage.
         *
         * @returns Promise that resolves when all entities are deleted
         * @throws Error if deletion fails
         */
        removeAll(): Promise<void>;
        /**
         * Async generator yielding all entity values.
         * Sorted alphanumerically by entity ID.
         *
         * @returns AsyncGenerator yielding entities
         * @throws Error if reading fails
         */
        values<T extends IEntity = IEntity>(): AsyncGenerator<T>;
        /**
         * Async generator yielding all entity IDs.
         * Sorted alphanumerically.
         *
         * @returns AsyncGenerator yielding entity IDs
         * @throws Error if reading fails
         */
        keys(): AsyncGenerator<EntityId>;
        /**
         * Filters entities by predicate function.
         *
         * @param predicate - Filter function
         * @returns AsyncGenerator yielding filtered entities
         */
        filter<T extends IEntity = IEntity>(predicate: (value: T) => boolean): AsyncGenerator<T>;
        /**
         * Takes first N entities, optionally filtered.
         *
         * @param total - Maximum number of entities to yield
         * @param predicate - Optional filter function
         * @returns AsyncGenerator yielding up to total entities
         */
        take<T extends IEntity = IEntity>(total: number, predicate?: (value: T) => boolean): AsyncGenerator<T>;
        [BASE_WAIT_FOR_INIT_SYMBOL]: (() => Promise<void>) & functools_kit.ISingleshotClearable;
        /**
         * Async iterator implementation.
         * Delegates to values() generator.
         *
         * @returns AsyncIterableIterator yielding entities
         */
        [Symbol.asyncIterator](): AsyncIterableIterator<any>;
    };
};
/**
 * Utility class for managing signal persistence.
 *
 * Features:
 * - Memoized storage instances per strategy
 * - Custom adapter support
 * - Atomic read/write operations
 * - Crash-safe signal state management
 *
 * Used by ClientStrategy for live mode persistence.
 */
declare class PersistSignalUtils {
    private PersistSignalFactory;
    private getSignalStorage;
    /**
     * Registers a custom persistence adapter.
     *
     * @param Ctor - Custom PersistBase constructor
     *
     * @example
     * ```typescript
     * class RedisPersist extends PersistBase {
     *   async readValue(id) { return JSON.parse(await redis.get(id)); }
     *   async writeValue(id, entity) { await redis.set(id, JSON.stringify(entity)); }
     * }
     * PersistSignalAdapter.usePersistSignalAdapter(RedisPersist);
     * ```
     */
    usePersistSignalAdapter(Ctor: TPersistBaseCtor<StrategyName, SignalData>): void;
    /**
     * Reads persisted signal data for a symbol and strategy.
     *
     * Called by ClientStrategy.waitForInit() to restore state.
     * Returns null if no signal exists.
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Strategy identifier
     * @returns Promise resolving to signal or null
     */
    readSignalData: (symbol: string, strategyName: StrategyName) => Promise<ISignalRow | null>;
    /**
     * Writes signal data to disk with atomic file writes.
     *
     * Called by ClientStrategy.setPendingSignal() to persist state.
     * Uses atomic writes to prevent corruption on crashes.
     *
     * @param signalRow - Signal data (null to clear)
     * @param symbol - Trading pair symbol
     * @param strategyName - Strategy identifier
     * @returns Promise that resolves when write is complete
     */
    writeSignalData: (signalRow: ISignalRow | null, symbol: string, strategyName: StrategyName) => Promise<void>;
}
/**
 * Global singleton instance of PersistSignalUtils.
 * Used by ClientStrategy for signal persistence.
 *
 * @example
 * ```typescript
 * // Custom adapter
 * PersistSignalAdapter.usePersistSignalAdapter(RedisPersist);
 *
 * // Read signal
 * const signal = await PersistSignalAdapter.readSignalData("my-strategy", "BTCUSDT");
 *
 * // Write signal
 * await PersistSignalAdapter.writeSignalData(signal, "my-strategy", "BTCUSDT");
 * ```
 */
declare const PersistSignalAdapter: PersistSignalUtils;
/**
 * Type for persisted risk positions data.
 * Stores Map entries as array of [key, value] tuples for JSON serialization.
 */
type RiskData = Array<[string, IRiskActivePosition]>;
/**
 * Utility class for managing risk active positions persistence.
 *
 * Features:
 * - Memoized storage instances per risk profile
 * - Custom adapter support
 * - Atomic read/write operations for RiskData
 * - Crash-safe position state management
 *
 * Used by ClientRisk for live mode persistence of active positions.
 */
declare class PersistRiskUtils {
    private PersistRiskFactory;
    private getRiskStorage;
    /**
     * Registers a custom persistence adapter.
     *
     * @param Ctor - Custom PersistBase constructor
     *
     * @example
     * ```typescript
     * class RedisPersist extends PersistBase {
     *   async readValue(id) { return JSON.parse(await redis.get(id)); }
     *   async writeValue(id, entity) { await redis.set(id, JSON.stringify(entity)); }
     * }
     * PersistRiskAdapter.usePersistRiskAdapter(RedisPersist);
     * ```
     */
    usePersistRiskAdapter(Ctor: TPersistBaseCtor<RiskName, RiskData>): void;
    /**
     * Reads persisted active positions for a risk profile.
     *
     * Called by ClientRisk.waitForInit() to restore state.
     * Returns empty Map if no positions exist.
     *
     * @param riskName - Risk profile identifier
     * @returns Promise resolving to Map of active positions
     */
    readPositionData: (riskName: RiskName) => Promise<RiskData>;
    /**
     * Writes active positions to disk with atomic file writes.
     *
     * Called by ClientRisk after addSignal/removeSignal to persist state.
     * Uses atomic writes to prevent corruption on crashes.
     *
     * @param positions - Map of active positions
     * @param riskName - Risk profile identifier
     * @returns Promise that resolves when write is complete
     */
    writePositionData: (riskRow: RiskData, riskName: RiskName) => Promise<void>;
}
/**
 * Global singleton instance of PersistRiskUtils.
 * Used by ClientRisk for active positions persistence.
 *
 * @example
 * ```typescript
 * // Custom adapter
 * PersistRiskAdapter.usePersistRiskAdapter(RedisPersist);
 *
 * // Read positions
 * const positions = await PersistRiskAdapter.readPositionData("my-risk");
 *
 * // Write positions
 * await PersistRiskAdapter.writePositionData(positionsMap, "my-risk");
 * ```
 */
declare const PersistRiskAdapter: PersistRiskUtils;
/**
 * Type for persisted scheduled signal data.
 * Contains nullable scheduled signal for atomic updates.
 */
type ScheduleData = IScheduledSignalRow | null;
/**
 * Utility class for managing scheduled signal persistence.
 *
 * Features:
 * - Memoized storage instances per strategy
 * - Custom adapter support
 * - Atomic read/write operations for scheduled signals
 * - Crash-safe scheduled signal state management
 *
 * Used by ClientStrategy for live mode persistence of scheduled signals (_scheduledSignal).
 */
declare class PersistScheduleUtils {
    private PersistScheduleFactory;
    private getScheduleStorage;
    /**
     * Registers a custom persistence adapter.
     *
     * @param Ctor - Custom PersistBase constructor
     *
     * @example
     * ```typescript
     * class RedisPersist extends PersistBase {
     *   async readValue(id) { return JSON.parse(await redis.get(id)); }
     *   async writeValue(id, entity) { await redis.set(id, JSON.stringify(entity)); }
     * }
     * PersistScheduleAdapter.usePersistScheduleAdapter(RedisPersist);
     * ```
     */
    usePersistScheduleAdapter(Ctor: TPersistBaseCtor<StrategyName, ScheduleData>): void;
    /**
     * Reads persisted scheduled signal data for a symbol and strategy.
     *
     * Called by ClientStrategy.waitForInit() to restore scheduled signal state.
     * Returns null if no scheduled signal exists.
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Strategy identifier
     * @returns Promise resolving to scheduled signal or null
     */
    readScheduleData: (symbol: string, strategyName: StrategyName) => Promise<IScheduledSignalRow | null>;
    /**
     * Writes scheduled signal data to disk with atomic file writes.
     *
     * Called by ClientStrategy.setScheduledSignal() to persist state.
     * Uses atomic writes to prevent corruption on crashes.
     *
     * @param scheduledSignalRow - Scheduled signal data (null to clear)
     * @param symbol - Trading pair symbol
     * @param strategyName - Strategy identifier
     * @returns Promise that resolves when write is complete
     */
    writeScheduleData: (scheduledSignalRow: IScheduledSignalRow | null, symbol: string, strategyName: StrategyName) => Promise<void>;
}
/**
 * Global singleton instance of PersistScheduleUtils.
 * Used by ClientStrategy for scheduled signal persistence.
 *
 * @example
 * ```typescript
 * // Custom adapter
 * PersistScheduleAdapter.usePersistScheduleAdapter(RedisPersist);
 *
 * // Read scheduled signal
 * const scheduled = await PersistScheduleAdapter.readScheduleData("my-strategy", "BTCUSDT");
 *
 * // Write scheduled signal
 * await PersistScheduleAdapter.writeScheduleData(scheduled, "my-strategy", "BTCUSDT");
 * ```
 */
declare const PersistScheduleAdapter: PersistScheduleUtils;
/**
 * Type for persisted partial data.
 * Stores profit and loss levels as arrays for JSON serialization.
 */
type PartialData = Record<string, IPartialData>;
/**
 * Utility class for managing partial profit/loss levels persistence.
 *
 * Features:
 * - Memoized storage instances per symbol:strategyName
 * - Custom adapter support
 * - Atomic read/write operations for partial data
 * - Crash-safe partial state management
 *
 * Used by ClientPartial for live mode persistence of profit/loss levels.
 */
declare class PersistPartialUtils {
    private PersistPartialFactory;
    private getPartialStorage;
    /**
     * Registers a custom persistence adapter.
     *
     * @param Ctor - Custom PersistBase constructor
     *
     * @example
     * ```typescript
     * class RedisPersist extends PersistBase {
     *   async readValue(id) { return JSON.parse(await redis.get(id)); }
     *   async writeValue(id, entity) { await redis.set(id, JSON.stringify(entity)); }
     * }
     * PersistPartialAdapter.usePersistPartialAdapter(RedisPersist);
     * ```
     */
    usePersistPartialAdapter(Ctor: TPersistBaseCtor<string, PartialData>): void;
    /**
     * Reads persisted partial data for a symbol and strategy.
     *
     * Called by ClientPartial.waitForInit() to restore state.
     * Returns empty object if no partial data exists.
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Strategy identifier
     * @returns Promise resolving to partial data record
     */
    readPartialData: (symbol: string, strategyName: StrategyName) => Promise<PartialData>;
    /**
     * Writes partial data to disk with atomic file writes.
     *
     * Called by ClientPartial after profit/loss level changes to persist state.
     * Uses atomic writes to prevent corruption on crashes.
     *
     * @param partialData - Record of signal IDs to partial data
     * @param symbol - Trading pair symbol
     * @param strategyName - Strategy identifier
     * @returns Promise that resolves when write is complete
     */
    writePartialData: (partialData: PartialData, symbol: string, strategyName: StrategyName) => Promise<void>;
}
/**
 * Global singleton instance of PersistPartialUtils.
 * Used by ClientPartial for partial profit/loss levels persistence.
 *
 * @example
 * ```typescript
 * // Custom adapter
 * PersistPartialAdapter.usePersistPartialAdapter(RedisPersist);
 *
 * // Read partial data
 * const partialData = await PersistPartialAdapter.readPartialData("BTCUSDT", "my-strategy");
 *
 * // Write partial data
 * await PersistPartialAdapter.writePartialData(partialData, "BTCUSDT", "my-strategy");
 * ```
 */
declare const PersistPartialAdapter: PersistPartialUtils;

/**
 * Type alias for column configuration used in backtest markdown reports.
 *
 * Represents a column model specifically designed to format and display
 * closed backtest signals in markdown tables.
 *
 * @typeParam IStrategyTickResultClosed - The closed signal data type containing
 *   PNL information, close reason, timestamps, and other trade details
 *
 * @example
 * ```typescript
 * // Column to display signal ID
 * const signalIdColumn: Columns = {
 *   key: "signalId",
 *   label: "Signal ID",
 *   format: (signal) => signal.signal.id,
 *   isVisible: () => true
 * };
 *
 * // Column to display PNL percentage
 * const pnlColumn: Columns = {
 *   key: "pnl",
 *   label: "PNL %",
 *   format: (signal) => `${signal.pnl.pnlPercentage.toFixed(2)}%`,
 *   isVisible: () => true
 * };
 * ```
 *
 * @see ColumnModel for the base interface
 * @see IStrategyTickResultClosed for the signal data structure
 */
type Columns$6 = ColumnModel<IStrategyTickResultClosed>;
/**
 * Service for generating and saving backtest markdown reports.
 *
 * Features:
 * - Listens to signal events via onTick callback
 * - Accumulates closed signals per strategy using memoized storage
 * - Generates markdown tables with detailed signal information
 * - Saves reports to disk in logs/backtest/{strategyName}.md
 *
 * @example
 * ```typescript
 * const service = new BacktestMarkdownService();
 *
 * // Add to strategy callbacks
 * addStrategy({
 *   strategyName: "my-strategy",
 *   callbacks: {
 *     onTick: (symbol, result, backtest) => {
 *       service.tick(result);
 *     }
 *   }
 * });
 *
 * // After backtest, generate and save report
 * await service.saveReport("my-strategy");
 * ```
 */
declare class BacktestMarkdownService {
    /** Logger service for debug output */
    private readonly loggerService;
    /**
     * Memoized function to get or create ReportStorage for a symbol-strategy-exchange-frame-backtest combination.
     * Each combination gets its own isolated storage instance.
     */
    private getStorage;
    /**
     * Processes tick events and accumulates closed signals.
     * Should be called from IStrategyCallbacks.onTick.
     *
     * Only processes closed signals - opened signals are ignored.
     *
     * @param data - Tick result from strategy execution (opened or closed) with frameName wrapper
     *
     * @example
     * ```typescript
     * const service = new BacktestMarkdownService();
     *
     * callbacks: {
     *   onTick: (symbol, result, backtest) => {
     *     service.tick(result);
     *   }
     * }
     * ```
     */
    private tick;
    /**
     * Gets statistical data from all closed signals for a symbol-strategy pair.
     * Delegates to ReportStorage.getData().
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Strategy name to get data for
     * @param exchangeName - Exchange name
     * @param frameName - Frame name
     * @param backtest - True if backtest mode, false if live mode
     * @returns Statistical data object with all metrics
     *
     * @example
     * ```typescript
     * const service = new BacktestMarkdownService();
     * const stats = await service.getData("BTCUSDT", "my-strategy", "binance", "1h", true);
     * console.log(stats.sharpeRatio, stats.winRate);
     * ```
     */
    getData: (symbol: string, strategyName: StrategyName, exchangeName: string, frameName: string, backtest: boolean) => Promise<BacktestStatisticsModel>;
    /**
     * Generates markdown report with all closed signals for a symbol-strategy pair.
     * Delegates to ReportStorage.generateReport().
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Strategy name to generate report for
     * @param exchangeName - Exchange name
     * @param frameName - Frame name
     * @param backtest - True if backtest mode, false if live mode
     * @param columns - Column configuration for formatting the table
     * @returns Markdown formatted report string with table of all closed signals
     *
     * @example
     * ```typescript
     * const service = new BacktestMarkdownService();
     * const markdown = await service.getReport("BTCUSDT", "my-strategy", "binance", "1h", true);
     * console.log(markdown);
     * ```
     */
    getReport: (symbol: string, strategyName: StrategyName, exchangeName: string, frameName: string, backtest: boolean, columns?: Columns$6[]) => Promise<string>;
    /**
     * Saves symbol-strategy report to disk.
     * Creates directory if it doesn't exist.
     * Delegates to ReportStorage.dump().
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Strategy name to save report for
     * @param exchangeName - Exchange name
     * @param frameName - Frame name
     * @param backtest - True if backtest mode, false if live mode
     * @param path - Directory path to save report (default: "./dump/backtest")
     * @param columns - Column configuration for formatting the table
     *
     * @example
     * ```typescript
     * const service = new BacktestMarkdownService();
     *
     * // Save to default path: ./dump/backtest/my-strategy.md
     * await service.dump("BTCUSDT", "my-strategy", "binance", "1h", true);
     *
     * // Save to custom path: ./custom/path/my-strategy.md
     * await service.dump("BTCUSDT", "my-strategy", "binance", "1h", true, "./custom/path");
     * ```
     */
    dump: (symbol: string, strategyName: StrategyName, exchangeName: string, frameName: string, backtest: boolean, path?: string, columns?: Columns$6[]) => Promise<void>;
    /**
     * Clears accumulated signal data from storage.
     * If payload is provided, clears only that specific symbol-strategy-exchange-frame-backtest combination's data.
     * If nothing is provided, clears all data.
     *
     * @param payload - Optional payload with symbol, strategyName, exchangeName, frameName, backtest
     *
     * @example
     * ```typescript
     * const service = new BacktestMarkdownService();
     *
     * // Clear specific combination
     * await service.clear({ symbol: "BTCUSDT", strategyName: "my-strategy", exchangeName: "binance", frameName: "1h", backtest: true });
     *
     * // Clear all data
     * await service.clear();
     * ```
     */
    clear: (payload?: {
        symbol: string;
        strategyName: StrategyName;
        exchangeName: string;
        frameName: string;
        backtest: boolean;
    }) => Promise<void>;
    /**
     * Initializes the service by subscribing to backtest signal events.
     * Uses singleshot to ensure initialization happens only once.
     * Automatically called on first use.
     *
     * @example
     * ```typescript
     * const service = new BacktestMarkdownService();
     * await service.init(); // Subscribe to backtest events
     * ```
     */
    protected init: (() => Promise<void>) & functools_kit.ISingleshotClearable;
}

/**
 * Utility class for backtest operations.
 *
 * Provides simplified access to backtestCommandService.run() with logging.
 * Exported as singleton instance for convenient usage.
 *
 * @example
 * ```typescript
 * import { Backtest } from "./classes/Backtest";
 *
 * for await (const result of Backtest.run("BTCUSDT", {
 *   strategyName: "my-strategy",
 *   exchangeName: "my-exchange",
 *   frameName: "1d-backtest"
 * })) {
 *   console.log("Closed signal PNL:", result.pnl.pnlPercentage);
 * }
 * ```
 */
declare class BacktestUtils {
    /**
     * Memoized function to get or create BacktestInstance for a symbol-strategy pair.
     * Each symbol-strategy combination gets its own isolated instance.
     */
    private _getInstance;
    /**
     * Runs backtest for a symbol with context propagation.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param context - Execution context with strategy, exchange, and frame names
     * @returns Async generator yielding closed signals with PNL
     */
    run: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
        frameName: string;
    }) => AsyncGenerator<IStrategyBacktestResult, void, unknown>;
    /**
     * Runs backtest in background without yielding results.
     *
     * Consumes all backtest results internally without exposing them.
     * Useful for running backtests for side effects only (callbacks, logging).
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param context - Execution context with strategy, exchange, and frame names
     * @returns Cancellation closure
     *
     * @example
     * ```typescript
     * // Run backtest silently, only callbacks will fire
     * await Backtest.background("BTCUSDT", {
     *   strategyName: "my-strategy",
     *   exchangeName: "my-exchange",
     *   frameName: "1d-backtest"
     * });
     * console.log("Backtest completed");
     * ```
     */
    background: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
        frameName: string;
    }) => () => void;
    /**
     * Retrieves the currently active pending signal for the strategy.
     * If no active signal exists, returns null.
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Name of strategy to get pending signal for
     * @returns Promise resolving to pending signal or null
     *
     * @example
     * ```typescript
     * const pending = await Backtest.getPendingSignal("BTCUSDT", "my-strategy");
     * if (pending) {
     *   console.log("Active signal:", pending.id);
     * }
     * ```
     */
    getPendingSignal: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
        frameName: string;
    }) => Promise<ISignalRow>;
    /**
     * Retrieves the currently active scheduled signal for the strategy.
     * If no scheduled signal exists, returns null.
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Name of strategy to get scheduled signal for
     * @returns Promise resolving to scheduled signal or null
     *
     * @example
     * ```typescript
     * const scheduled = await Backtest.getScheduledSignal("BTCUSDT", "my-strategy");
     * if (scheduled) {
     *   console.log("Scheduled signal:", scheduled.id);
     * }
     * ```
     */
    getScheduledSignal: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
        frameName: string;
    }) => Promise<IScheduledSignalRow>;
    /**
     * Stops the strategy from generating new signals.
     *
     * Sets internal flag to prevent strategy from opening new signals.
     * Current active signal (if any) will complete normally.
     * Backtest will stop at the next safe point (idle state or after signal closes).
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Strategy name to stop
     * @param context - Execution context with exchangeName and frameName
     * @returns Promise that resolves when stop flag is set
     *
     * @example
     * ```typescript
     * // Stop strategy after some condition
     * await Backtest.stop("BTCUSDT", "my-strategy", {
     *   exchangeName: "binance",
     *   frameName: "frame1",
     *   strategyName: "my-strategy"
     * });
     * ```
     */
    stop: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
        frameName: string;
    }) => Promise<void>;
    /**
     * Cancels the scheduled signal without stopping the strategy.
     *
     * Clears the scheduled signal (waiting for priceOpen activation).
     * Does NOT affect active pending signals or strategy operation.
     * Does NOT set stop flag - strategy can continue generating new signals.
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Strategy name
     * @param context - Execution context with exchangeName and frameName
     * @param cancelId - Optional cancellation ID for tracking user-initiated cancellations
     * @returns Promise that resolves when scheduled signal is cancelled
     *
     * @example
     * ```typescript
     * // Cancel scheduled signal with custom ID
     * await Backtest.cancel("BTCUSDT", "my-strategy", {
     *   exchangeName: "binance",
     *   frameName: "frame1",
     *   strategyName: "my-strategy"
     * }, "manual-cancel-001");
     * ```
     */
    cancel: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
        frameName: string;
    }, cancelId?: string) => Promise<void>;
    /**
     * Executes partial close at profit level (moving toward TP).
     *
     * Closes a percentage of the active pending position at profit.
     * Price must be moving toward take profit (in profit direction).
     *
     * @param symbol - Trading pair symbol
     * @param percentToClose - Percentage of position to close (0-100, absolute value)
     * @param currentPrice - Current market price for this partial close
     * @param context - Execution context with strategyName, exchangeName, and frameName
     * @returns Promise that resolves when state is updated
     *
     * @throws Error if currentPrice is not in profit direction:
     *   - LONG: currentPrice must be > priceOpen
     *   - SHORT: currentPrice must be < priceOpen
     *
     * @example
     * ```typescript
     * // Close 30% of LONG position at profit
     * await Backtest.partialProfit("BTCUSDT", 30, 45000, {
     *   exchangeName: "binance",
     *   frameName: "frame1",
     *   strategyName: "my-strategy"
     * });
     * ```
     */
    partialProfit: (symbol: string, percentToClose: number, currentPrice: number, context: {
        strategyName: string;
        exchangeName: string;
        frameName: string;
    }) => Promise<void>;
    /**
     * Executes partial close at loss level (moving toward SL).
     *
     * Closes a percentage of the active pending position at loss.
     * Price must be moving toward stop loss (in loss direction).
     *
     * @param symbol - Trading pair symbol
     * @param percentToClose - Percentage of position to close (0-100, absolute value)
     * @param currentPrice - Current market price for this partial close
     * @param context - Execution context with strategyName, exchangeName, and frameName
     * @returns Promise that resolves when state is updated
     *
     * @throws Error if currentPrice is not in loss direction:
     *   - LONG: currentPrice must be < priceOpen
     *   - SHORT: currentPrice must be > priceOpen
     *
     * @example
     * ```typescript
     * // Close 40% of LONG position at loss
     * await Backtest.partialLoss("BTCUSDT", 40, 38000, {
     *   exchangeName: "binance",
     *   frameName: "frame1",
     *   strategyName: "my-strategy"
     * });
     * ```
     */
    partialLoss: (symbol: string, percentToClose: number, currentPrice: number, context: {
        strategyName: string;
        exchangeName: string;
        frameName: string;
    }) => Promise<void>;
    /**
     * Gets statistical data from all closed signals for a symbol-strategy pair.
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Strategy name to get data for
     * @param context - Execution context with exchangeName and frameName
     * @returns Promise resolving to statistical data object
     *
     * @example
     * ```typescript
     * const stats = await Backtest.getData("BTCUSDT", "my-strategy", {
     *   exchangeName: "binance",
     *   frameName: "frame1",
     *   strategyName: "my-strategy"
     * });
     * console.log(stats.sharpeRatio, stats.winRate);
     * ```
     */
    getData: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
        frameName: string;
    }) => Promise<BacktestStatisticsModel>;
    /**
     * Generates markdown report with all closed signals for a symbol-strategy pair.
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Strategy name to generate report for
     * @param context - Execution context with exchangeName and frameName
     * @param columns - Optional columns configuration for the report
     * @returns Promise resolving to markdown formatted report string
     *
     * @example
     * ```typescript
     * const markdown = await Backtest.getReport("BTCUSDT", "my-strategy", {
     *   exchangeName: "binance",
     *   frameName: "frame1",
     *   strategyName: "my-strategy"
     * });
     * console.log(markdown);
     * ```
     */
    getReport: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
        frameName: string;
    }, columns?: Columns$6[]) => Promise<string>;
    /**
     * Saves strategy report to disk.
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Strategy name to save report for
     * @param context - Execution context with exchangeName and frameName
     * @param path - Optional directory path to save report (default: "./dump/backtest")
     * @param columns - Optional columns configuration for the report
     *
     * @example
     * ```typescript
     * // Save to default path: ./dump/backtest/my-strategy.md
     * await Backtest.dump("BTCUSDT", "my-strategy", {
     *   exchangeName: "binance",
     *   frameName: "frame1",
     *   strategyName: "my-strategy"
     * });
     *
     * // Save to custom path: ./custom/path/my-strategy.md
     * await Backtest.dump("BTCUSDT", "my-strategy", {
     *   exchangeName: "binance",
     *   frameName: "frame1",
     *   strategyName: "my-strategy"
     * }, "./custom/path");
     * ```
     */
    dump: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
        frameName: string;
    }, path?: string, columns?: Columns$6[]) => Promise<void>;
    /**
     * Lists all active backtest instances with their current status.
     *
     * @returns Promise resolving to array of status objects for all instances
     *
     * @example
     * ```typescript
     * const statusList = await Backtest.list();
     * statusList.forEach(status => {
     *   console.log(`${status.symbol} - ${status.strategyName}: ${status.status}`);
     * });
     * ```
     */
    list: () => Promise<{
        id: string;
        symbol: string;
        strategyName: string;
        exchangeName: string;
        frameName: string;
        status: "pending" | "fulfilled" | "rejected" | "ready";
    }[]>;
}
/**
 * Singleton instance of BacktestUtils for convenient backtest operations.
 *
 * @example
 * ```typescript
 * import { Backtest } from "./classes/Backtest";
 *
 * for await (const result of Backtest.run("BTCUSDT", {
 *   strategyName: "my-strategy",
 *   exchangeName: "my-exchange",
 *   frameName: "1d-backtest"
 * })) {
 *   if (result.action === "closed") {
 *     console.log("PNL:", result.pnl.pnlPercentage);
 *   }
 * }
 * ```
 */
declare const Backtest: BacktestUtils;

/**
 * Type alias for column configuration used in live trading markdown reports.
 *
 * Represents a column model specifically designed to format and display
 * real-time trading events in markdown tables.
 *
 * @typeParam TickEvent - The live trading event data type containing
 *   signal information, timestamps, and trade details from active positions
 *
 * @example
 * ```typescript
 * // Column to display event timestamp
 * const timestampColumn: Columns = {
 *   key: "timestamp",
 *   label: "Time",
 *   format: (event) => new Date(event.timestamp).toISOString(),
 *   isVisible: () => true
 * };
 *
 * // Column to display event action type
 * const actionColumn: Columns = {
 *   key: "action",
 *   label: "Action",
 *   format: (event) => event.action,
 *   isVisible: () => true
 * };
 * ```
 *
 * @see ColumnModel for the base interface
 * @see TickEvent for the event data structure
 */
type Columns$5 = ColumnModel<TickEvent>;
/**
 * Service for generating and saving live trading markdown reports.
 *
 * Features:
 * - Listens to all signal events via onTick callback
 * - Accumulates all events (idle, opened, active, closed) per strategy
 * - Generates markdown tables with detailed event information
 * - Provides trading statistics (win rate, average PNL)
 * - Saves reports to disk in logs/live/{strategyName}.md
 *
 * @example
 * ```typescript
 * const service = new LiveMarkdownService();
 *
 * // Add to strategy callbacks
 * addStrategy({
 *   strategyName: "my-strategy",
 *   callbacks: {
 *     onTick: (symbol, result, backtest) => {
 *       if (!backtest) {
 *         service.tick(result);
 *       }
 *     }
 *   }
 * });
 *
 * // Later: generate and save report
 * await service.dump("my-strategy");
 * ```
 */
declare class LiveMarkdownService {
    /** Logger service for debug output */
    private readonly loggerService;
    /**
     * Memoized function to get or create ReportStorage for a symbol-strategy-exchange-frame-backtest combination.
     * Each combination gets its own isolated storage instance.
     */
    private getStorage;
    /**
     * Processes tick events and accumulates all event types.
     * Should be called from IStrategyCallbacks.onTick.
     *
     * Processes all event types: idle, opened, active, closed.
     *
     * @param data - Tick result from strategy execution with frameName wrapper
     *
     * @example
     * ```typescript
     * const service = new LiveMarkdownService();
     *
     * callbacks: {
     *   onTick: (symbol, result, backtest) => {
     *     if (!backtest) {
     *       service.tick(result);
     *     }
     *   }
     * }
     * ```
     */
    private tick;
    /**
     * Gets statistical data from all live trading events for a symbol-strategy pair.
     * Delegates to ReportStorage.getData().
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Strategy name to get data for
     * @param exchangeName - Exchange name
     * @param frameName - Frame name
     * @param backtest - True if backtest mode, false if live mode
     * @returns Statistical data object with all metrics
     *
     * @example
     * ```typescript
     * const service = new LiveMarkdownService();
     * const stats = await service.getData("BTCUSDT", "my-strategy", "binance", "1h", false);
     * console.log(stats.sharpeRatio, stats.winRate);
     * ```
     */
    getData: (symbol: string, strategyName: StrategyName, exchangeName: string, frameName: string, backtest: boolean) => Promise<LiveStatisticsModel>;
    /**
     * Generates markdown report with all events for a symbol-strategy pair.
     * Delegates to ReportStorage.getReport().
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Strategy name to generate report for
     * @param exchangeName - Exchange name
     * @param frameName - Frame name
     * @param backtest - True if backtest mode, false if live mode
     * @param columns - Column configuration for formatting the table
     * @returns Markdown formatted report string with table of all events
     *
     * @example
     * ```typescript
     * const service = new LiveMarkdownService();
     * const markdown = await service.getReport("BTCUSDT", "my-strategy", "binance", "1h", false);
     * console.log(markdown);
     * ```
     */
    getReport: (symbol: string, strategyName: StrategyName, exchangeName: string, frameName: string, backtest: boolean, columns?: Columns$5[]) => Promise<string>;
    /**
     * Saves symbol-strategy report to disk.
     * Creates directory if it doesn't exist.
     * Delegates to ReportStorage.dump().
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Strategy name to save report for
     * @param exchangeName - Exchange name
     * @param frameName - Frame name
     * @param backtest - True if backtest mode, false if live mode
     * @param path - Directory path to save report (default: "./dump/live")
     * @param columns - Column configuration for formatting the table
     *
     * @example
     * ```typescript
     * const service = new LiveMarkdownService();
     *
     * // Save to default path: ./dump/live/my-strategy.md
     * await service.dump("BTCUSDT", "my-strategy", "binance", "1h", false);
     *
     * // Save to custom path: ./custom/path/my-strategy.md
     * await service.dump("BTCUSDT", "my-strategy", "binance", "1h", false, "./custom/path");
     * ```
     */
    dump: (symbol: string, strategyName: StrategyName, exchangeName: string, frameName: string, backtest: boolean, path?: string, columns?: Columns$5[]) => Promise<void>;
    /**
     * Clears accumulated event data from storage.
     * If payload is provided, clears only that specific symbol-strategy-exchange-frame-backtest combination's data.
     * If nothing is provided, clears all data.
     *
     * @param payload - Optional payload with symbol, strategyName, exchangeName, frameName, backtest
     *
     * @example
     * ```typescript
     * const service = new LiveMarkdownService();
     *
     * // Clear specific combination
     * await service.clear({ symbol: "BTCUSDT", strategyName: "my-strategy", exchangeName: "binance", frameName: "1h", backtest: false });
     *
     * // Clear all data
     * await service.clear();
     * ```
     */
    clear: (payload?: {
        symbol: string;
        strategyName: StrategyName;
        exchangeName: string;
        frameName: string;
        backtest: boolean;
    }) => Promise<void>;
    /**
     * Initializes the service by subscribing to live signal events.
     * Uses singleshot to ensure initialization happens only once.
     * Automatically called on first use.
     *
     * @example
     * ```typescript
     * const service = new LiveMarkdownService();
     * await service.init(); // Subscribe to live events
     * ```
     */
    protected init: (() => Promise<void>) & functools_kit.ISingleshotClearable;
}

/**
 * Utility class for live trading operations.
 *
 * Provides simplified access to liveCommandService.run() with logging.
 * Exported as singleton instance for convenient usage.
 *
 * Features:
 * - Infinite async generator (never completes)
 * - Crash recovery via persisted state
 * - Real-time progression with Date.now()
 *
 * @example
 * ```typescript
 * import { Live } from "./classes/Live";
 *
 * // Infinite loop - use Ctrl+C to stop
 * for await (const result of Live.run("BTCUSDT", {
 *   strategyName: "my-strategy",
 *   exchangeName: "my-exchange",
 *   frameName: ""
 * })) {
 *   if (result.action === "opened") {
 *     console.log("Signal opened:", result.signal);
 *   } else if (result.action === "closed") {
 *     console.log("PNL:", result.pnl.pnlPercentage);
 *   }
 * }
 * ```
 */
declare class LiveUtils {
    /**
     * Memoized function to get or create LiveInstance for a symbol-strategy pair.
     * Each symbol-strategy combination gets its own isolated instance.
     */
    private _getInstance;
    /**
     * Runs live trading for a symbol with context propagation.
     *
     * Infinite async generator with crash recovery support.
     * Process can crash and restart - state will be recovered from disk.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param context - Execution context with strategy and exchange names
     * @returns Infinite async generator yielding opened and closed signals
     */
    run: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
    }) => AsyncGenerator<IStrategyTickResultOpened | IStrategyTickResultClosed, void, unknown>;
    /**
     * Runs live trading in background without yielding results.
     *
     * Consumes all live trading results internally without exposing them.
     * Infinite loop - will run until process is stopped or crashes.
     * Useful for running live trading for side effects only (callbacks, persistence).
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param context - Execution context with strategy and exchange names
     * @returns Cancellation closure
     *
     * @example
     * ```typescript
     * // Run live trading silently in background, only callbacks will fire
     * // This will run forever until Ctrl+C
     * await Live.background("BTCUSDT", {
     *   strategyName: "my-strategy",
     *   exchangeName: "my-exchange"
     * });
     * ```
     */
    background: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
    }) => () => void;
    /**
     * Retrieves the currently active pending signal for the strategy.
     * If no active signal exists, returns null.
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Name of strategy to get pending signal for
     * @returns Promise resolving to pending signal or null
     *
     * @example
     * ```typescript
     * const pending = await Live.getPendingSignal("BTCUSDT", "my-strategy");
     * if (pending) {
     *   console.log("Active signal:", pending.id);
     * }
     * ```
     */
    getPendingSignal: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
    }) => Promise<ISignalRow>;
    /**
     * Retrieves the currently active scheduled signal for the strategy.
     * If no scheduled signal exists, returns null.
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Name of strategy to get scheduled signal for
     * @returns Promise resolving to scheduled signal or null
     *
     * @example
     * ```typescript
     * const scheduled = await Live.getScheduledSignal("BTCUSDT", "my-strategy");
     * if (scheduled) {
     *   console.log("Scheduled signal:", scheduled.id);
     * }
     * ```
     */
    getScheduledSignal: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
    }) => Promise<IScheduledSignalRow>;
    /**
     * Stops the strategy from generating new signals.
     *
     * Sets internal flag to prevent strategy from opening new signals.
     * Current active signal (if any) will complete normally.
     * Live trading will stop at the next safe point (idle/closed state).
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Strategy name to stop
     * @returns Promise that resolves when stop flag is set
     *
     * @example
     * ```typescript
     * // Stop live trading gracefully
     * await Live.stop("BTCUSDT", "my-strategy");
     * ```
     */
    stop: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
    }) => Promise<void>;
    /**
     * Cancels the scheduled signal without stopping the strategy.
     *
     * Clears the scheduled signal (waiting for priceOpen activation).
     * Does NOT affect active pending signals or strategy operation.
     * Does NOT set stop flag - strategy can continue generating new signals.
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Strategy name
     * @param context - Execution context with exchangeName and frameName
     * @param cancelId - Optional cancellation ID for tracking user-initiated cancellations
     * @returns Promise that resolves when scheduled signal is cancelled
     *
     * @example
     * ```typescript
     * // Cancel scheduled signal in live trading with custom ID
     * await Live.cancel("BTCUSDT", "my-strategy", {
     *   exchangeName: "binance",
     *   frameName: "",
     *   strategyName: "my-strategy"
     * }, "manual-cancel-001");
     * ```
     */
    cancel: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
    }, cancelId?: string) => Promise<void>;
    /**
     * Executes partial close at profit level (moving toward TP).
     *
     * Closes a percentage of the active pending position at profit.
     * Price must be moving toward take profit (in profit direction).
     *
     * @param symbol - Trading pair symbol
     * @param percentToClose - Percentage of position to close (0-100, absolute value)
     * @param currentPrice - Current market price for this partial close
     * @param context - Execution context with strategyName and exchangeName
     * @returns Promise that resolves when state is updated
     *
     * @throws Error if currentPrice is not in profit direction:
     *   - LONG: currentPrice must be > priceOpen
     *   - SHORT: currentPrice must be < priceOpen
     *
     * @example
     * ```typescript
     * // Close 30% of LONG position at profit
     * await Live.partialProfit("BTCUSDT", 30, 45000, {
     *   exchangeName: "binance",
     *   strategyName: "my-strategy"
     * });
     * ```
     */
    partialProfit: (symbol: string, percentToClose: number, currentPrice: number, context: {
        strategyName: string;
        exchangeName: string;
    }) => Promise<void>;
    /**
     * Executes partial close at loss level (moving toward SL).
     *
     * Closes a percentage of the active pending position at loss.
     * Price must be moving toward stop loss (in loss direction).
     *
     * @param symbol - Trading pair symbol
     * @param percentToClose - Percentage of position to close (0-100, absolute value)
     * @param currentPrice - Current market price for this partial close
     * @param context - Execution context with strategyName and exchangeName
     * @returns Promise that resolves when state is updated
     *
     * @throws Error if currentPrice is not in loss direction:
     *   - LONG: currentPrice must be < priceOpen
     *   - SHORT: currentPrice must be > priceOpen
     *
     * @example
     * ```typescript
     * // Close 40% of LONG position at loss
     * await Live.partialLoss("BTCUSDT", 40, 38000, {
     *   exchangeName: "binance",
     *   strategyName: "my-strategy"
     * });
     * ```
     */
    partialLoss: (symbol: string, percentToClose: number, currentPrice: number, context: {
        strategyName: string;
        exchangeName: string;
    }) => Promise<void>;
    /**
     * Gets statistical data from all live trading events for a symbol-strategy pair.
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Strategy name to get data for
     * @param context - Execution context with exchangeName and frameName
     * @returns Promise resolving to statistical data object
     *
     * @example
     * ```typescript
     * const stats = await Live.getData("BTCUSDT", "my-strategy", {
     *   exchangeName: "binance",
     *   frameName: "",
     *   strategyName: "my-strategy"
     * });
     * console.log(stats.sharpeRatio, stats.winRate);
     * ```
     */
    getData: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
    }) => Promise<LiveStatisticsModel>;
    /**
     * Generates markdown report with all events for a symbol-strategy pair.
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Strategy name to generate report for
     * @param context - Execution context with exchangeName and frameName
     * @param columns - Optional columns configuration for the report
     * @returns Promise resolving to markdown formatted report string
     *
     * @example
     * ```typescript
     * const markdown = await Live.getReport("BTCUSDT", "my-strategy", {
     *   exchangeName: "binance",
     *   frameName: "",
     *   strategyName: "my-strategy"
     * });
     * console.log(markdown);
     * ```
     */
    getReport: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
    }, columns?: Columns$5[]) => Promise<string>;
    /**
     * Saves strategy report to disk.
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Strategy name to save report for
     * @param context - Execution context with exchangeName and frameName
     * @param path - Optional directory path to save report (default: "./dump/live")
     * @param columns - Optional columns configuration for the report
     *
     * @example
     * ```typescript
     * // Save to default path: ./dump/live/my-strategy.md
     * await Live.dump("BTCUSDT", "my-strategy", {
     *   exchangeName: "binance",
     *   frameName: "",
     *   strategyName: "my-strategy"
     * });
     *
     * // Save to custom path: ./custom/path/my-strategy.md
     * await Live.dump("BTCUSDT", "my-strategy", {
     *   exchangeName: "binance",
     *   frameName: "",
     *   strategyName: "my-strategy"
     * }, "./custom/path");
     * ```
     */
    dump: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
    }, path?: string, columns?: Columns$5[]) => Promise<void>;
    /**
     * Lists all active live trading instances with their current status.
     *
     * @returns Promise resolving to array of status objects for all instances
     *
     * @example
     * ```typescript
     * const statusList = await Live.list();
     * statusList.forEach(status => {
     *   console.log(`${status.symbol} - ${status.strategyName}: ${status.status}`);
     * });
     * ```
     */
    list: () => Promise<{
        id: string;
        symbol: string;
        strategyName: string;
        exchangeName: string;
        status: "pending" | "fulfilled" | "rejected" | "ready";
    }[]>;
}
/**
 * Singleton instance of LiveUtils for convenient live trading operations.
 *
 * @example
 * ```typescript
 * import { Live } from "./classes/Live";
 *
 * for await (const result of Live.run("BTCUSDT", {
 *   strategyName: "my-strategy",
 *   exchangeName: "my-exchange",
 * })) {
 *   console.log("Result:", result.action);
 * }
 * ```
 */
declare const Live: LiveUtils;

/**
 * Type alias for column configuration used in scheduled events markdown reports.
 *
 * Represents a column model specifically designed to format and display
 * scheduled and cancelled signal events in markdown tables.
 *
 * @typeParam ScheduledEvent - The scheduled event data type containing
 *   signal scheduling information, cancellation details, and timing
 *
 * @example
 * ```typescript
 * // Column to display event type
 * const typeColumn: Columns = {
 *   key: "type",
 *   label: "Type",
 *   format: (event) => event.type,
 *   isVisible: () => true
 * };
 *
 * // Column to display scheduled time
 * const timeColumn: Columns = {
 *   key: "time",
 *   label: "Scheduled Time",
 *   format: (event) => new Date(event.timestamp).toISOString(),
 *   isVisible: () => true
 * };
 * ```
 *
 * @see ColumnModel for the base interface
 * @see ScheduledEvent for the event data structure
 */
type Columns$4 = ColumnModel<ScheduledEvent>;
/**
 * Service for generating and saving scheduled signals markdown reports.
 *
 * Features:
 * - Listens to scheduled and cancelled signal events via signalLiveEmitter
 * - Accumulates all events (scheduled, cancelled) per strategy
 * - Generates markdown tables with detailed event information
 * - Provides statistics (cancellation rate, average wait time)
 * - Saves reports to disk in logs/schedule/{strategyName}.md
 *
 * @example
 * ```typescript
 * const service = new ScheduleMarkdownService();
 *
 * // Service automatically subscribes to signalLiveEmitter on init
 * // No manual callback setup needed
 *
 * // Later: generate and save report
 * await service.dump("my-strategy");
 * ```
 */
declare class ScheduleMarkdownService {
    /** Logger service for debug output */
    private readonly loggerService;
    /**
     * Memoized function to get or create ReportStorage for a symbol-strategy-exchange-frame-backtest combination.
     * Each combination gets its own isolated storage instance.
     */
    private getStorage;
    /**
     * Processes tick events and accumulates scheduled/opened/cancelled events.
     * Should be called from signalEmitter subscription.
     *
     * Processes only scheduled, opened and cancelled event types.
     *
     * @param data - Tick result from strategy execution with frameName wrapper
     *
     * @example
     * ```typescript
     * const service = new ScheduleMarkdownService();
     * // Service automatically subscribes in init()
     * ```
     */
    private tick;
    /**
     * Gets statistical data from all scheduled signal events for a symbol-strategy pair.
     * Delegates to ReportStorage.getData().
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Strategy name to get data for
     * @param exchangeName - Exchange name
     * @param frameName - Frame name
     * @param backtest - True if backtest mode, false if live mode
     * @returns Statistical data object with all metrics
     *
     * @example
     * ```typescript
     * const service = new ScheduleMarkdownService();
     * const stats = await service.getData("BTCUSDT", "my-strategy", "binance", "1h", false);
     * console.log(stats.cancellationRate, stats.avgWaitTime);
     * ```
     */
    getData: (symbol: string, strategyName: StrategyName, exchangeName: string, frameName: string, backtest: boolean) => Promise<ScheduleStatisticsModel>;
    /**
     * Generates markdown report with all scheduled events for a symbol-strategy pair.
     * Delegates to ReportStorage.getReport().
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Strategy name to generate report for
     * @param exchangeName - Exchange name
     * @param frameName - Frame name
     * @param backtest - True if backtest mode, false if live mode
     * @param columns - Column configuration for formatting the table
     * @returns Markdown formatted report string with table of all events
     *
     * @example
     * ```typescript
     * const service = new ScheduleMarkdownService();
     * const markdown = await service.getReport("BTCUSDT", "my-strategy", "binance", "1h", false);
     * console.log(markdown);
     * ```
     */
    getReport: (symbol: string, strategyName: StrategyName, exchangeName: string, frameName: string, backtest: boolean, columns?: Columns$4[]) => Promise<string>;
    /**
     * Saves symbol-strategy report to disk.
     * Creates directory if it doesn't exist.
     * Delegates to ReportStorage.dump().
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Strategy name to save report for
     * @param exchangeName - Exchange name
     * @param frameName - Frame name
     * @param backtest - True if backtest mode, false if live mode
     * @param path - Directory path to save report (default: "./dump/schedule")
     * @param columns - Column configuration for formatting the table
     *
     * @example
     * ```typescript
     * const service = new ScheduleMarkdownService();
     *
     * // Save to default path: ./dump/schedule/my-strategy.md
     * await service.dump("BTCUSDT", "my-strategy", "binance", "1h", false);
     *
     * // Save to custom path: ./custom/path/my-strategy.md
     * await service.dump("BTCUSDT", "my-strategy", "binance", "1h", false, "./custom/path");
     * ```
     */
    dump: (symbol: string, strategyName: StrategyName, exchangeName: string, frameName: string, backtest: boolean, path?: string, columns?: Columns$4[]) => Promise<void>;
    /**
     * Clears accumulated event data from storage.
     * If payload is provided, clears only that specific symbol-strategy-exchange-frame-backtest combination's data.
     * If nothing is provided, clears all data.
     *
     * @param payload - Optional payload with symbol, strategyName, exchangeName, frameName, backtest
     *
     * @example
     * ```typescript
     * const service = new ScheduleMarkdownService();
     *
     * // Clear specific combination
     * await service.clear({ symbol: "BTCUSDT", strategyName: "my-strategy", exchangeName: "binance", frameName: "1h", backtest: false });
     *
     * // Clear all data
     * await service.clear();
     * ```
     */
    clear: (payload?: {
        symbol: string;
        strategyName: StrategyName;
        exchangeName: string;
        frameName: string;
        backtest: boolean;
    }) => Promise<void>;
    /**
     * Initializes the service by subscribing to live signal events.
     * Uses singleshot to ensure initialization happens only once.
     * Automatically called on first use.
     *
     * @example
     * ```typescript
     * const service = new ScheduleMarkdownService();
     * await service.init(); // Subscribe to live events
     * ```
     */
    protected init: (() => Promise<void>) & functools_kit.ISingleshotClearable;
}

/**
 * Utility class for scheduled signals reporting operations.
 *
 * Provides simplified access to scheduleMarkdownService with logging.
 * Exported as singleton instance for convenient usage.
 *
 * Features:
 * - Track scheduled signals in queue
 * - Track cancelled signals
 * - Calculate cancellation rate and average wait time
 * - Generate markdown reports
 *
 * @example
 * ```typescript
 * import { Schedule } from "./classes/Schedule";
 *
 * // Get scheduled signals statistics
 * const stats = await Schedule.getData("my-strategy");
 * console.log(`Cancellation rate: ${stats.cancellationRate}%`);
 * console.log(`Average wait time: ${stats.avgWaitTime} minutes`);
 *
 * // Generate and save report
 * await Schedule.dump("BTCUSDT", "my-strategy");
 * ```
 */
declare class ScheduleUtils {
    /**
     * Gets statistical data from all scheduled signal events for a symbol-strategy pair.
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Strategy name to get data for
     * @returns Promise resolving to statistical data object
     *
     * @example
     * ```typescript
     * const stats = await Schedule.getData("BTCUSDT", "my-strategy");
     * console.log(stats.cancellationRate, stats.avgWaitTime);
     * ```
     */
    getData: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
        frameName: string;
    }, backtest?: boolean) => Promise<ScheduleStatisticsModel>;
    /**
     * Generates markdown report with all scheduled events for a symbol-strategy pair.
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Strategy name to generate report for
     * @param columns - Optional columns configuration for the report
     * @returns Promise resolving to markdown formatted report string
     *
     * @example
     * ```typescript
     * const markdown = await Schedule.getReport("BTCUSDT", "my-strategy");
     * console.log(markdown);
     * ```
     */
    getReport: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
        frameName: string;
    }, backtest?: boolean, columns?: Columns$4[]) => Promise<string>;
    /**
     * Saves strategy report to disk.
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Strategy name to save report for
     * @param path - Optional directory path to save report (default: "./dump/schedule")
     * @param columns - Optional columns configuration for the report
     *
     * @example
     * ```typescript
     * // Save to default path: ./dump/schedule/my-strategy.md
     * await Schedule.dump("BTCUSDT", "my-strategy");
     *
     * // Save to custom path: ./custom/path/my-strategy.md
     * await Schedule.dump("BTCUSDT", "my-strategy", "./custom/path");
     * ```
     */
    dump: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
        frameName: string;
    }, backtest?: boolean, path?: string, columns?: Columns$4[]) => Promise<void>;
}
/**
 * Singleton instance of ScheduleUtils for convenient scheduled signals reporting.
 *
 * @example
 * ```typescript
 * import { Schedule } from "./classes/Schedule";
 *
 * const stats = await Schedule.getData("my-strategy");
 * console.log("Cancellation rate:", stats.cancellationRate);
 * ```
 */
declare const Schedule: ScheduleUtils;

/**
 * Type alias for column configuration used in performance metrics markdown reports.
 *
 * Represents a column model specifically designed to format and display
 * performance statistics for various trading metrics in markdown tables.
 *
 * @typeParam MetricStats - The performance metric statistics data type containing
 *   aggregated statistics for a specific performance metric
 *
 * @example
 * ```typescript
 * // Column to display metric name
 * const metricColumn: Columns = {
 *   key: "metric",
 *   label: "Metric",
 *   format: (stat) => stat.metric,
 *   isVisible: () => true
 * };
 *
 * // Column to display average value
 * const avgColumn: Columns = {
 *   key: "average",
 *   label: "Average",
 *   format: (stat) => stat.average.toFixed(2),
 *   isVisible: () => true
 * };
 * ```
 *
 * @see ColumnModel for the base interface
 * @see MetricStats for the metric data structure
 */
type Columns$3 = ColumnModel<MetricStats>;
/**
 * Service for collecting and analyzing performance metrics.
 *
 * Features:
 * - Listens to performance events via performanceEmitter
 * - Accumulates metrics per strategy
 * - Calculates aggregated statistics (avg, min, max, percentiles)
 * - Generates markdown reports with bottleneck analysis
 * - Saves reports to disk in logs/performance/{strategyName}.md
 *
 * @example
 * ```typescript
 * import { listenPerformance } from "backtest-kit";
 *
 * // Subscribe to performance events
 * listenPerformance((event) => {
 *   console.log(`${event.metricType}: ${event.duration.toFixed(2)}ms`);
 * });
 *
 * // After execution, generate report
 * const stats = await Performance.getData("my-strategy");
 * console.log("Bottlenecks:", stats.metricStats);
 *
 * // Save report to disk
 * await Performance.dump("BTCUSDT", "my-strategy");
 * ```
 */
declare class PerformanceMarkdownService {
    /** Logger service for debug output */
    private readonly loggerService;
    /**
     * Memoized function to get or create PerformanceStorage for a symbol-strategy-exchange-frame-backtest combination.
     * Each combination gets its own isolated storage instance.
     */
    private getStorage;
    /**
     * Processes performance events and accumulates metrics.
     * Should be called from performance tracking code.
     *
     * @param event - Performance event with timing data
     */
    private track;
    /**
     * Gets aggregated performance statistics for a symbol-strategy pair.
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Strategy name to get data for
     * @param exchangeName - Exchange name
     * @param frameName - Frame name
     * @param backtest - True if backtest mode, false if live mode
     * @returns Performance statistics with aggregated metrics
     *
     * @example
     * ```typescript
     * const stats = await performanceService.getData("BTCUSDT", "my-strategy", "binance", "1h", false);
     * console.log("Total time:", stats.totalDuration);
     * console.log("Slowest operation:", Object.values(stats.metricStats)
     *   .sort((a, b) => b.avgDuration - a.avgDuration)[0]);
     * ```
     */
    getData: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean) => Promise<PerformanceStatisticsModel>;
    /**
     * Generates markdown report with performance analysis.
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Strategy name to generate report for
     * @param exchangeName - Exchange name
     * @param frameName - Frame name
     * @param backtest - True if backtest mode, false if live mode
     * @param columns - Column configuration for formatting the table
     * @returns Markdown formatted report string
     *
     * @example
     * ```typescript
     * const markdown = await performanceService.getReport("BTCUSDT", "my-strategy", "binance", "1h", false);
     * console.log(markdown);
     * ```
     */
    getReport: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean, columns?: Columns$3[]) => Promise<string>;
    /**
     * Saves performance report to disk.
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Strategy name to save report for
     * @param exchangeName - Exchange name
     * @param frameName - Frame name
     * @param backtest - True if backtest mode, false if live mode
     * @param path - Directory path to save report
     * @param columns - Column configuration for formatting the table
     *
     * @example
     * ```typescript
     * // Save to default path: ./dump/performance/my-strategy.md
     * await performanceService.dump("BTCUSDT", "my-strategy", "binance", "1h", false);
     *
     * // Save to custom path
     * await performanceService.dump("BTCUSDT", "my-strategy", "binance", "1h", false, "./custom/path");
     * ```
     */
    dump: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean, path?: string, columns?: Columns$3[]) => Promise<void>;
    /**
     * Clears accumulated performance data from storage.
     *
     * @param payload - Optional payload with symbol, strategyName, exchangeName, frameName, backtest
     */
    clear: (payload?: {
        symbol: string;
        strategyName: string;
        exchangeName: string;
        frameName: string;
        backtest: boolean;
    }) => Promise<void>;
    /**
     * Initializes the service by subscribing to performance events.
     * Uses singleshot to ensure initialization happens only once.
     */
    protected init: (() => Promise<void>) & functools_kit.ISingleshotClearable;
}

/**
 * Performance class provides static methods for performance metrics analysis.
 *
 * Features:
 * - Get aggregated performance statistics by strategy
 * - Generate markdown reports with bottleneck analysis
 * - Save reports to disk
 * - Clear accumulated metrics
 *
 * @example
 * ```typescript
 * import { Performance, listenPerformance } from "backtest-kit";
 *
 * // Subscribe to performance events
 * listenPerformance((event) => {
 *   console.log(`${event.metricType}: ${event.duration.toFixed(2)}ms`);
 * });
 *
 * // Run bt...
 *
 * // Get aggregated statistics
 * const stats = await Performance.getData("my-strategy");
 * console.log("Total time:", stats.totalDuration);
 * console.log("Slowest operations:", Object.values(stats.metricStats)
 *   .sort((a, b) => b.avgDuration - a.avgDuration)
 *   .slice(0, 5));
 *
 * // Generate and save report
 * await Performance.dump("BTCUSDT", "my-strategy");
 * ```
 */
declare class Performance {
    /**
     * Gets aggregated performance statistics for a symbol-strategy pair.
     *
     * Returns detailed metrics grouped by operation type:
     * - Count, total duration, average, min, max
     * - Standard deviation for volatility
     * - Percentiles (median, P95, P99) for outlier detection
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Strategy name to analyze
     * @returns Performance statistics with aggregated metrics
     *
     * @example
     * ```typescript
     * const stats = await Performance.getData("BTCUSDT", "my-strategy");
     *
     * // Find slowest operation type
     * const slowest = Object.values(stats.metricStats)
     *   .sort((a, b) => b.avgDuration - a.avgDuration)[0];
     * console.log(`Slowest: ${slowest.metricType} (${slowest.avgDuration.toFixed(2)}ms avg)`);
     *
     * // Check for outliers
     * for (const metric of Object.values(stats.metricStats)) {
     *   if (metric.p99 > metric.avgDuration * 5) {
     *     console.warn(`High variance in ${metric.metricType}: P99=${metric.p99}ms, Avg=${metric.avgDuration}ms`);
     *   }
     * }
     * ```
     */
    static getData(symbol: string, context: {
        strategyName: string;
        exchangeName: string;
        frameName: string;
    }, backtest?: boolean): Promise<PerformanceStatisticsModel>;
    /**
     * Generates markdown report with performance analysis.
     *
     * Report includes:
     * - Time distribution across operation types
     * - Detailed metrics table with statistics
     * - Percentile analysis for bottleneck detection
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Strategy name to generate report for
     * @param columns - Optional columns configuration for the report
     * @returns Markdown formatted report string
     *
     * @example
     * ```typescript
     * const markdown = await Performance.getReport("BTCUSDT", "my-strategy");
     * console.log(markdown);
     *
     * // Or save to file
     * import fs from "fs/promises";
     * await fs.writeFile("performance-report.md", markdown);
     * ```
     */
    static getReport(symbol: string, context: {
        strategyName: string;
        exchangeName: string;
        frameName: string;
    }, backtest?: boolean, columns?: Columns$3[]): Promise<string>;
    /**
     * Saves performance report to disk.
     *
     * Creates directory if it doesn't exist.
     * Default path: ./dump/performance/{strategyName}.md
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Strategy name to save report for
     * @param path - Optional custom directory path
     * @param columns - Optional columns configuration for the report
     *
     * @example
     * ```typescript
     * // Save to default path: ./dump/performance/my-strategy.md
     * await Performance.dump("BTCUSDT", "my-strategy");
     *
     * // Save to custom path: ./reports/perf/my-strategy.md
     * await Performance.dump("BTCUSDT", "my-strategy", "./reports/perf");
     * ```
     */
    static dump(symbol: string, context: {
        strategyName: string;
        exchangeName: string;
        frameName: string;
    }, backtest?: boolean, path?: string, columns?: Columns$3[]): Promise<void>;
}

/**
 * Type alias for column configuration used in walker strategy markdown reports.
 *
 * Represents a column model specifically designed to format and display
 * walker backtest strategy results in markdown tables.
 *
 * @typeParam IStrategyResult - The walker strategy result data type containing
 *   strategy name, performance metrics, and aggregated trade statistics
 *
 * @example
 * ```typescript
 * // Column to display strategy name
 * const strategyColumn: StrategyColumn = {
 *   key: "strategyName",
 *   label: "Strategy",
 *   format: (result) => result.strategyName,
 *   isVisible: () => true
 * };
 *
 * // Column to display total trades
 * const tradesColumn: StrategyColumn = {
 *   key: "totalTrades",
 *   label: "Total Trades",
 *   format: (result) => result.totalTrades.toString(),
 *   isVisible: () => true
 * };
 * ```
 *
 * @see ColumnModel for the base interface
 * @see IStrategyResult for the strategy result data structure
 */
type StrategyColumn = ColumnModel<IStrategyResult>;
/**
 * Type alias for column configuration used in walker PNL markdown reports.
 *
 * Represents a column model specifically designed to format and display
 * walker backtest signal PNL data in markdown tables.
 *
 * @typeParam SignalData - The signal PNL data type containing
 *   signal information and PNL details from individual trades
 *
 * @example
 * ```typescript
 * // Column to display signal ID
 * const signalIdColumn: PnlColumn = {
 *   key: "signalId",
 *   label: "Signal ID",
 *   format: (signal) => signal.signalId,
 *   isVisible: () => true
 * };
 *
 * // Column to display PNL percentage
 * const pnlColumn: PnlColumn = {
 *   key: "pnl",
 *   label: "PNL %",
 *   format: (signal) => signal.pnl.toFixed(2) + '%',
 *   isVisible: () => true
 * };
 * ```
 *
 * @see ColumnModel for the base interface
 * @see SignalData for the signal data structure
 */
type PnlColumn = ColumnModel<SignalData$1>;
/**
 * Service for generating and saving walker markdown reports.
 *
 * Features:
 * - Listens to walker events via tick callback
 * - Accumulates strategy results per walker using memoized storage
 * - Generates markdown tables with detailed strategy comparison
 * - Saves reports to disk in logs/walker/{walkerName}.md
 *
 * @example
 * ```typescript
 * const service = new WalkerMarkdownService();
 * const results = await service.getData("my-walker");
 * await service.dump("my-walker");
 * ```
 */
declare class WalkerMarkdownService {
    /** Logger service for debug output */
    private readonly loggerService;
    /**
     * Memoized function to get or create ReportStorage for a walker.
     * Each walker gets its own isolated storage instance.
     */
    private getStorage;
    /**
     * Processes walker progress events and accumulates strategy results.
     * Should be called from walkerEmitter.
     *
     * @param data - Walker contract from walker execution
     *
     * @example
     * ```typescript
     * const service = new WalkerMarkdownService();
     * walkerEmitter.subscribe((data) => service.tick(data));
     * ```
     */
    private tick;
    /**
     * Gets walker results data from all strategy results.
     * Delegates to ReportStorage.getData().
     *
     * @param walkerName - Walker name to get data for
     * @param symbol - Trading symbol
     * @param metric - Metric being optimized
     * @param context - Context with exchangeName and frameName
     * @returns Walker results data object with all metrics
     *
     * @example
     * ```typescript
     * const service = new WalkerMarkdownService();
     * const results = await service.getData("my-walker", "BTCUSDT", "sharpeRatio", { exchangeName: "binance", frameName: "1d" });
     * console.log(results.bestStrategy, results.bestMetric);
     * ```
     */
    getData: (walkerName: WalkerName, symbol: string, metric: WalkerMetric, context: {
        exchangeName: string;
        frameName: string;
    }) => Promise<WalkerCompleteContract>;
    /**
     * Generates markdown report with all strategy results for a walker.
     * Delegates to ReportStorage.getReport().
     *
     * @param walkerName - Walker name to generate report for
     * @param symbol - Trading symbol
     * @param metric - Metric being optimized
     * @param context - Context with exchangeName and frameName
     * @param strategyColumns - Column configuration for strategy comparison table
     * @param pnlColumns - Column configuration for PNL table
     * @returns Markdown formatted report string
     *
     * @example
     * ```typescript
     * const service = new WalkerMarkdownService();
     * const markdown = await service.getReport("my-walker", "BTCUSDT", "sharpeRatio", { exchangeName: "binance", frameName: "1d" });
     * console.log(markdown);
     * ```
     */
    getReport: (walkerName: WalkerName, symbol: string, metric: WalkerMetric, context: {
        exchangeName: string;
        frameName: string;
    }, strategyColumns?: StrategyColumn[], pnlColumns?: PnlColumn[]) => Promise<string>;
    /**
     * Saves walker report to disk.
     * Creates directory if it doesn't exist.
     * Delegates to ReportStorage.dump().
     *
     * @param walkerName - Walker name to save report for
     * @param symbol - Trading symbol
     * @param metric - Metric being optimized
     * @param context - Context with exchangeName and frameName
     * @param path - Directory path to save report (default: "./dump/walker")
     * @param strategyColumns - Column configuration for strategy comparison table
     * @param pnlColumns - Column configuration for PNL table
     *
     * @example
     * ```typescript
     * const service = new WalkerMarkdownService();
     *
     * // Save to default path: ./dump/walker/my-walker.md
     * await service.dump("my-walker", "BTCUSDT", "sharpeRatio", { exchangeName: "binance", frameName: "1d" });
     *
     * // Save to custom path: ./custom/path/my-walker.md
     * await service.dump("my-walker", "BTCUSDT", "sharpeRatio", { exchangeName: "binance", frameName: "1d" }, "./custom/path");
     * ```
     */
    dump: (walkerName: WalkerName, symbol: string, metric: WalkerMetric, context: {
        exchangeName: string;
        frameName: string;
    }, path?: string, strategyColumns?: StrategyColumn[], pnlColumns?: PnlColumn[]) => Promise<void>;
    /**
     * Clears accumulated result data from storage.
     * If walkerName is provided, clears only that walker's data.
     * If walkerName is omitted, clears all walkers' data.
     *
     * @param walkerName - Optional walker name to clear specific walker data
     *
     * @example
     * ```typescript
     * const service = new WalkerMarkdownService();
     *
     * // Clear specific walker data
     * await service.clear("my-walker");
     *
     * // Clear all walkers' data
     * await service.clear();
     * ```
     */
    clear: (walkerName?: WalkerName) => Promise<void>;
    /**
     * Initializes the service by subscribing to walker events.
     * Uses singleshot to ensure initialization happens only once.
     * Automatically called on first use.
     *
     * @example
     * ```typescript
     * const service = new WalkerMarkdownService();
     * await service.init(); // Subscribe to walker events
     * ```
     */
    protected init: (() => Promise<void>) & functools_kit.ISingleshotClearable;
}

/**
 * Utility class for walker operations.
 *
 * Provides simplified access to walkerCommandService.run() with logging.
 * Automatically pulls exchangeName and frameName from walker schema.
 * Exported as singleton instance for convenient usage.
 *
 * @example
 * ```typescript
 * import { Walker } from "./classes/Walker";
 *
 * for await (const result of Walker.run("BTCUSDT", {
 *   walkerName: "my-walker"
 * })) {
 *   console.log("Progress:", result.strategiesTested, "/", result.totalStrategies);
 *   console.log("Best strategy:", result.bestStrategy, result.bestMetric);
 * }
 * ```
 */
declare class WalkerUtils {
    /**
     * Memoized function to get or create WalkerInstance for a symbol-walker pair.
     * Each symbol-walker combination gets its own isolated instance.
     */
    private _getInstance;
    /**
     * Runs walker comparison for a symbol with context propagation.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param context - Execution context with walker name
     * @returns Async generator yielding progress updates after each strategy
     */
    run: (symbol: string, context: {
        walkerName: string;
    }) => AsyncGenerator<WalkerContract, any, any>;
    /**
     * Runs walker comparison in background without yielding results.
     *
     * Consumes all walker progress updates internally without exposing them.
     * Useful for running walker comparison for side effects only (callbacks, logging).
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param context - Execution context with walker name
     * @returns Cancellation closure
     *
     * @example
     * ```typescript
     * // Run walker silently, only callbacks will fire
     * await Walker.background("BTCUSDT", {
     *   walkerName: "my-walker"
     * });
     * console.log("Walker comparison completed");
     * ```
     */
    background: (symbol: string, context: {
        walkerName: string;
    }) => () => void;
    /**
     * Stops all strategies in the walker from generating new signals.
     *
     * Iterates through all strategies defined in walker schema and:
     * 1. Sends stop signal via walkerStopSubject (interrupts current running strategy)
     * 2. Sets internal stop flag for each strategy (prevents new signals)
     *
     * Current active signals (if any) will complete normally.
     * Walker will stop at the next safe point.
     *
     * Supports multiple walkers running on the same symbol simultaneously.
     * Stop signal is filtered by walkerName to prevent interference.
     *
     * @param symbol - Trading pair symbol
     * @param context - Execution context with walker name
     * @returns Promise that resolves when all stop flags are set
     *
     * @example
     * ```typescript
     * // Stop walker and all its strategies
     * await Walker.stop("BTCUSDT", { walkerName: "my-walker" });
     * ```
     */
    stop: (symbol: string, context: {
        walkerName: string;
    }) => Promise<void>;
    /**
     * Gets walker results data from all strategy comparisons.
     *
     * @param symbol - Trading symbol
     * @param context - Execution context with walker name
     * @returns Promise resolving to walker results data object
     *
     * @example
     * ```typescript
     * const results = await Walker.getData("BTCUSDT", { walkerName: "my-walker" });
     * console.log(results.bestStrategy, results.bestMetric);
     * ```
     */
    getData: (symbol: string, context: {
        walkerName: string;
    }) => Promise<WalkerCompleteContract>;
    /**
     * Generates markdown report with all strategy comparisons for a walker.
     *
     * @param symbol - Trading symbol
     * @param context - Execution context with walker name
     * @param strategyColumns - Optional strategy columns configuration
     * @param pnlColumns - Optional PNL columns configuration
     * @returns Promise resolving to markdown formatted report string
     *
     * @example
     * ```typescript
     * const markdown = await Walker.getReport("BTCUSDT", { walkerName: "my-walker" });
     * console.log(markdown);
     * ```
     */
    getReport: (symbol: string, context: {
        walkerName: string;
    }, strategyColumns?: StrategyColumn[], pnlColumns?: PnlColumn[]) => Promise<string>;
    /**
     * Saves walker report to disk.
     *
     * @param symbol - Trading symbol
     * @param context - Execution context with walker name
     * @param path - Optional directory path to save report (default: "./dump/walker")
     * @param strategyColumns - Optional strategy columns configuration
     * @param pnlColumns - Optional PNL columns configuration
     *
     * @example
     * ```typescript
     * // Save to default path: ./dump/walker/my-walker.md
     * await Walker.dump("BTCUSDT", { walkerName: "my-walker" });
     *
     * // Save to custom path: ./custom/path/my-walker.md
     * await Walker.dump("BTCUSDT", { walkerName: "my-walker" }, "./custom/path");
     * ```
     */
    dump: (symbol: string, context: {
        walkerName: string;
    }, path?: string, strategyColumns?: StrategyColumn[], pnlColumns?: PnlColumn[]) => Promise<void>;
    /**
     * Lists all active walker instances with their current status.
     *
     * @returns Promise resolving to array of status objects for all instances
     *
     * @example
     * ```typescript
     * const statusList = await Walker.list();
     * statusList.forEach(status => {
     *   console.log(`${status.symbol} - ${status.walkerName}: ${status.status}`);
     * });
     * ```
     */
    list: () => Promise<{
        id: string;
        symbol: string;
        walkerName: string;
        status: "pending" | "fulfilled" | "rejected" | "ready";
    }[]>;
}
/**
 * Singleton instance of WalkerUtils for convenient walker operations.
 *
 * @example
 * ```typescript
 * import { Walker } from "./classes/Walker";
 *
 * for await (const result of Walker.run("BTCUSDT", {
 *   walkerName: "my-walker"
 * })) {
 *   console.log("Progress:", result.strategiesTested, "/", result.totalStrategies);
 *   console.log("Best so far:", result.bestStrategy, result.bestMetric);
 * }
 * ```
 */
declare const Walker: WalkerUtils;

/**
 * Type alias for column configuration used in heatmap markdown reports.
 *
 * Represents a column model specifically designed to format and display
 * per-symbol portfolio statistics in markdown tables.
 *
 * @typeParam IHeatmapRow - The heatmap row data type containing aggregated
 *   statistics per symbol (PNL, Sharpe Ratio, Max Drawdown, trade counts)
 *
 * @example
 * ```typescript
 * // Column to display symbol name
 * const symbolColumn: Columns = {
 *   key: "symbol",
 *   label: "Symbol",
 *   format: (row) => row.symbol,
 *   isVisible: () => true
 * };
 *
 * // Column to display portfolio PNL
 * const pnlColumn: Columns = {
 *   key: "totalPnl",
 *   label: "Total PNL %",
 *   format: (row) => row.totalPnl !== null ? row.totalPnl.toFixed(2) + '%' : 'N/A',
 *   isVisible: () => true
 * };
 * ```
 *
 * @see ColumnModel for the base interface
 * @see IHeatmapRow for the row data structure
 */
type Columns$2 = ColumnModel<IHeatmapRow>;
/**
 * Portfolio Heatmap Markdown Service.
 *
 * Subscribes to signalEmitter and aggregates statistics across all symbols per strategy.
 * Provides portfolio-wide metrics and per-symbol breakdowns.
 *
 * Features:
 * - Real-time aggregation of closed signals
 * - Per-symbol statistics (Total PNL, Sharpe Ratio, Max Drawdown, Trades)
 * - Portfolio-wide aggregated metrics per strategy
 * - Markdown table report generation
 * - Safe math (handles NaN/Infinity gracefully)
 * - Strategy-based navigation using memoized storage
 *
 * @example
 * ```typescript
 * const service = new HeatMarkdownService();
 *
 * // Service automatically tracks all closed signals per strategy
 * const stats = await service.getData("my-strategy");
 * console.log(`Portfolio Total PNL: ${stats.portfolioTotalPnl}%`);
 *
 * // Generate and save report
 * await service.dump("my-strategy", "./reports");
 * ```
 */
declare class HeatMarkdownService {
    /** Logger service for debug output */
    private readonly loggerService;
    /**
     * Memoized function to get or create HeatmapStorage for exchange, frame and backtest mode.
     * Each exchangeName + frameName + backtest mode combination gets its own isolated heatmap storage instance.
     */
    private getStorage;
    /**
     * Processes tick events and accumulates closed signals.
     * Should be called from signal emitter subscription.
     *
     * Only processes closed signals - opened signals are ignored.
     *
     * @param data - Tick result from strategy execution (closed signals only)
     */
    private tick;
    /**
     * Gets aggregated portfolio heatmap statistics.
     *
     * @param exchangeName - Exchange name
     * @param frameName - Frame name
     * @param backtest - True if backtest mode, false if live mode
     * @returns Promise resolving to heatmap statistics with per-symbol and portfolio-wide metrics
     *
     * @example
     * ```typescript
     * const service = new HeatMarkdownService();
     * const stats = await service.getData("binance", "frame1", true);
     *
     * console.log(`Total symbols: ${stats.totalSymbols}`);
     * console.log(`Portfolio PNL: ${stats.portfolioTotalPnl}%`);
     *
     * stats.symbols.forEach(row => {
     *   console.log(`${row.symbol}: ${row.totalPnl}% (${row.totalTrades} trades)`);
     * });
     * ```
     */
    getData: (exchangeName: string, frameName: string, backtest: boolean) => Promise<HeatmapStatisticsModel>;
    /**
     * Generates markdown report with portfolio heatmap table.
     *
     * @param strategyName - Strategy name for report title
     * @param exchangeName - Exchange name
     * @param frameName - Frame name
     * @param backtest - True if backtest mode, false if live mode
     * @param columns - Column configuration for formatting the table
     * @returns Promise resolving to markdown formatted report string
     *
     * @example
     * ```typescript
     * const service = new HeatMarkdownService();
     * const markdown = await service.getReport("my-strategy", "binance", "frame1", true);
     * console.log(markdown);
     * // Output:
     * // # Portfolio Heatmap: my-strategy
     * //
     * // **Total Symbols:** 5 | **Portfolio PNL:** +45.3% | **Portfolio Sharpe:** 1.85 | **Total Trades:** 120
     * //
     * // | Symbol | Total PNL | Sharpe | Max DD | Trades |
     * // |--------|-----------|--------|--------|--------|
     * // | BTCUSDT | +15.5% | 2.10 | -2.5% | 45 |
     * // | ETHUSDT | +12.3% | 1.85 | -3.1% | 38 |
     * // ...
     * ```
     */
    getReport: (strategyName: StrategyName, exchangeName: string, frameName: string, backtest: boolean, columns?: Columns$2[]) => Promise<string>;
    /**
     * Saves heatmap report to disk.
     *
     * Creates directory if it doesn't exist.
     * Default filename: {strategyName}.md
     *
     * @param strategyName - Strategy name for report filename
     * @param exchangeName - Exchange name
     * @param frameName - Frame name
     * @param backtest - True if backtest mode, false if live mode
     * @param path - Optional directory path to save report (default: "./dump/heatmap")
     * @param columns - Column configuration for formatting the table
     *
     * @example
     * ```typescript
     * const service = new HeatMarkdownService();
     *
     * // Save to default path: ./dump/heatmap/my-strategy.md
     * await service.dump("my-strategy", "binance", "frame1", true);
     *
     * // Save to custom path: ./reports/my-strategy.md
     * await service.dump("my-strategy", "binance", "frame1", true, "./reports");
     * ```
     */
    dump: (strategyName: StrategyName, exchangeName: string, frameName: string, backtest: boolean, path?: string, columns?: Columns$2[]) => Promise<void>;
    /**
     * Clears accumulated heatmap data from storage.
     * If payload is provided, clears only that exchangeName+frameName+backtest combination's data.
     * If payload is omitted, clears all data.
     *
     * @param payload - Optional payload with exchangeName, frameName, backtest to clear specific data
     *
     * @example
     * ```typescript
     * const service = new HeatMarkdownService();
     *
     * // Clear specific exchange+frame+backtest data
     * await service.clear({ exchangeName: "binance", frameName: "frame1", backtest: true });
     *
     * // Clear all data
     * await service.clear();
     * ```
     */
    clear: (payload?: {
        exchangeName: string;
        frameName: string;
        backtest: boolean;
    }) => Promise<void>;
    /**
     * Initializes the service by subscribing to signal events.
     * Uses singleshot to ensure initialization happens only once.
     * Automatically called on first use.
     *
     * @example
     * ```typescript
     * const service = new HeatMarkdownService();
     * await service.init(); // Subscribe to signal events
     * ```
     */
    protected init: (() => Promise<void>) & functools_kit.ISingleshotClearable;
}

/**
 * Utility class for portfolio heatmap operations.
 *
 * Provides simplified access to heatMarkdownService with logging.
 * Automatically aggregates statistics across all symbols per strategy.
 * Exported as singleton instance for convenient usage.
 *
 * @example
 * ```typescript
 * import { Heat } from "backtest-kit";
 *
 * // Get raw heatmap data for a strategy
 * const stats = await Heat.getData({
 *   strategyName: "my-strategy",
 *   exchangeName: "binance",
 *   frameName: "frame1"
 * });
 * console.log(`Portfolio PNL: ${stats.portfolioTotalPnl}%`);
 *
 * // Generate markdown report
 * const markdown = await Heat.getReport({
 *   strategyName: "my-strategy",
 *   exchangeName: "binance",
 *   frameName: "frame1"
 * });
 * console.log(markdown);
 *
 * // Save to disk
 * await Heat.dump({
 *   strategyName: "my-strategy",
 *   exchangeName: "binance",
 *   frameName: "frame1"
 * }, false, "./reports");
 * ```
 */
declare class HeatUtils {
    /**
     * Gets aggregated portfolio heatmap statistics for a strategy.
     *
     * Returns per-symbol breakdown and portfolio-wide metrics.
     * Data is automatically collected from all closed signals for the strategy.
     *
     * @param context - Execution context with strategyName, exchangeName and frameName
     * @param backtest - True if backtest mode, false if live mode (default: false)
     * @returns Promise resolving to heatmap statistics object
     *
     * @example
     * ```typescript
     * const stats = await Heat.getData({
     *   strategyName: "my-strategy",
     *   exchangeName: "binance",
     *   frameName: "frame1"
     * });
     *
     * console.log(`Total symbols: ${stats.totalSymbols}`);
     * console.log(`Portfolio Total PNL: ${stats.portfolioTotalPnl}%`);
     * console.log(`Portfolio Sharpe Ratio: ${stats.portfolioSharpeRatio}`);
     *
     * // Iterate through per-symbol statistics
     * stats.symbols.forEach(row => {
     *   console.log(`${row.symbol}: ${row.totalPnl}% (${row.totalTrades} trades)`);
     * });
     * ```
     */
    getData: (context: {
        strategyName: string;
        exchangeName: string;
        frameName: string;
    }, backtest?: boolean) => Promise<HeatmapStatisticsModel>;
    /**
     * Generates markdown report with portfolio heatmap table for a strategy.
     *
     * Table includes: Symbol, Total PNL, Sharpe Ratio, Max Drawdown, Trades.
     * Symbols are sorted by Total PNL descending.
     *
     * @param context - Execution context with strategyName, exchangeName and frameName
     * @param backtest - True if backtest mode, false if live mode (default: false)
     * @param columns - Optional columns configuration for the report
     * @returns Promise resolving to markdown formatted report string
     *
     * @example
     * ```typescript
     * const markdown = await Heat.getReport({
     *   strategyName: "my-strategy",
     *   exchangeName: "binance",
     *   frameName: "frame1"
     * });
     * console.log(markdown);
     * // Output:
     * // # Portfolio Heatmap: my-strategy
     * //
     * // **Total Symbols:** 5 | **Portfolio PNL:** +45.3% | **Portfolio Sharpe:** 1.85 | **Total Trades:** 120
     * //
     * // | Symbol | Total PNL | Sharpe | Max DD | Trades |
     * // |--------|-----------|--------|--------|--------|
     * // | BTCUSDT | +15.5% | 2.10 | -2.5% | 45 |
     * // | ETHUSDT | +12.3% | 1.85 | -3.1% | 38 |
     * // ...
     * ```
     */
    getReport: (context: {
        strategyName: string;
        exchangeName: string;
        frameName: string;
    }, backtest?: boolean, columns?: Columns$2[]) => Promise<string>;
    /**
     * Saves heatmap report to disk for a strategy.
     *
     * Creates directory if it doesn't exist.
     * Default filename: {strategyName}.md
     *
     * @param context - Execution context with strategyName, exchangeName and frameName
     * @param backtest - True if backtest mode, false if live mode (default: false)
     * @param path - Optional directory path to save report (default: "./dump/heatmap")
     * @param columns - Optional columns configuration for the report
     *
     * @example
     * ```typescript
     * // Save to default path: ./dump/heatmap/my-strategy.md
     * await Heat.dump({
     *   strategyName: "my-strategy",
     *   exchangeName: "binance",
     *   frameName: "frame1"
     * });
     *
     * // Save to custom path: ./reports/my-strategy.md
     * await Heat.dump({
     *   strategyName: "my-strategy",
     *   exchangeName: "binance",
     *   frameName: "frame1"
     * }, false, "./reports");
     * ```
     */
    dump: (context: {
        strategyName: string;
        exchangeName: string;
        frameName: string;
    }, backtest?: boolean, path?: string, columns?: Columns$2[]) => Promise<void>;
}
/**
 * Singleton instance of HeatUtils for convenient heatmap operations.
 *
 * @example
 * ```typescript
 * import { Heat } from "backtest-kit";
 *
 * // Strategy-specific heatmap
 * const stats = await Heat.getData({
 *   strategyName: "my-strategy",
 *   exchangeName: "binance",
 *   frameName: "frame1"
 * });
 * console.log(`Portfolio PNL: ${stats.portfolioTotalPnl}%`);
 * console.log(`Total Symbols: ${stats.totalSymbols}`);
 *
 * // Per-symbol breakdown
 * stats.symbols.forEach(row => {
 *   console.log(`${row.symbol}:`);
 *   console.log(`  Total PNL: ${row.totalPnl}%`);
 *   console.log(`  Sharpe Ratio: ${row.sharpeRatio}`);
 *   console.log(`  Max Drawdown: ${row.maxDrawdown}%`);
 *   console.log(`  Trades: ${row.totalTrades}`);
 * });
 *
 * // Generate and save report
 * await Heat.dump({
 *   strategyName: "my-strategy",
 *   exchangeName: "binance",
 *   frameName: "frame1"
 * }, false, "./reports");
 * ```
 */
declare const Heat: HeatUtils;

/**
 * Utility class for position sizing calculations.
 *
 * Provides static methods for each sizing method with validation.
 * Each method validates that the sizing schema matches the requested method.
 *
 * @example
 * ```typescript
 * import { PositionSize } from "./classes/PositionSize";
 *
 * // Fixed percentage sizing
 * const quantity = await PositionSize.fixedPercentage(
 *   "BTCUSDT",
 *   10000,
 *   50000,
 *   49000,
 *   { sizingName: "conservative" }
 * );
 *
 * // Kelly Criterion sizing
 * const quantity = await PositionSize.kellyCriterion(
 *   "BTCUSDT",
 *   10000,
 *   50000,
 *   0.55,
 *   1.5,
 *   { sizingName: "kelly" }
 * );
 *
 * // ATR-based sizing
 * const quantity = await PositionSize.atrBased(
 *   "BTCUSDT",
 *   10000,
 *   50000,
 *   500,
 *   { sizingName: "atr-dynamic" }
 * );
 * ```
 */
declare class PositionSizeUtils {
    /**
     * Calculates position size using fixed percentage risk method.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param accountBalance - Current account balance
     * @param priceOpen - Planned entry price
     * @param priceStopLoss - Stop-loss price
     * @param context - Execution context with sizing name
     * @returns Promise resolving to calculated position size
     * @throws Error if sizing schema method is not "fixed-percentage"
     */
    static fixedPercentage: (symbol: string, accountBalance: number, priceOpen: number, priceStopLoss: number, context: {
        sizingName: SizingName;
    }) => Promise<number>;
    /**
     * Calculates position size using Kelly Criterion method.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param accountBalance - Current account balance
     * @param priceOpen - Planned entry price
     * @param winRate - Win rate (0-1)
     * @param winLossRatio - Average win/loss ratio
     * @param context - Execution context with sizing name
     * @returns Promise resolving to calculated position size
     * @throws Error if sizing schema method is not "kelly-criterion"
     */
    static kellyCriterion: (symbol: string, accountBalance: number, priceOpen: number, winRate: number, winLossRatio: number, context: {
        sizingName: SizingName;
    }) => Promise<number>;
    /**
     * Calculates position size using ATR-based method.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param accountBalance - Current account balance
     * @param priceOpen - Planned entry price
     * @param atr - Current ATR value
     * @param context - Execution context with sizing name
     * @returns Promise resolving to calculated position size
     * @throws Error if sizing schema method is not "atr-based"
     */
    static atrBased: (symbol: string, accountBalance: number, priceOpen: number, atr: number, context: {
        sizingName: SizingName;
    }) => Promise<number>;
}
declare const PositionSize: typeof PositionSizeUtils;

/**
 * Public API utilities for optimizer operations.
 * Provides high-level methods for strategy generation and code export.
 *
 * Usage:
 * ```typescript
 * import { Optimizer } from "backtest-kit";
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
 * import { Optimizer } from "backtest-kit";
 *
 * await Optimizer.dump("BTCUSDT", { optimizerName: "my-optimizer" });
 * ```
 */
declare const Optimizer: OptimizerUtils;

/**
 * Type alias for column configuration used in partial profit/loss markdown reports.
 *
 * Represents a column model specifically designed to format and display
 * partial position exit events in markdown tables.
 *
 * @typeParam PartialEvent - The partial exit event data type containing
 *   profit/loss level information, symbol, and timing details
 *
 * @example
 * ```typescript
 * // Column to display symbol
 * const symbolColumn: Columns = {
 *   key: "symbol",
 *   label: "Symbol",
 *   format: (event) => event.symbol,
 *   isVisible: () => true
 * };
 *
 * // Column to display profit level
 * const levelColumn: Columns = {
 *   key: "level",
 *   label: "Exit Level",
 *   format: (event) => event.level.toString(),
 *   isVisible: () => true
 * };
 * ```
 *
 * @see ColumnModel for the base interface
 * @see PartialEvent for the event data structure
 */
type Columns$1 = ColumnModel<PartialEvent>;
/**
 * Service for generating and saving partial profit/loss markdown reports.
 *
 * Features:
 * - Listens to partial profit and loss events via partialProfitSubject/partialLossSubject
 * - Accumulates all events (profit, loss) per symbol-strategy pair
 * - Generates markdown tables with detailed event information
 * - Provides statistics (total profit/loss events)
 * - Saves reports to disk in dump/partial/{symbol}_{strategyName}.md
 *
 * @example
 * ```typescript
 * const service = new PartialMarkdownService();
 *
 * // Service automatically subscribes to subjects on init
 * // No manual callback setup needed
 *
 * // Later: generate and save report
 * await service.dump("BTCUSDT", "my-strategy");
 * ```
 */
declare class PartialMarkdownService {
    /** Logger service for debug output */
    private readonly loggerService;
    /**
     * Memoized function to get or create ReportStorage for a symbol-strategy-exchange-frame-backtest combination.
     * Each combination gets its own isolated storage instance.
     */
    private getStorage;
    /**
     * Processes profit events and accumulates them.
     * Should be called from partialProfitSubject subscription.
     *
     * @param data - Profit event data with frameName wrapper
     *
     * @example
     * ```typescript
     * const service = new PartialMarkdownService();
     * // Service automatically subscribes in init()
     * ```
     */
    private tickProfit;
    /**
     * Processes loss events and accumulates them.
     * Should be called from partialLossSubject subscription.
     *
     * @param data - Loss event data with frameName wrapper
     *
     * @example
     * ```typescript
     * const service = new PartialMarkdownService();
     * // Service automatically subscribes in init()
     * ```
     */
    private tickLoss;
    /**
     * Gets statistical data from all partial profit/loss events for a symbol-strategy pair.
     * Delegates to ReportStorage.getData().
     *
     * @param symbol - Trading pair symbol to get data for
     * @param strategyName - Strategy name to get data for
     * @param exchangeName - Exchange name
     * @param frameName - Frame name
     * @param backtest - True if backtest mode, false if live mode
     * @returns Statistical data object with all metrics
     *
     * @example
     * ```typescript
     * const service = new PartialMarkdownService();
     * const stats = await service.getData("BTCUSDT", "my-strategy", "binance", "1h", false);
     * console.log(stats.totalProfit, stats.totalLoss);
     * ```
     */
    getData: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean) => Promise<PartialStatisticsModel>;
    /**
     * Generates markdown report with all partial events for a symbol-strategy pair.
     * Delegates to ReportStorage.getReport().
     *
     * @param symbol - Trading pair symbol to generate report for
     * @param strategyName - Strategy name to generate report for
     * @param exchangeName - Exchange name
     * @param frameName - Frame name
     * @param backtest - True if backtest mode, false if live mode
     * @param columns - Column configuration for formatting the table
     * @returns Markdown formatted report string with table of all events
     *
     * @example
     * ```typescript
     * const service = new PartialMarkdownService();
     * const markdown = await service.getReport("BTCUSDT", "my-strategy", "binance", "1h", false);
     * console.log(markdown);
     * ```
     */
    getReport: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean, columns?: Columns$1[]) => Promise<string>;
    /**
     * Saves symbol-strategy report to disk.
     * Creates directory if it doesn't exist.
     * Delegates to ReportStorage.dump().
     *
     * @param symbol - Trading pair symbol to save report for
     * @param strategyName - Strategy name to save report for
     * @param exchangeName - Exchange name
     * @param frameName - Frame name
     * @param backtest - True if backtest mode, false if live mode
     * @param path - Directory path to save report (default: "./dump/partial")
     * @param columns - Column configuration for formatting the table
     *
     * @example
     * ```typescript
     * const service = new PartialMarkdownService();
     *
     * // Save to default path: ./dump/partial/BTCUSDT_my-strategy.md
     * await service.dump("BTCUSDT", "my-strategy", "binance", "1h", false);
     *
     * // Save to custom path: ./custom/path/BTCUSDT_my-strategy.md
     * await service.dump("BTCUSDT", "my-strategy", "binance", "1h", false, "./custom/path");
     * ```
     */
    dump: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean, path?: string, columns?: Columns$1[]) => Promise<void>;
    /**
     * Clears accumulated event data from storage.
     * If payload is provided, clears only that specific symbol-strategy-exchange-frame-backtest combination's data.
     * If nothing is provided, clears all data.
     *
     * @param payload - Optional payload with symbol, strategyName, exchangeName, frameName, backtest
     *
     * @example
     * ```typescript
     * const service = new PartialMarkdownService();
     *
     * // Clear specific combination
     * await service.clear({ symbol: "BTCUSDT", strategyName: "my-strategy", exchangeName: "binance", frameName: "1h", backtest: false });
     *
     * // Clear all data
     * await service.clear();
     * ```
     */
    clear: (payload?: {
        symbol: string;
        strategyName: string;
        exchangeName: string;
        frameName: string;
        backtest: boolean;
    }) => Promise<void>;
    /**
     * Initializes the service by subscribing to partial profit/loss events.
     * Uses singleshot to ensure initialization happens only once.
     * Automatically called on first use.
     *
     * @example
     * ```typescript
     * const service = new PartialMarkdownService();
     * await service.init(); // Subscribe to profit/loss events
     * ```
     */
    protected init: (() => Promise<void>) & functools_kit.ISingleshotClearable;
}

/**
 * Utility class for accessing partial profit/loss reports and statistics.
 *
 * Provides static-like methods (via singleton instance) to retrieve data
 * accumulated by PartialMarkdownService from partial profit/loss events.
 *
 * Features:
 * - Statistical data extraction (total profit/loss events count)
 * - Markdown report generation with event tables
 * - File export to disk
 *
 * Data source:
 * - PartialMarkdownService listens to partialProfitSubject/partialLossSubject
 * - Accumulates events in ReportStorage (max 250 events per symbol-strategy pair)
 * - Events include: timestamp, action, symbol, strategyName, signalId, position, level, price, mode
 *
 * @example
 * ```typescript
 * import { Partial } from "./classes/Partial";
 *
 * // Get statistical data for BTCUSDT:my-strategy
 * const stats = await Partial.getData("BTCUSDT", "my-strategy");
 * console.log(`Total events: ${stats.totalEvents}`);
 * console.log(`Profit events: ${stats.totalProfit}`);
 * console.log(`Loss events: ${stats.totalLoss}`);
 *
 * // Generate markdown report
 * const markdown = await Partial.getReport("BTCUSDT", "my-strategy");
 * console.log(markdown); // Formatted table with all events
 *
 * // Export report to file
 * await Partial.dump("BTCUSDT", "my-strategy"); // Saves to ./dump/partial/BTCUSDT_my-strategy.md
 * await Partial.dump("BTCUSDT", "my-strategy", "./custom/path"); // Custom directory
 * ```
 */
declare class PartialUtils {
    /**
     * Retrieves statistical data from accumulated partial profit/loss events.
     *
     * Delegates to PartialMarkdownService.getData() which reads from ReportStorage.
     * Returns aggregated metrics calculated from all profit and loss events.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param strategyName - Strategy name (e.g., "my-strategy")
     * @returns Promise resolving to PartialStatisticsModel object with counts and event list
     *
     * @example
     * ```typescript
     * const stats = await Partial.getData("BTCUSDT", "my-strategy");
     *
     * console.log(`Total events: ${stats.totalEvents}`);
     * console.log(`Profit events: ${stats.totalProfit} (${(stats.totalProfit / stats.totalEvents * 100).toFixed(1)}%)`);
     * console.log(`Loss events: ${stats.totalLoss} (${(stats.totalLoss / stats.totalEvents * 100).toFixed(1)}%)`);
     *
     * // Iterate through all events
     * for (const event of stats.eventList) {
     *   console.log(`${event.action.toUpperCase()}: Signal ${event.signalId} reached ${event.level}%`);
     * }
     * ```
     */
    getData: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
        frameName: string;
    }, backtest?: boolean) => Promise<PartialStatisticsModel>;
    /**
     * Generates markdown report with all partial profit/loss events for a symbol-strategy pair.
     *
     * Creates formatted table containing:
     * - Action (PROFIT/LOSS)
     * - Symbol
     * - Strategy
     * - Signal ID
     * - Position (LONG/SHORT)
     * - Level % (+10%, -20%, etc)
     * - Current Price
     * - Timestamp (ISO 8601)
     * - Mode (Backtest/Live)
     *
     * Also includes summary statistics at the end.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param strategyName - Strategy name (e.g., "my-strategy")
     * @param columns - Optional columns configuration for the report
     * @returns Promise resolving to markdown formatted report string
     *
     * @example
     * ```typescript
     * const markdown = await Partial.getReport("BTCUSDT", "my-strategy");
     * console.log(markdown);
     *
     * // Output:
     * // # Partial Profit/Loss Report: BTCUSDT:my-strategy
     * //
     * // | Action | Symbol | Strategy | Signal ID | Position | Level % | Current Price | Timestamp | Mode |
     * // | --- | --- | --- | --- | --- | --- | --- | --- | --- |
     * // | PROFIT | BTCUSDT | my-strategy | abc123 | LONG | +10% | 51500.00000000 USD | 2024-01-15T10:30:00.000Z | Backtest |
     * // | LOSS | BTCUSDT | my-strategy | abc123 | LONG | -10% | 49000.00000000 USD | 2024-01-15T11:00:00.000Z | Backtest |
     * //
     * // **Total events:** 2
     * // **Profit events:** 1
     * // **Loss events:** 1
     * ```
     */
    getReport: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
        frameName: string;
    }, backtest?: boolean, columns?: Columns$1[]) => Promise<string>;
    /**
     * Generates and saves markdown report to file.
     *
     * Creates directory if it doesn't exist.
     * Filename format: {symbol}_{strategyName}.md (e.g., "BTCUSDT_my-strategy.md")
     *
     * Delegates to PartialMarkdownService.dump() which:
     * 1. Generates markdown report via getReport()
     * 2. Creates output directory (recursive mkdir)
     * 3. Writes file with UTF-8 encoding
     * 4. Logs success/failure to console
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param strategyName - Strategy name (e.g., "my-strategy")
     * @param path - Output directory path (default: "./dump/partial")
     * @param columns - Optional columns configuration for the report
     * @returns Promise that resolves when file is written
     *
     * @example
     * ```typescript
     * // Save to default path: ./dump/partial/BTCUSDT_my-strategy.md
     * await Partial.dump("BTCUSDT", "my-strategy");
     *
     * // Save to custom path: ./reports/partial/BTCUSDT_my-strategy.md
     * await Partial.dump("BTCUSDT", "my-strategy", "./reports/partial");
     *
     * // After multiple symbols backtested, export all reports
     * for (const symbol of ["BTCUSDT", "ETHUSDT", "BNBUSDT"]) {
     *   await Partial.dump(symbol, "my-strategy", "./backtest-results");
     * }
     * ```
     */
    dump: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
        frameName: string;
    }, backtest?: boolean, path?: string, columns?: Columns$1[]) => Promise<void>;
}
/**
 * Global singleton instance of PartialUtils.
 * Provides static-like access to partial profit/loss reporting methods.
 *
 * @example
 * ```typescript
 * import { Partial } from "backtest-kit";
 *
 * // Usage same as PartialUtils methods
 * const stats = await Partial.getData("BTCUSDT", "my-strategy");
 * const report = await Partial.getReport("BTCUSDT", "my-strategy");
 * await Partial.dump("BTCUSDT", "my-strategy");
 * ```
 */
declare const Partial$1: PartialUtils;

/**
 * Utility class containing predefined trading constants for take-profit and stop-loss levels.
 *
 * Based on Kelly Criterion with exponential risk decay.
 * Values represent percentage of distance traveled towards final TP/SL target.
 *
 * Example: If final TP is at +10% profit:
 * - TP_LEVEL1 (30) triggers when price reaches 30% of distance = +3% profit
 * - TP_LEVEL2 (60) triggers when price reaches 60% of distance = +6% profit
 * - TP_LEVEL3 (90) triggers when price reaches 90% of distance = +9% profit
 */
declare class ConstantUtils {
    /**
     * Take Profit Level 1 (Kelly-optimized early partial).
     * Triggers at 30% of distance to final TP target.
     * Lock in profit early, let rest run.
     */
    readonly TP_LEVEL1 = 30;
    /**
     * Take Profit Level 2 (Kelly-optimized mid partial).
     * Triggers at 60% of distance to final TP target.
     * Secure majority of position while trend continues.
     */
    readonly TP_LEVEL2 = 60;
    /**
     * Take Profit Level 3 (Kelly-optimized final partial).
     * Triggers at 90% of distance to final TP target.
     * Near-complete exit, minimal exposure remains.
     */
    readonly TP_LEVEL3 = 90;
    /**
     * Stop Loss Level 1 (Kelly-optimized early warning).
     * Triggers at 40% of distance to final SL target.
     * Reduce exposure when setup weakens.
     */
    readonly SL_LEVEL1 = 40;
    /**
     * Stop Loss Level 2 (Kelly-optimized final exit).
     * Triggers at 80% of distance to final SL target.
     * Exit remaining position before catastrophic loss.
     */
    readonly SL_LEVEL2 = 80;
}
/**
 * Global singleton instance of ConstantUtils.
 * Provides static-like access to predefined trading level constants.
 *
 * Kelly-optimized scaling strategy:
 * Profit side (pyramiding out):
 * - Close 33% at 30% progress (quick profit lock)
 * - Close 33% at 60% progress (secure gains)
 * - Close 34% at 90% progress (exit near target)
 *
 * Loss side (damage control):
 * - Close 50% at 40% progress (reduce risk early)
 * - Close 50% at 80% progress (exit before full stop)
 *
 * @example
 * ```typescript
 * // Final targets: TP at +10%, SL at -5%
 * listenPartialProfit(async (event) => {
 *   // event.level emits: 10, 20, 30, 40, 50...
 *   if (event.level === Constant.TP_LEVEL1) { await close(33); } // at +3% profit
 *   if (event.level === Constant.TP_LEVEL2) { await close(33); } // at +6% profit
 *   if (event.level === Constant.TP_LEVEL3) { await close(34); } // at +9% profit
 * });
 * ```
 *
 * @example
 * ```typescript
 * listenPartialLoss(async (event) => {
 *   // event.level emits: 10, 20, 30, 40, 50...
 *   if (event.level === Constant.SL_LEVEL1) { await close(50); } // at -2% loss
 *   if (event.level === Constant.SL_LEVEL2) { await close(50); } // at -4% loss
 * });
 * ```
 */
declare const Constant: ConstantUtils;

/**
 * Type alias for column configuration used in risk management markdown reports.
 *
 * Represents a column model specifically designed to format and display
 * risk rejection events in markdown tables.
 *
 * @typeParam RiskEvent - The risk event data type containing
 *   risk rejection details, symbol, and rejection reason
 *
 * @example
 * ```typescript
 * // Column to display symbol
 * const symbolColumn: Columns = {
 *   key: "symbol",
 *   label: "Symbol",
 *   format: (event) => event.symbol,
 *   isVisible: () => true
 * };
 *
 * // Column to display rejection reason
 * const reasonColumn: Columns = {
 *   key: "reason",
 *   label: "Rejection Reason",
 *   format: (event) => event.reason,
 *   isVisible: () => true
 * };
 * ```
 *
 * @see ColumnModel for the base interface
 * @see RiskEvent for the event data structure
 */
type Columns = ColumnModel<RiskEvent>;
/**
 * Service for generating and saving risk rejection markdown reports.
 *
 * Features:
 * - Listens to risk rejection events via riskSubject
 * - Accumulates all rejection events per symbol-strategy pair
 * - Generates markdown tables with detailed rejection information
 * - Provides statistics (total rejections, by symbol, by strategy)
 * - Saves reports to disk in dump/risk/{symbol}_{strategyName}.md
 *
 * @example
 * ```typescript
 * const service = new RiskMarkdownService();
 *
 * // Service automatically subscribes to subjects on init
 * // No manual callback setup needed
 *
 * // Later: generate and save report
 * await service.dump("BTCUSDT", "my-strategy");
 * ```
 */
declare class RiskMarkdownService {
    /** Logger service for debug output */
    private readonly loggerService;
    /**
     * Memoized function to get or create ReportStorage for a symbol-strategy-exchange-frame-backtest combination.
     * Each combination gets its own isolated storage instance.
     */
    private getStorage;
    /**
     * Processes risk rejection events and accumulates them.
     * Should be called from riskSubject subscription.
     *
     * @param data - Risk rejection event data with frameName wrapper
     *
     * @example
     * ```typescript
     * const service = new RiskMarkdownService();
     * // Service automatically subscribes in init()
     * ```
     */
    private tickRejection;
    /**
     * Gets statistical data from all risk rejection events for a symbol-strategy pair.
     * Delegates to ReportStorage.getData().
     *
     * @param symbol - Trading pair symbol to get data for
     * @param strategyName - Strategy name to get data for
     * @param exchangeName - Exchange name
     * @param frameName - Frame name
     * @param backtest - True if backtest mode, false if live mode
     * @returns Statistical data object with all metrics
     *
     * @example
     * ```typescript
     * const service = new RiskMarkdownService();
     * const stats = await service.getData("BTCUSDT", "my-strategy", "binance", "1h", false);
     * console.log(stats.totalRejections, stats.bySymbol);
     * ```
     */
    getData: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean) => Promise<RiskStatisticsModel>;
    /**
     * Generates markdown report with all risk rejection events for a symbol-strategy pair.
     * Delegates to ReportStorage.getReport().
     *
     * @param symbol - Trading pair symbol to generate report for
     * @param strategyName - Strategy name to generate report for
     * @param exchangeName - Exchange name
     * @param frameName - Frame name
     * @param backtest - True if backtest mode, false if live mode
     * @param columns - Column configuration for formatting the table
     * @returns Markdown formatted report string with table of all events
     *
     * @example
     * ```typescript
     * const service = new RiskMarkdownService();
     * const markdown = await service.getReport("BTCUSDT", "my-strategy", "binance", "1h", false);
     * console.log(markdown);
     * ```
     */
    getReport: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean, columns?: Columns[]) => Promise<string>;
    /**
     * Saves symbol-strategy report to disk.
     * Creates directory if it doesn't exist.
     * Delegates to ReportStorage.dump().
     *
     * @param symbol - Trading pair symbol to save report for
     * @param strategyName - Strategy name to save report for
     * @param exchangeName - Exchange name
     * @param frameName - Frame name
     * @param backtest - True if backtest mode, false if live mode
     * @param path - Directory path to save report (default: "./dump/risk")
     * @param columns - Column configuration for formatting the table
     *
     * @example
     * ```typescript
     * const service = new RiskMarkdownService();
     *
     * // Save to default path: ./dump/risk/BTCUSDT_my-strategy.md
     * await service.dump("BTCUSDT", "my-strategy", "binance", "1h", false);
     *
     * // Save to custom path: ./custom/path/BTCUSDT_my-strategy.md
     * await service.dump("BTCUSDT", "my-strategy", "binance", "1h", false, "./custom/path");
     * ```
     */
    dump: (symbol: string, strategyName: string, exchangeName: string, frameName: string, backtest: boolean, path?: string, columns?: Columns[]) => Promise<void>;
    /**
     * Clears accumulated event data from storage.
     * If payload is provided, clears only that specific symbol-strategy-exchange-frame-backtest combination's data.
     * If nothing is provided, clears all data.
     *
     * @param payload - Optional payload with symbol, strategyName, exchangeName, frameName, backtest
     *
     * @example
     * ```typescript
     * const service = new RiskMarkdownService();
     *
     * // Clear specific combination
     * await service.clear({ symbol: "BTCUSDT", strategyName: "my-strategy", exchangeName: "binance", frameName: "1h", backtest: false });
     *
     * // Clear all data
     * await service.clear();
     * ```
     */
    clear: (payload?: {
        symbol: string;
        strategyName: string;
        exchangeName: string;
        frameName: string;
        backtest: boolean;
    }) => Promise<void>;
    /**
     * Initializes the service by subscribing to risk rejection events.
     * Uses singleshot to ensure initialization happens only once.
     * Automatically called on first use.
     *
     * @example
     * ```typescript
     * const service = new RiskMarkdownService();
     * await service.init(); // Subscribe to rejection events
     * ```
     */
    protected init: (() => Promise<void>) & functools_kit.ISingleshotClearable;
}

/**
 * Utility class for accessing risk rejection reports and statistics.
 *
 * Provides static-like methods (via singleton instance) to retrieve data
 * accumulated by RiskMarkdownService from risk rejection events.
 *
 * Features:
 * - Statistical data extraction (total rejections count, by symbol, by strategy)
 * - Markdown report generation with event tables
 * - File export to disk
 *
 * Data source:
 * - RiskMarkdownService listens to riskSubject
 * - Accumulates rejection events in ReportStorage (max 250 events per symbol-strategy pair)
 * - Events include: timestamp, symbol, strategyName, position, exchangeName, price, activePositionCount, comment
 *
 * @example
 * ```typescript
 * import { Risk } from "./classes/Risk";
 *
 * // Get statistical data for BTCUSDT:my-strategy
 * const stats = await Risk.getData("BTCUSDT", "my-strategy");
 * console.log(`Total rejections: ${stats.totalRejections}`);
 * console.log(`By symbol:`, stats.bySymbol);
 * console.log(`By strategy:`, stats.byStrategy);
 *
 * // Generate markdown report
 * const markdown = await Risk.getReport("BTCUSDT", "my-strategy");
 * console.log(markdown); // Formatted table with all rejection events
 *
 * // Export report to file
 * await Risk.dump("BTCUSDT", "my-strategy"); // Saves to ./dump/risk/BTCUSDT_my-strategy.md
 * await Risk.dump("BTCUSDT", "my-strategy", "./custom/path"); // Custom directory
 * ```
 */
declare class RiskUtils {
    /**
     * Retrieves statistical data from accumulated risk rejection events.
     *
     * Delegates to RiskMarkdownService.getData() which reads from ReportStorage.
     * Returns aggregated metrics calculated from all rejection events.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param strategyName - Strategy name (e.g., "my-strategy")
     * @returns Promise resolving to RiskStatisticsModel object with counts and event list
     *
     * @example
     * ```typescript
     * const stats = await Risk.getData("BTCUSDT", "my-strategy");
     *
     * console.log(`Total rejections: ${stats.totalRejections}`);
     * console.log(`Rejections by symbol:`, stats.bySymbol);
     * console.log(`Rejections by strategy:`, stats.byStrategy);
     *
     * // Iterate through all rejection events
     * for (const event of stats.eventList) {
     *   console.log(`REJECTED: ${event.symbol} - ${event.comment} (${event.activePositionCount} active)`);
     * }
     * ```
     */
    getData: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
        frameName: string;
    }, backtest?: boolean) => Promise<RiskStatisticsModel>;
    /**
     * Generates markdown report with all risk rejection events for a symbol-strategy pair.
     *
     * Creates formatted table containing:
     * - Symbol
     * - Strategy
     * - Position (LONG/SHORT)
     * - Exchange
     * - Price
     * - Active Positions (at rejection time)
     * - Reason (from validation note)
     * - Timestamp (ISO 8601)
     *
     * Also includes summary statistics at the end (total rejections, by symbol, by strategy).
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param strategyName - Strategy name (e.g., "my-strategy")
     * @param columns - Optional columns configuration for the report
     * @returns Promise resolving to markdown formatted report string
     *
     * @example
     * ```typescript
     * const markdown = await Risk.getReport("BTCUSDT", "my-strategy");
     * console.log(markdown);
     *
     * // Output:
     * // # Risk Rejection Report: BTCUSDT:my-strategy
     * //
     * // | Symbol | Strategy | Position | Exchange | Price | Active Positions | Reason | Timestamp |
     * // | --- | --- | --- | --- | --- | --- | --- | --- |
     * // | BTCUSDT | my-strategy | LONG | binance | 50000.00000000 USD | 3 | Max 3 positions allowed | 2024-01-15T10:30:00.000Z |
     * //
     * // **Total rejections:** 1
     * //
     * // ## Rejections by Symbol
     * // - BTCUSDT: 1
     * //
     * // ## Rejections by Strategy
     * // - my-strategy: 1
     * ```
     */
    getReport: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
        frameName: string;
    }, backtest?: boolean, columns?: Columns[]) => Promise<string>;
    /**
     * Generates and saves markdown report to file.
     *
     * Creates directory if it doesn't exist.
     * Filename format: {symbol}_{strategyName}.md (e.g., "BTCUSDT_my-strategy.md")
     *
     * Delegates to RiskMarkdownService.dump() which:
     * 1. Generates markdown report via getReport()
     * 2. Creates output directory (recursive mkdir)
     * 3. Writes file with UTF-8 encoding
     * 4. Logs success/failure to console
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param strategyName - Strategy name (e.g., "my-strategy")
     * @param path - Output directory path (default: "./dump/risk")
     * @param columns - Optional columns configuration for the report
     * @returns Promise that resolves when file is written
     *
     * @example
     * ```typescript
     * // Save to default path: ./dump/risk/BTCUSDT_my-strategy.md
     * await Risk.dump("BTCUSDT", "my-strategy");
     *
     * // Save to custom path: ./reports/risk/BTCUSDT_my-strategy.md
     * await Risk.dump("BTCUSDT", "my-strategy", "./reports/risk");
     *
     * // After multiple symbols backtested, export all risk reports
     * for (const symbol of ["BTCUSDT", "ETHUSDT", "BNBUSDT"]) {
     *   await Risk.dump(symbol, "my-strategy", "./backtest-results");
     * }
     * ```
     */
    dump: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
        frameName: string;
    }, backtest?: boolean, path?: string, columns?: Columns[]) => Promise<void>;
}
/**
 * Global singleton instance of RiskUtils.
 * Provides static-like access to risk rejection reporting methods.
 *
 * @example
 * ```typescript
 * import { Risk } from "backtest-kit";
 *
 * // Usage same as RiskUtils methods
 * const stats = await Risk.getData("BTCUSDT", "my-strategy");
 * const report = await Risk.getReport("BTCUSDT", "my-strategy");
 * await Risk.dump("BTCUSDT", "my-strategy");
 * ```
 */
declare const Risk: RiskUtils;

/**
 * Utility class for exchange operations.
 *
 * Provides simplified access to exchange schema methods with validation.
 * Exported as singleton instance for convenient usage.
 *
 * @example
 * ```typescript
 * import { Exchange } from "./classes/Exchange";
 *
 * const candles = await Exchange.getCandles("BTCUSDT", "1m", 100, {
 *   exchangeName: "binance"
 * });
 * const vwap = await Exchange.getAveragePrice("BTCUSDT", {
 *   exchangeName: "binance"
 * });
 * const formatted = await Exchange.formatQuantity("BTCUSDT", 0.001, {
 *   exchangeName: "binance"
 * });
 * ```
 */
declare class ExchangeUtils {
    /**
     * Memoized function to get or create ExchangeInstance for an exchange.
     * Each exchange gets its own isolated instance.
     */
    private _getInstance;
    /**
     * Fetch candles from data source (API or database).
     *
     * Automatically calculates the start date based on Date.now() and the requested interval/limit.
     * Uses the same logic as ClientExchange to ensure backwards compatibility.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param interval - Candle time interval (e.g., "1m", "1h")
     * @param limit - Maximum number of candles to fetch
     * @param context - Execution context with exchange name
     * @returns Promise resolving to array of OHLCV candle data
     */
    getCandles: (symbol: string, interval: CandleInterval, limit: number, context: {
        exchangeName: ExchangeName;
    }) => Promise<ICandleData[]>;
    /**
     * Calculates VWAP (Volume Weighted Average Price) from last N 1m candles.
     *
     * @param symbol - Trading pair symbol
     * @param context - Execution context with exchange name
     * @returns Promise resolving to VWAP price
     */
    getAveragePrice: (symbol: string, context: {
        exchangeName: ExchangeName;
    }) => Promise<number>;
    /**
     * Format quantity according to exchange precision rules.
     *
     * @param symbol - Trading pair symbol
     * @param quantity - Raw quantity value
     * @param context - Execution context with exchange name
     * @returns Promise resolving to formatted quantity string
     */
    formatQuantity: (symbol: string, quantity: number, context: {
        exchangeName: ExchangeName;
    }) => Promise<string>;
    /**
     * Format price according to exchange precision rules.
     *
     * @param symbol - Trading pair symbol
     * @param price - Raw price value
     * @param context - Execution context with exchange name
     * @returns Promise resolving to formatted price string
     */
    formatPrice: (symbol: string, price: number, context: {
        exchangeName: ExchangeName;
    }) => Promise<string>;
}
/**
 * Singleton instance of ExchangeUtils for convenient exchange operations.
 *
 * @example
 * ```typescript
 * import { Exchange } from "./classes/Exchange";
 *
 * // Using static-like API with context
 * const candles = await Exchange.getCandles("BTCUSDT", "1m", 100, {
 *   exchangeName: "binance"
 * });
 * const vwap = await Exchange.getAveragePrice("BTCUSDT", {
 *   exchangeName: "binance"
 * });
 * const qty = await Exchange.formatQuantity("BTCUSDT", 0.001, {
 *   exchangeName: "binance"
 * });
 * const price = await Exchange.formatPrice("BTCUSDT", 50000.123, {
 *   exchangeName: "binance"
 * });
 *
 * // Using instance API (no context needed, exchange set in constructor)
 * const binance = new ExchangeInstance("binance");
 * const candles2 = await binance.getCandles("BTCUSDT", "1m", 100);
 * const vwap2 = await binance.getAveragePrice("BTCUSDT");
 * ```
 */
declare const Exchange: ExchangeUtils;

/**
 * Generic function type that accepts any arguments and returns any value.
 * Used as a constraint for cached functions.
 */
type Function = (...args: any[]) => any;
/**
 * Utility class for function caching with timeframe-based invalidation.
 *
 * Provides simplified API for wrapping functions with automatic caching.
 * Exported as singleton instance for convenient usage.
 *
 * @example
 * ```typescript
 * import { Cache } from "./classes/Cache";
 *
 * const cachedFn = Cache.fn(expensiveCalculation, "1h");
 * const result = cachedFn(arg1, arg2); // Computed on first call
 * const result2 = cachedFn(arg1, arg2); // Cached (within same hour)
 * ```
 */
declare class CacheUtils {
    /**
     * Memoized function to get or create CacheInstance for a function.
     * Each function gets its own isolated cache instance.
     */
    private _getInstance;
    /**
     * Wrap a function with caching based on timeframe intervals.
     *
     * Returns a wrapped version of the function that automatically caches results
     * and invalidates based on the specified candle interval.
     *
     * @template T - Function type to cache
     * @param run - Function to wrap with caching
     * @param interval - Candle interval for cache invalidation (e.g., "1m", "1h")
     * @returns Wrapped function with automatic caching
     *
     * @example
     * ```typescript
     * const calculateIndicator = (symbol: string, period: number) => {
     *   // Expensive calculation
     *   return result;
     * };
     *
     * const cachedCalculate = Cache.fn(calculateIndicator, "15m");
     * const result = cachedCalculate("BTCUSDT", 14); // Computed
     * const result2 = cachedCalculate("BTCUSDT", 14); // Cached (same 15m interval)
     * ```
     */
    fn: <T extends Function>(run: T, context: {
        interval: CandleInterval;
    }) => T;
    /**
     * Flush (remove) cached CacheInstance for a specific function or all functions.
     *
     * This method removes CacheInstance objects from the internal memoization cache.
     * When a CacheInstance is flushed, all cached results across all contexts
     * (all strategy/exchange/mode combinations) for that function are discarded.
     *
     * Use cases:
     * - Remove specific function's CacheInstance when implementation changes
     * - Free memory by removing unused CacheInstances
     * - Reset all CacheInstances when switching between different test scenarios
     *
     * Note: This is different from `clear()` which only removes cached values
     * for the current context within an existing CacheInstance.
     *
     * @template T - Function type
     * @param run - Optional function to flush CacheInstance for. If omitted, flushes all CacheInstances.
     *
     * @example
     * ```typescript
     * const cachedFn = Cache.fn(calculateIndicator, { interval: "1h" });
     *
     * // Flush CacheInstance for specific function
     * Cache.flush(calculateIndicator);
     *
     * // Flush all CacheInstances
     * Cache.flush();
     * ```
     */
    flush: <T extends Function>(run?: T) => void;
    /**
     * Clear cached value for current execution context of a specific function.
     *
     * Removes the cached entry for the current strategy/exchange/mode combination
     * from the specified function's CacheInstance. The next call to the wrapped function
     * will recompute the value for that context.
     *
     * This only clears the cache for the current execution context, not all contexts.
     * Use `flush()` to remove the entire CacheInstance across all contexts.
     *
     * Requires active execution context (strategy, exchange, backtest mode) and method context.
     *
     * @template T - Function type
     * @param run - Function whose cache should be cleared for current context
     *
     * @example
     * ```typescript
     * const cachedFn = Cache.fn(calculateIndicator, { interval: "1h" });
     *
     * // Within strategy execution context
     * const result1 = cachedFn("BTCUSDT", 14); // Computed
     * const result2 = cachedFn("BTCUSDT", 14); // Cached
     *
     * Cache.clear(calculateIndicator); // Clear cache for current context only
     *
     * const result3 = cachedFn("BTCUSDT", 14); // Recomputed for this context
     * // Other contexts (different strategies/exchanges) remain cached
     * ```
     */
    clear: <T extends Function>(run: T) => void;
}
/**
 * Singleton instance of CacheUtils for convenient function caching.
 *
 * @example
 * ```typescript
 * import { Cache } from "./classes/Cache";
 *
 * // Wrap expensive function with 1-hour cache
 * const cachedFn = Cache.fn(myExpensiveFunction, "1h");
 * const result = cachedFn(arg1, arg2);
 *
 * // Cache is automatically invalidated when moving to next hour interval
 * ```
 */
declare const Cache: CacheUtils;

/**
 * Public facade for notification operations.
 *
 * Automatically calls waitForInit on each userspace method call.
 * Provides simplified access to notification instance methods.
 *
 * @example
 * ```typescript
 * import { Notification } from "./classes/Notification";
 *
 * // Get all notifications
 * const all = await Notification.getData();
 *
 * // Process notifications with type discrimination
 * all.forEach(notification => {
 *   switch (notification.type) {
 *     case "signal.closed":
 *       console.log(`Closed: ${notification.pnlPercentage}%`);
 *       break;
 *     case "partial.loss":
 *       if (notification.level >= 30) {
 *         alert("High loss!");
 *       }
 *       break;
 *     case "risk.rejection":
 *       console.warn(notification.rejectionNote);
 *       break;
 *   }
 * });
 *
 * // Clear history
 * await Notification.clear();
 * ```
 */
declare class NotificationUtils {
    /** Internal instance containing business logic */
    private _instance;
    /**
     * Returns all notifications in chronological order (newest first).
     *
     * @returns Array of strongly-typed notification objects
     *
     * @example
     * ```typescript
     * const notifications = await Notification.getData();
     *
     * notifications.forEach(notification => {
     *   switch (notification.type) {
     *     case "signal.closed":
     *       console.log(`${notification.symbol}: ${notification.pnlPercentage}%`);
     *       break;
     *     case "partial.loss":
     *       if (notification.level >= 30) {
     *         console.warn(`High loss: ${notification.symbol}`);
     *       }
     *       break;
     *   }
     * });
     * ```
     */
    getData(): Promise<NotificationModel[]>;
    /**
     * Clears all notification history.
     *
     * @example
     * ```typescript
     * await Notification.clear();
     * ```
     */
    clear(): Promise<void>;
}
/**
 * Singleton instance of NotificationUtils for convenient notification access.
 *
 * @example
 * ```typescript
 * import { Notification } from "./classes/Notification";
 *
 * // Get all notifications
 * const all = await Notification.getData();
 *
 * // Filter by type using type discrimination
 * const closedSignals = all.filter(n => n.type === "signal.closed");
 * const highLosses = all.filter(n =>
 *   n.type === "partial.loss" && n.level >= 30
 * );
 *
 * // Clear history
 * await Notification.clear();
 * ```
 */
declare const Notification: NotificationUtils;

/**
 * Contract for walker stop signal events.
 *
 * Emitted when Walker.stop() is called to interrupt a running walker.
 * Contains metadata about which walker and strategy should be stopped.
 *
 * Supports multiple walkers running on the same symbol simultaneously
 * by including walkerName for filtering.
 *
 * @example
 * ```typescript
 * import { walkerStopSubject } from "backtest-kit";
 *
 * walkerStopSubject
 *   .filter((event) => event.symbol === "BTCUSDT")
 *   .connect((event) => {
 *     console.log("Walker stopped:", event.walkerName);
 *     console.log("Strategy:", event.strategyName);
 *   });
 * ```
 */
interface WalkerStopContract {
    /** symbol - Trading symbol (e.g., "BTCUSDT") */
    symbol: string;
    /** strategyName - Name of the strategy to stop */
    strategyName: StrategyName;
    /** walkerName - Name of the walker to stop (for filtering) */
    walkerName: WalkerName;
}

/**
 * Global signal emitter for all trading events (live + backtest).
 * Emits all signal events regardless of execution mode.
 */
declare const signalEmitter: Subject<IStrategyTickResult>;
/**
 * Live trading signal emitter.
 * Emits only signals from live trading execution.
 */
declare const signalLiveEmitter: Subject<IStrategyTickResult>;
/**
 * Backtest signal emitter.
 * Emits only signals from backtest execution.
 */
declare const signalBacktestEmitter: Subject<IStrategyTickResult>;
/**
 * Error emitter for background execution errors.
 * Emits errors caught in background tasks (Live.background, Backtest.background).
 */
declare const errorEmitter: Subject<Error>;
/**
 * Exit emitter for critical errors that require process termination.
 * Emits errors that should terminate the current execution (Backtest, Live, Walker).
 * Unlike errorEmitter (for recoverable errors), exitEmitter signals fatal errors.
 */
declare const exitEmitter: Subject<Error>;
/**
 * Done emitter for live background execution completion.
 * Emits when live background tasks complete (Live.background).
 */
declare const doneLiveSubject: Subject<DoneContract>;
/**
 * Done emitter for backtest background execution completion.
 * Emits when backtest background tasks complete (Backtest.background).
 */
declare const doneBacktestSubject: Subject<DoneContract>;
/**
 * Done emitter for walker background execution completion.
 * Emits when walker background tasks complete (Walker.background).
 */
declare const doneWalkerSubject: Subject<DoneContract>;
/**
 * Progress emitter for backtest execution progress.
 * Emits progress updates during backtest execution.
 */
declare const progressBacktestEmitter: Subject<ProgressBacktestContract>;
/**
 * Progress emitter for walker execution progress.
 * Emits progress updates during walker execution.
 */
declare const progressWalkerEmitter: Subject<ProgressWalkerContract>;
/**
 * Progress emitter for optimizer execution progress.
 * Emits progress updates during optimizer execution.
 */
declare const progressOptimizerEmitter: Subject<ProgressOptimizerContract>;
/**
 * Performance emitter for execution metrics.
 * Emits performance metrics for profiling and bottleneck detection.
 */
declare const performanceEmitter: Subject<PerformanceContract>;
/**
 * Walker emitter for strategy comparison progress.
 * Emits progress updates during walker execution (each strategy completion).
 */
declare const walkerEmitter: Subject<WalkerContract>;
/**
 * Walker complete emitter for strategy comparison completion.
 * Emits when all strategies have been tested and final results are available.
 */
declare const walkerCompleteSubject: Subject<WalkerCompleteContract>;
/**
 * Walker stop emitter for walker cancellation events.
 * Emits when a walker comparison is stopped/cancelled.
 *
 * Includes walkerName to support multiple walkers running on the same symbol.
 */
declare const walkerStopSubject: Subject<WalkerStopContract>;
/**
 * Validation emitter for risk validation errors.
 * Emits when risk validation functions throw errors during signal checking.
 */
declare const validationSubject: Subject<Error>;
/**
 * Partial profit emitter for profit level milestones.
 * Emits when a signal reaches a profit level (10%, 20%, 30%, etc).
 */
declare const partialProfitSubject: Subject<PartialProfitContract>;
/**
 * Partial loss emitter for loss level milestones.
 * Emits when a signal reaches a loss level (10%, 20%, 30%, etc).
 */
declare const partialLossSubject: Subject<PartialLossContract>;
/**
 * Risk rejection emitter for risk management violations.
 * Emits ONLY when a signal is rejected due to risk validation failure.
 * Does not emit for allowed signals (prevents spam).
 */
declare const riskSubject: Subject<RiskContract>;
/**
 * Ping emitter for scheduled signal monitoring events.
 * Emits every minute when a scheduled signal is being monitored (waiting for activation).
 * Allows users to track scheduled signal lifecycle and implement custom cancellation logic.
 */
declare const pingSubject: Subject<PingContract>;

declare const emitters_doneBacktestSubject: typeof doneBacktestSubject;
declare const emitters_doneLiveSubject: typeof doneLiveSubject;
declare const emitters_doneWalkerSubject: typeof doneWalkerSubject;
declare const emitters_errorEmitter: typeof errorEmitter;
declare const emitters_exitEmitter: typeof exitEmitter;
declare const emitters_partialLossSubject: typeof partialLossSubject;
declare const emitters_partialProfitSubject: typeof partialProfitSubject;
declare const emitters_performanceEmitter: typeof performanceEmitter;
declare const emitters_pingSubject: typeof pingSubject;
declare const emitters_progressBacktestEmitter: typeof progressBacktestEmitter;
declare const emitters_progressOptimizerEmitter: typeof progressOptimizerEmitter;
declare const emitters_progressWalkerEmitter: typeof progressWalkerEmitter;
declare const emitters_riskSubject: typeof riskSubject;
declare const emitters_signalBacktestEmitter: typeof signalBacktestEmitter;
declare const emitters_signalEmitter: typeof signalEmitter;
declare const emitters_signalLiveEmitter: typeof signalLiveEmitter;
declare const emitters_validationSubject: typeof validationSubject;
declare const emitters_walkerCompleteSubject: typeof walkerCompleteSubject;
declare const emitters_walkerEmitter: typeof walkerEmitter;
declare const emitters_walkerStopSubject: typeof walkerStopSubject;
declare namespace emitters {
  export { emitters_doneBacktestSubject as doneBacktestSubject, emitters_doneLiveSubject as doneLiveSubject, emitters_doneWalkerSubject as doneWalkerSubject, emitters_errorEmitter as errorEmitter, emitters_exitEmitter as exitEmitter, emitters_partialLossSubject as partialLossSubject, emitters_partialProfitSubject as partialProfitSubject, emitters_performanceEmitter as performanceEmitter, emitters_pingSubject as pingSubject, emitters_progressBacktestEmitter as progressBacktestEmitter, emitters_progressOptimizerEmitter as progressOptimizerEmitter, emitters_progressWalkerEmitter as progressWalkerEmitter, emitters_riskSubject as riskSubject, emitters_signalBacktestEmitter as signalBacktestEmitter, emitters_signalEmitter as signalEmitter, emitters_signalLiveEmitter as signalLiveEmitter, emitters_validationSubject as validationSubject, emitters_walkerCompleteSubject as walkerCompleteSubject, emitters_walkerEmitter as walkerEmitter, emitters_walkerStopSubject as walkerStopSubject };
}

/**
 * Logger service with automatic context injection.
 *
 * Features:
 * - Delegates to user-provided logger via setLogger()
 * - Automatically appends method context (strategyName, exchangeName, frameName)
 * - Automatically appends execution context (symbol, when, backtest)
 * - Defaults to NOOP_LOGGER if no logger configured
 *
 * Used throughout the framework for consistent logging with context.
 */
declare class LoggerService implements ILogger {
    private readonly methodContextService;
    private readonly executionContextService;
    private _commonLogger;
    /**
     * Gets current method context if available.
     * Contains strategyName, exchangeName, frameName from MethodContextService.
     */
    private get methodContext();
    /**
     * Gets current execution context if available.
     * Contains symbol, when, backtest from ExecutionContextService.
     */
    private get executionContext();
    /**
     * Logs general-purpose message with automatic context injection.
     *
     * @param topic - Log topic/category
     * @param args - Additional log arguments
     */
    log: (topic: string, ...args: any[]) => Promise<void>;
    /**
     * Logs debug-level message with automatic context injection.
     *
     * @param topic - Log topic/category
     * @param args - Additional log arguments
     */
    debug: (topic: string, ...args: any[]) => Promise<void>;
    /**
     * Logs info-level message with automatic context injection.
     *
     * @param topic - Log topic/category
     * @param args - Additional log arguments
     */
    info: (topic: string, ...args: any[]) => Promise<void>;
    /**
     * Logs warning-level message with automatic context injection.
     *
     * @param topic - Log topic/category
     * @param args - Additional log arguments
     */
    warn: (topic: string, ...args: any[]) => Promise<void>;
    /**
     * Sets custom logger implementation.
     *
     * @param logger - Custom logger implementing ILogger interface
     */
    setLogger: (logger: ILogger) => void;
}

/**
 * Client implementation for exchange data access.
 *
 * Features:
 * - Historical candle fetching (backwards from execution context)
 * - Future candle fetching (forwards for backtest)
 * - VWAP calculation from last 5 1m candles
 * - Price/quantity formatting for exchange
 *
 * All methods use prototype functions for memory efficiency.
 *
 * @example
 * ```typescript
 * const exchange = new ClientExchange({
 *   exchangeName: "binance",
 *   getCandles: async (symbol, interval, since, limit) => [...],
 *   formatPrice: async (symbol, price) => price.toFixed(2),
 *   formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
 *   execution: executionService,
 *   logger: loggerService,
 * });
 *
 * const candles = await exchange.getCandles("BTCUSDT", "1m", 100);
 * const vwap = await exchange.getAveragePrice("BTCUSDT");
 * ```
 */
declare class ClientExchange implements IExchange {
    readonly params: IExchangeParams;
    constructor(params: IExchangeParams);
    /**
     * Fetches historical candles backwards from execution context time.
     *
     * @param symbol - Trading pair symbol
     * @param interval - Candle interval
     * @param limit - Number of candles to fetch
     * @returns Promise resolving to array of candles
     */
    getCandles(symbol: string, interval: CandleInterval, limit: number): Promise<ICandleData[]>;
    /**
     * Fetches future candles forwards from execution context time.
     * Used in backtest mode to get candles for signal duration.
     *
     * @param symbol - Trading pair symbol
     * @param interval - Candle interval
     * @param limit - Number of candles to fetch
     * @returns Promise resolving to array of candles
     * @throws Error if trying to fetch future candles in live mode
     */
    getNextCandles(symbol: string, interval: CandleInterval, limit: number): Promise<ICandleData[]>;
    /**
     * Calculates VWAP (Volume Weighted Average Price) from last N 1m candles.
     * The number of candles is configurable via GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT.
     *
     * Formula:
     * - Typical Price = (high + low + close) / 3
     * - VWAP = sum(typical_price * volume) / sum(volume)
     *
     * If volume is zero, returns simple average of close prices.
     *
     * @param symbol - Trading pair symbol
     * @returns Promise resolving to VWAP price
     * @throws Error if no candles available
     */
    getAveragePrice(symbol: string): Promise<number>;
    /**
     * Formats quantity according to exchange-specific rules for the given symbol.
     * Applies proper decimal precision and rounding based on symbol's lot size filters.
     *
     * @param symbol - Trading pair symbol
     * @param quantity - Raw quantity to format
     * @returns Promise resolving to formatted quantity as string
     */
    formatQuantity(symbol: string, quantity: number): Promise<string>;
    /**
     * Formats price according to exchange-specific rules for the given symbol.
     * Applies proper decimal precision and rounding based on symbol's price filters.
     *
     * @param symbol - Trading pair symbol
     * @param price - Raw price to format
     * @returns Promise resolving to formatted price as string
     */
    formatPrice(symbol: string, price: number): Promise<string>;
}

/**
 * Connection service routing exchange operations to correct ClientExchange instance.
 *
 * Routes all IExchange method calls to the appropriate exchange implementation
 * based on methodContextService.context.exchangeName. Uses memoization to cache
 * ClientExchange instances for performance.
 *
 * Key features:
 * - Automatic exchange routing via method context
 * - Memoized ClientExchange instances by exchangeName
 * - Implements full IExchange interface
 * - Logging for all operations
 *
 * @example
 * ```typescript
 * // Used internally by framework
 * const candles = await exchangeConnectionService.getCandles(
 *   "BTCUSDT", "1h", 100
 * );
 * // Automatically routes to correct exchange based on methodContext
 * ```
 */
declare class ExchangeConnectionService implements IExchange {
    private readonly loggerService;
    private readonly executionContextService;
    private readonly exchangeSchemaService;
    private readonly methodContextService;
    /**
     * Retrieves memoized ClientExchange instance for given exchange name.
     *
     * Creates ClientExchange on first call, returns cached instance on subsequent calls.
     * Cache key is exchangeName string.
     *
     * @param exchangeName - Name of registered exchange schema
     * @returns Configured ClientExchange instance
     */
    getExchange: ((exchangeName: ExchangeName) => ClientExchange) & functools_kit.IClearableMemoize<string> & functools_kit.IControlMemoize<string, ClientExchange>;
    /**
     * Fetches historical candles for symbol using configured exchange.
     *
     * Routes to exchange determined by methodContextService.context.exchangeName.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param interval - Candle interval (e.g., "1h", "1d")
     * @param limit - Maximum number of candles to fetch
     * @returns Promise resolving to array of candle data
     */
    getCandles: (symbol: string, interval: CandleInterval, limit: number) => Promise<ICandleData[]>;
    /**
     * Fetches next batch of candles relative to executionContext.when.
     *
     * Returns candles that come after the current execution timestamp.
     * Used for backtest progression and live trading updates.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param interval - Candle interval (e.g., "1h", "1d")
     * @param limit - Maximum number of candles to fetch
     * @returns Promise resolving to array of candle data
     */
    getNextCandles: (symbol: string, interval: CandleInterval, limit: number) => Promise<ICandleData[]>;
    /**
     * Retrieves current average price for symbol.
     *
     * In live mode: fetches real-time average price from exchange API.
     * In backtest mode: calculates VWAP from candles in current timeframe.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @returns Promise resolving to average price
     */
    getAveragePrice: (symbol: string) => Promise<number>;
    /**
     * Formats price according to exchange-specific precision rules.
     *
     * Ensures price meets exchange requirements for decimal places and tick size.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param price - Raw price value to format
     * @returns Promise resolving to formatted price string
     */
    formatPrice: (symbol: string, price: number) => Promise<string>;
    /**
     * Formats quantity according to exchange-specific precision rules.
     *
     * Ensures quantity meets exchange requirements for decimal places and lot size.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param quantity - Raw quantity value to format
     * @returns Promise resolving to formatted quantity string
     */
    formatQuantity: (symbol: string, quantity: number) => Promise<string>;
}

/**
 * Service for managing strategy schema registry.
 *
 * Uses ToolRegistry from functools-kit for type-safe schema storage.
 * Strategies are registered via addStrategy() and retrieved by name.
 */
declare class StrategySchemaService {
    readonly loggerService: LoggerService;
    private _registry;
    /**
     * Registers a new strategy schema.
     *
     * @param key - Unique strategy name
     * @param value - Strategy schema configuration
     * @throws Error if strategy name already exists
     */
    register: (key: StrategyName, value: IStrategySchema) => void;
    /**
     * Validates strategy schema structure for required properties.
     *
     * Performs shallow validation to ensure all required properties exist
     * and have correct types before registration in the registry.
     *
     * @param strategySchema - Strategy schema to validate
     * @throws Error if strategyName is missing or not a string
     * @throws Error if interval is missing or not a valid SignalInterval
     * @throws Error if getSignal is missing or not a function
     */
    private validateShallow;
    /**
     * Overrides an existing strategy schema with partial updates.
     *
     * @param key - Strategy name to override
     * @param value - Partial schema updates
     * @returns Updated strategy schema
     * @throws Error if strategy name doesn't exist
     */
    override: (key: StrategyName, value: Partial<IStrategySchema>) => IStrategySchema;
    /**
     * Retrieves a strategy schema by name.
     *
     * @param key - Strategy name
     * @returns Strategy schema configuration
     * @throws Error if strategy name doesn't exist
     */
    get: (key: StrategyName) => IStrategySchema;
}

/** Type for active position map */
type RiskMap = Map<string, IRiskActivePosition>;
/** Symbol indicating that positions need to be fetched from persistence */
declare const POSITION_NEED_FETCH: unique symbol;
/**
 * ClientRisk implementation for portfolio-level risk management.
 *
 * Provides risk checking logic to prevent signals that violate configured limits:
 * - Maximum concurrent positions (tracks across all strategies)
 * - Custom validations with access to all active positions
 *
 * Multiple ClientStrategy instances share the same ClientRisk instance,
 * allowing cross-strategy risk analysis.
 *
 * Used internally by strategy execution to validate signals before opening positions.
 */
declare class ClientRisk implements IRisk {
    readonly params: IRiskParams;
    /**
     * Map of active positions tracked across all strategies.
     * Key: `${strategyName}:${exchangeName}:${symbol}`
     * Starts as POSITION_NEED_FETCH symbol, gets initialized on first use.
     */
    _activePositions: RiskMap | typeof POSITION_NEED_FETCH;
    constructor(params: IRiskParams);
    /**
     * Initializes active positions by loading from persistence.
     * Uses singleshot pattern to ensure initialization happens exactly once.
     * Skips persistence in backtest mode.
     */
    private waitForInit;
    /**
     * Persists current active positions to disk.
     * Skips in backtest mode.
     */
    private _updatePositions;
    /**
     * Registers a new opened signal.
     * Called by StrategyConnectionService after signal is opened.
     */
    addSignal(symbol: string, context: {
        strategyName: string;
        riskName: string;
        exchangeName: string;
    }): Promise<void>;
    /**
     * Removes a closed signal.
     * Called by StrategyConnectionService when signal is closed.
     */
    removeSignal(symbol: string, context: {
        strategyName: string;
        riskName: string;
        exchangeName: string;
    }): Promise<void>;
    /**
     * Checks if a signal should be allowed based on risk limits.
     *
     * Executes custom validations with access to:
     * - Passthrough params from ClientStrategy (symbol, strategyName, exchangeName, currentPrice, timestamp)
     * - Active positions via this.activePositions getter
     *
     * Returns false immediately if any validation throws error.
     * Triggers callbacks (onRejected, onAllowed) based on result.
     *
     * @param params - Risk check arguments (passthrough from ClientStrategy)
     * @returns Promise resolving to true if allowed, false if rejected
     */
    checkSignal: (params: IRiskCheckArgs) => Promise<boolean>;
}

/**
 * Type definition for risk methods.
 * Maps all keys of IRisk to any type.
 * Used for dynamic method routing in RiskConnectionService.
 */
type TRisk$1 = {
    [key in keyof IRisk]: any;
};
/**
 * Connection service routing risk operations to correct ClientRisk instance.
 *
 * Routes risk checking calls to the appropriate risk implementation
 * based on the provided riskName parameter. Uses memoization to cache
 * ClientRisk instances for performance.
 *
 * Key features:
 * - Explicit risk routing via riskName parameter
 * - Memoized ClientRisk instances by riskName
 * - Risk limit validation for signals
 *
 * Note: riskName is empty string for strategies without risk configuration.
 *
 * @example
 * ```typescript
 * // Used internally by framework
 * const result = await riskConnectionService.checkSignal(
 *   {
 *     symbol: "BTCUSDT",
 *     positionSize: 0.5,
 *     currentPrice: 50000,
 *     portfolioBalance: 100000,
 *     currentDrawdown: 5,
 *     currentPositions: 3,
 *     dailyPnl: -2,
 *     currentSymbolExposure: 8
 *   },
 *   { riskName: "conservative" }
 * );
 * ```
 */
declare class RiskConnectionService implements TRisk$1 {
    private readonly loggerService;
    private readonly riskSchemaService;
    /**
     * Retrieves memoized ClientRisk instance for given risk name, exchange, frame and backtest mode.
     *
     * Creates ClientRisk on first call, returns cached instance on subsequent calls.
     * Cache key includes exchangeName and frameName to isolate risk per exchange+frame.
     *
     * @param riskName - Name of registered risk schema
     * @param exchangeName - Exchange name
     * @param frameName - Frame name (empty string for live)
     * @param backtest - True if backtest mode, false if live mode
     * @returns Configured ClientRisk instance
     */
    getRisk: ((riskName: RiskName, exchangeName: string, frameName: string, backtest: boolean) => ClientRisk) & functools_kit.IClearableMemoize<string> & functools_kit.IControlMemoize<string, ClientRisk>;
    /**
     * Checks if a signal should be allowed based on risk limits.
     *
     * Routes to appropriate ClientRisk instance based on provided context.
     * Validates portfolio drawdown, symbol exposure, position count, and daily loss limits.
     * ClientRisk will emit riskSubject event via onRejected callback when signal is rejected.
     *
     * @param params - Risk check arguments (portfolio state, position details)
     * @param payload - Execution payload with risk name, exchangeName, frameName and backtest mode
     * @returns Promise resolving to risk check result
     */
    checkSignal: (params: IRiskCheckArgs, payload: {
        riskName: RiskName;
        exchangeName: string;
        frameName: string;
        backtest: boolean;
    }) => Promise<boolean>;
    /**
     * Registers an opened signal with the risk management system.
     * Routes to appropriate ClientRisk instance.
     *
     * @param symbol - Trading pair symbol
     * @param payload - Payload information (strategyName, riskName, exchangeName, frameName, backtest)
     */
    addSignal: (symbol: string, payload: {
        strategyName: string;
        riskName: RiskName;
        exchangeName: string;
        frameName: string;
        backtest: boolean;
    }) => Promise<void>;
    /**
     * Removes a closed signal from the risk management system.
     * Routes to appropriate ClientRisk instance.
     *
     * @param symbol - Trading pair symbol
     * @param payload - Payload information (strategyName, riskName, exchangeName, frameName, backtest)
     */
    removeSignal: (symbol: string, payload: {
        strategyName: string;
        riskName: RiskName;
        exchangeName: string;
        frameName: string;
        backtest: boolean;
    }) => Promise<void>;
    /**
     * Clears the cached ClientRisk instance for the given risk name.
     *
     * @param payload - Optional payload with riskName, exchangeName, frameName, backtest (clears all if not provided)
     */
    clear: (payload?: {
        riskName: RiskName;
        exchangeName: string;
        frameName: string;
        backtest: boolean;
    }) => Promise<void>;
}

/**
 * Connection service for partial profit/loss tracking.
 *
 * Provides memoized ClientPartial instances per signal ID.
 * Acts as factory and lifetime manager for ClientPartial objects.
 *
 * Features:
 * - Creates one ClientPartial instance per signal ID (memoized)
 * - Configures instances with logger and event emitter callbacks
 * - Delegates profit/loss/clear operations to appropriate ClientPartial
 * - Cleans up memoized instances when signals are cleared
 *
 * Architecture:
 * - Injected into ClientStrategy via PartialGlobalService
 * - Uses memoize from functools-kit for instance caching
 * - Emits events to partialProfitSubject/partialLossSubject
 *
 * @example
 * ```typescript
 * // Service injected via DI
 * const service = inject<PartialConnectionService>(TYPES.partialConnectionService);
 *
 * // Called by ClientStrategy during signal monitoring
 * await service.profit("BTCUSDT", signal, 55000, 10.0, false, new Date());
 * // Creates or reuses ClientPartial for signal.id
 * // Delegates to ClientPartial.profit()
 *
 * // When signal closes
 * await service.clear("BTCUSDT", signal, 52000);
 * // Clears signal state and removes memoized instance
 * ```
 */
declare class PartialConnectionService implements IPartial {
    /**
     * Logger service injected from DI container.
     */
    private readonly loggerService;
    /**
     * Memoized factory function for ClientPartial instances.
     *
     * Creates one ClientPartial per signal ID and backtest mode with configured callbacks.
     * Instances are cached until clear() is called.
     *
     * Key format: "signalId:backtest" or "signalId:live"
     * Value: ClientPartial instance with logger and event emitters
     */
    private getPartial;
    /**
     * Processes profit state and emits events for newly reached profit levels.
     *
     * Retrieves or creates ClientPartial for signal ID, initializes it if needed,
     * then delegates to ClientPartial.profit() method.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param data - Signal row data
     * @param currentPrice - Current market price
     * @param revenuePercent - Current profit percentage (positive value)
     * @param backtest - True if backtest mode, false if live mode
     * @param when - Event timestamp (current time for live, candle time for backtest)
     * @returns Promise that resolves when profit processing is complete
     */
    profit: (symbol: string, data: ISignalRow, currentPrice: number, revenuePercent: number, backtest: boolean, when: Date) => Promise<void>;
    /**
     * Processes loss state and emits events for newly reached loss levels.
     *
     * Retrieves or creates ClientPartial for signal ID, initializes it if needed,
     * then delegates to ClientPartial.loss() method.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param data - Signal row data
     * @param currentPrice - Current market price
     * @param lossPercent - Current loss percentage (negative value)
     * @param backtest - True if backtest mode, false if live mode
     * @param when - Event timestamp (current time for live, candle time for backtest)
     * @returns Promise that resolves when loss processing is complete
     */
    loss: (symbol: string, data: ISignalRow, currentPrice: number, lossPercent: number, backtest: boolean, when: Date) => Promise<void>;
    /**
     * Clears partial profit/loss state when signal closes.
     *
     * Retrieves ClientPartial for signal ID, initializes if needed,
     * delegates clear operation, then removes memoized instance.
     *
     * Sequence:
     * 1. Get ClientPartial from memoize cache
     * 2. Ensure initialization (waitForInit)
     * 3. Call ClientPartial.clear() - removes state, persists to disk
     * 4. Clear memoized instance - prevents memory leaks
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param data - Signal row data
     * @param priceClose - Final closing price
     * @returns Promise that resolves when clear is complete
     */
    clear: (symbol: string, data: ISignalRow, priceClose: number, backtest: boolean) => Promise<void>;
}

/**
 * Type definition for strategy methods.
 * Maps all keys of IStrategy to any type.
 * Used for dynamic method routing in StrategyConnectionService.
 */
type TStrategy$1 = {
    [key in keyof IStrategy]: any;
};
/**
 * Connection service routing strategy operations to correct ClientStrategy instance.
 *
 * Routes all IStrategy method calls to the appropriate strategy implementation
 * based on symbol-strategy pairs. Uses memoization to cache
 * ClientStrategy instances for performance.
 *
 * Key features:
 * - Automatic strategy routing via symbol-strategy pairs
 * - Memoized ClientStrategy instances by symbol:strategyName
 * - Ensures initialization with waitForInit() before operations
 * - Handles both tick() (live) and backtest() operations
 *
 * @example
 * ```typescript
 * // Used internally by framework
 * const result = await strategyConnectionService.tick(symbol, strategyName);
 * // Routes to correct strategy instance for symbol-strategy pair
 * ```
 */
declare class StrategyConnectionService implements TStrategy$1 {
    readonly loggerService: LoggerService;
    readonly executionContextService: {
        readonly context: IExecutionContext;
    };
    readonly strategySchemaService: StrategySchemaService;
    readonly riskConnectionService: RiskConnectionService;
    readonly exchangeConnectionService: ExchangeConnectionService;
    readonly partialConnectionService: PartialConnectionService;
    /**
     * Retrieves memoized ClientStrategy instance for given symbol-strategy pair with exchange and frame isolation.
     *
     * Creates ClientStrategy on first call, returns cached instance on subsequent calls.
     * Cache key includes exchangeName and frameName for proper isolation.
     *
     * @param symbol - Trading pair symbol
     * @param strategyName - Name of registered strategy schema
     * @param exchangeName - Exchange name
     * @param frameName - Frame name (empty string for live)
     * @param backtest - Whether running in backtest mode
     * @returns Configured ClientStrategy instance
     */
    private getStrategy;
    /**
     * Retrieves the currently active pending signal for the strategy.
     * If no active signal exists, returns null.
     * Used internally for monitoring TP/SL and time expiration.
     *
     * @param backtest - Whether running in backtest mode
     * @param symbol - Trading pair symbol
     * @param context - Execution context with strategyName, exchangeName, frameName
     *
     * @returns Promise resolving to pending signal or null
     */
    getPendingSignal: (backtest: boolean, symbol: string, context: {
        strategyName: StrategyName;
        exchangeName: string;
        frameName: string;
    }) => Promise<ISignalRow | null>;
    /**
     * Retrieves the currently active scheduled signal for the strategy.
     * If no scheduled signal exists, returns null.
     * Used internally for monitoring scheduled signal activation.
     *
     * @param backtest - Whether running in backtest mode
     * @param symbol - Trading pair symbol
     * @param context - Execution context with strategyName, exchangeName, frameName
     *
     * @returns Promise resolving to scheduled signal or null
     */
    getScheduledSignal: (backtest: boolean, symbol: string, context: {
        strategyName: StrategyName;
        exchangeName: string;
        frameName: string;
    }) => Promise<IScheduledSignalRow | null>;
    /**
     * Retrieves the stopped state of the strategy.
     *
     * Delegates to the underlying strategy instance to check if it has been
     * marked as stopped and should cease operation.
     *
     * @param backtest - Whether running in backtest mode
     * @param symbol - Trading pair symbol
     * @param context - Execution context with strategyName, exchangeName, frameName
     * @returns Promise resolving to true if strategy is stopped, false otherwise
     */
    getStopped: (backtest: boolean, symbol: string, context: {
        strategyName: StrategyName;
        exchangeName: string;
        frameName: string;
    }) => Promise<boolean>;
    /**
     * Executes live trading tick for current strategy.
     *
     * Waits for strategy initialization before processing tick.
     * Evaluates current market conditions and returns signal state.
     *
     * @param symbol - Trading pair symbol
     * @param context - Execution context with strategyName, exchangeName, frameName
     * @returns Promise resolving to tick result (idle, opened, active, closed)
     */
    tick: (symbol: string, context: {
        strategyName: StrategyName;
        exchangeName: string;
        frameName: string;
    }) => Promise<IStrategyTickResult>;
    /**
     * Executes backtest for current strategy with provided candles.
     *
     * Waits for strategy initialization before processing candles.
     * Evaluates strategy signals against historical data.
     *
     * @param symbol - Trading pair symbol
     * @param context - Execution context with strategyName, exchangeName, frameName
     * @param candles - Array of historical candle data to backtest
     * @returns Promise resolving to backtest result (signal or idle)
     */
    backtest: (symbol: string, context: {
        strategyName: StrategyName;
        exchangeName: string;
        frameName: string;
    }, candles: ICandleData[]) => Promise<IStrategyBacktestResult>;
    /**
     * Stops the specified strategy from generating new signals.
     *
     * Delegates to ClientStrategy.stop() which sets internal flag to prevent
     * getSignal from being called on subsequent ticks.
     *
     * @param backtest - Whether running in backtest mode
     * @param symbol - Trading pair symbol
     * @param ctx - Context with strategyName, exchangeName, frameName
     * @returns Promise that resolves when stop flag is set
     */
    stop: (backtest: boolean, symbol: string, context: {
        strategyName: StrategyName;
        exchangeName: string;
        frameName: string;
    }) => Promise<void>;
    /**
     * Clears the memoized ClientStrategy instance from cache.
     *
     * Forces re-initialization of strategy on next getStrategy call.
     * Useful for resetting strategy state or releasing resources.
     *
     * @param payload - Optional payload with symbol, context and backtest flag (clears all if not provided)
     */
    clear: (payload?: {
        symbol: string;
        strategyName: StrategyName;
        exchangeName: string;
        frameName: string;
        backtest: boolean;
    }) => Promise<void>;
    /**
     * Cancels the scheduled signal for the specified strategy.
     *
     * Delegates to ClientStrategy.cancel() which clears the scheduled signal
     * without stopping the strategy or affecting pending signals.
     *
     * Note: Cancelled event will be emitted on next tick() call when strategy
     * detects the scheduled signal was cancelled.
     *
     * @param backtest - Whether running in backtest mode
     * @param symbol - Trading pair symbol
     * @param ctx - Context with strategyName, exchangeName, frameName
     * @param cancelId - Optional cancellation ID for user-initiated cancellations
     * @returns Promise that resolves when scheduled signal is cancelled
     */
    cancel: (backtest: boolean, symbol: string, context: {
        strategyName: StrategyName;
        exchangeName: string;
        frameName: string;
    }, cancelId?: string) => Promise<void>;
    /**
     * Executes partial close at profit level (moving toward TP).
     *
     * Closes a percentage of the pending position at the current price, recording it as a "profit" type partial.
     * The partial close is tracked in `_partial` array for weighted PNL calculation when position fully closes.
     *
     * Delegates to ClientStrategy.partialProfit() with current execution context.
     *
     * @param backtest - Whether running in backtest mode
     * @param symbol - Trading pair symbol
     * @param context - Execution context with strategyName, exchangeName, frameName
     * @param percentToClose - Percentage of position to close (0-100, absolute value)
     * @param currentPrice - Current market price for this partial close
     * @returns Promise that resolves when state is updated and persisted
     *
     * @example
     * ```typescript
     * // Close 30% of position at profit
     * await strategyConnectionService.partialProfit(
     *   false,
     *   "BTCUSDT",
     *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "" },
     *   30,
     *   45000
     * );
     * ```
     */
    partialProfit: (backtest: boolean, symbol: string, percentToClose: number, currentPrice: number, context: {
        strategyName: StrategyName;
        exchangeName: string;
        frameName: string;
    }) => Promise<void>;
    /**
     * Executes partial close at loss level (moving toward SL).
     *
     * Closes a percentage of the pending position at the current price, recording it as a "loss" type partial.
     * The partial close is tracked in `_partial` array for weighted PNL calculation when position fully closes.
     *
     * Delegates to ClientStrategy.partialLoss() with current execution context.
     *
     * @param backtest - Whether running in backtest mode
     * @param symbol - Trading pair symbol
     * @param context - Execution context with strategyName, exchangeName, frameName
     * @param percentToClose - Percentage of position to close (0-100, absolute value)
     * @param currentPrice - Current market price for this partial close
     * @returns Promise that resolves when state is updated and persisted
     *
     * @example
     * ```typescript
     * // Close 40% of position at loss
     * await strategyConnectionService.partialLoss(
     *   false,
     *   "BTCUSDT",
     *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "" },
     *   40,
     *   38000
     * );
     * ```
     */
    partialLoss: (backtest: boolean, symbol: string, percentToClose: number, currentPrice: number, context: {
        strategyName: StrategyName;
        exchangeName: string;
        frameName: string;
    }) => Promise<void>;
}

/**
 * Client implementation for backtest timeframe generation.
 *
 * Features:
 * - Generates timestamp arrays for backtest iteration
 * - Singleshot caching prevents redundant generation
 * - Configurable interval spacing (1m to 3d)
 * - Callback support for validation and logging
 *
 * Used by BacktestLogicPrivateService to iterate through historical periods.
 */
declare class ClientFrame implements IFrame {
    readonly params: IFrameParams;
    constructor(params: IFrameParams);
    /**
     * Generates timeframe array for backtest period.
     * Results are cached via singleshot pattern.
     *
     * @param symbol - Trading pair symbol (unused, for API consistency)
     * @returns Promise resolving to array of Date objects
     * @throws Error if interval is invalid
     */
    getTimeframe: ((symbol: string) => Promise<Date[]>) & functools_kit.ISingleshotClearable;
}

/**
 * Connection service routing frame operations to correct ClientFrame instance.
 *
 * Routes all IFrame method calls to the appropriate frame implementation
 * based on methodContextService.context.frameName. Uses memoization to cache
 * ClientFrame instances for performance.
 *
 * Key features:
 * - Automatic frame routing via method context
 * - Memoized ClientFrame instances by frameName
 * - Implements IFrame interface
 * - Backtest timeframe management (startDate, endDate, interval)
 *
 * Note: frameName is empty string for live mode (no frame constraints).
 *
 * @example
 * ```typescript
 * // Used internally by framework
 * const timeframe = await frameConnectionService.getTimeframe("BTCUSDT");
 * // Automatically routes to correct frame based on methodContext
 * ```
 */
declare class FrameConnectionService implements IFrame {
    private readonly loggerService;
    private readonly frameSchemaService;
    private readonly methodContextService;
    /**
     * Retrieves memoized ClientFrame instance for given frame name.
     *
     * Creates ClientFrame on first call, returns cached instance on subsequent calls.
     * Cache key is frameName string.
     *
     * @param frameName - Name of registered frame schema
     * @returns Configured ClientFrame instance
     */
    getFrame: ((frameName: FrameName) => ClientFrame) & functools_kit.IClearableMemoize<string> & functools_kit.IControlMemoize<string, ClientFrame>;
    /**
     * Retrieves backtest timeframe boundaries for symbol.
     *
     * Returns startDate and endDate from frame configuration.
     * Used to limit backtest execution to specific date range.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @returns Promise resolving to { startDate: Date, endDate: Date }
     */
    getTimeframe: (symbol: string, frameName: string) => Promise<Date[]>;
}

/**
 * Client implementation for position sizing calculation.
 *
 * Features:
 * - Multiple sizing methods (fixed %, Kelly, ATR)
 * - Min/max position constraints
 * - Max position percentage limit
 * - Callback support for validation and logging
 *
 * Used by strategy execution to determine optimal position sizes.
 */
declare class ClientSizing implements ISizing {
    readonly params: ISizingParams;
    constructor(params: ISizingParams);
    /**
     * Calculates position size based on configured method and constraints.
     *
     * @param params - Calculation parameters (symbol, balance, prices, etc.)
     * @returns Promise resolving to calculated position size
     * @throws Error if required parameters are missing or invalid
     */
    calculate(params: ISizingCalculateParams): Promise<number>;
}

/**
 * Type definition for sizing methods.
 * Maps all keys of ISizing to any type.
 * Used for dynamic method routing in SizingConnectionService.
 */
type TSizing$1 = {
    [key in keyof ISizing]: any;
};
/**
 * Connection service routing sizing operations to correct ClientSizing instance.
 *
 * Routes sizing method calls to the appropriate sizing implementation
 * based on the provided sizingName parameter. Uses memoization to cache
 * ClientSizing instances for performance.
 *
 * Key features:
 * - Explicit sizing routing via sizingName parameter
 * - Memoized ClientSizing instances by sizingName
 * - Position size calculation with risk management
 *
 * Note: sizingName is empty string for strategies without sizing configuration.
 *
 * @example
 * ```typescript
 * // Used internally by framework
 * const quantity = await sizingConnectionService.calculate(
 *   {
 *     symbol: "BTCUSDT",
 *     accountBalance: 10000,
 *     priceOpen: 50000,
 *     priceStopLoss: 49000,
 *     method: "fixed-percentage"
 *   },
 *   { sizingName: "conservative" }
 * );
 * ```
 */
declare class SizingConnectionService implements TSizing$1 {
    private readonly loggerService;
    private readonly sizingSchemaService;
    /**
     * Retrieves memoized ClientSizing instance for given sizing name.
     *
     * Creates ClientSizing on first call, returns cached instance on subsequent calls.
     * Cache key is sizingName string.
     *
     * @param sizingName - Name of registered sizing schema
     * @returns Configured ClientSizing instance
     */
    getSizing: ((sizingName: SizingName) => ClientSizing) & functools_kit.IClearableMemoize<string> & functools_kit.IControlMemoize<string, ClientSizing>;
    /**
     * Calculates position size based on risk parameters and configured method.
     *
     * Routes to appropriate ClientSizing instance based on provided context.
     * Supports multiple sizing methods: fixed-percentage, kelly-criterion, atr-based.
     *
     * @param params - Calculation parameters (symbol, balance, prices, method-specific data)
     * @param context - Execution context with sizing name
     * @returns Promise resolving to calculated position size
     */
    calculate: (params: ISizingCalculateParams, context: {
        sizingName: SizingName;
    }) => Promise<number>;
}

/**
 * Type definition for exchange methods.
 * Maps all keys of IExchange to any type.
 * Used for dynamic method routing in ExchangeCoreService.
 */
type TExchange = {
    [key in keyof IExchange]: any;
};
/**
 * Global service for exchange operations with execution context injection.
 *
 * Wraps ExchangeConnectionService with ExecutionContextService to inject
 * symbol, when, and backtest parameters into the execution context.
 *
 * Used internally by BacktestLogicPrivateService and LiveLogicPrivateService.
 */
declare class ExchangeCoreService implements TExchange {
    private readonly loggerService;
    private readonly exchangeConnectionService;
    private readonly methodContextService;
    private readonly exchangeValidationService;
    /**
     * Validates exchange configuration.
     * Memoized to avoid redundant validations for the same exchange.
     * Logs validation activity.
     * @param exchangeName - Name of the exchange to validate
     * @returns Promise that resolves when validation is complete
     */
    private validate;
    /**
     * Fetches historical candles with execution context.
     *
     * @param symbol - Trading pair symbol
     * @param interval - Candle interval (e.g., "1m", "1h")
     * @param limit - Maximum number of candles to fetch
     * @param when - Timestamp for context (used in backtest mode)
     * @param backtest - Whether running in backtest mode
     * @returns Promise resolving to array of candles
     */
    getCandles: (symbol: string, interval: CandleInterval, limit: number, when: Date, backtest: boolean) => Promise<ICandleData[]>;
    /**
     * Fetches future candles (backtest mode only) with execution context.
     *
     * @param symbol - Trading pair symbol
     * @param interval - Candle interval
     * @param limit - Maximum number of candles to fetch
     * @param when - Timestamp for context
     * @param backtest - Whether running in backtest mode (must be true)
     * @returns Promise resolving to array of future candles
     */
    getNextCandles: (symbol: string, interval: CandleInterval, limit: number, when: Date, backtest: boolean) => Promise<ICandleData[]>;
    /**
     * Calculates VWAP with execution context.
     *
     * @param symbol - Trading pair symbol
     * @param when - Timestamp for context
     * @param backtest - Whether running in backtest mode
     * @returns Promise resolving to VWAP price
     */
    getAveragePrice: (symbol: string, when: Date, backtest: boolean) => Promise<number>;
    /**
     * Formats price with execution context.
     *
     * @param symbol - Trading pair symbol
     * @param price - Price to format
     * @param when - Timestamp for context
     * @param backtest - Whether running in backtest mode
     * @returns Promise resolving to formatted price string
     */
    formatPrice: (symbol: string, price: number, when: Date, backtest: boolean) => Promise<string>;
    /**
     * Formats quantity with execution context.
     *
     * @param symbol - Trading pair symbol
     * @param quantity - Quantity to format
     * @param when - Timestamp for context
     * @param backtest - Whether running in backtest mode
     * @returns Promise resolving to formatted quantity string
     */
    formatQuantity: (symbol: string, quantity: number, when: Date, backtest: boolean) => Promise<string>;
}

/**
 * Type definition for strategy methods.
 * Maps all keys of IStrategy to any type.
 * Used for dynamic method routing in StrategyCoreService.
 */
type TStrategy = {
    [key in keyof IStrategy]: any;
};
/**
 * Global service for strategy operations with execution context injection.
 *
 * Wraps StrategyConnectionService with ExecutionContextService to inject
 * symbol, when, and backtest parameters into the execution context.
 *
 * Used internally by BacktestLogicPrivateService and LiveLogicPrivateService.
 */
declare class StrategyCoreService implements TStrategy {
    private readonly loggerService;
    private readonly strategyConnectionService;
    private readonly strategySchemaService;
    private readonly riskValidationService;
    private readonly strategyValidationService;
    /**
     * Validates strategy and associated risk configuration.
     *
     * Memoized to avoid redundant validations for the same symbol-strategy-exchange-frame combination.
     * Logs validation activity.
     * @param symbol - Trading pair symbol
     * @param context - Execution context with strategyName, exchangeName, frameName
     * @returns Promise that resolves when validation is complete
     */
    private validate;
    /**
     * Retrieves the currently active pending signal for the symbol.
     * If no active signal exists, returns null.
     * Used internally for monitoring TP/SL and time expiration.
     *
     * @param backtest - Whether running in backtest mode
     * @param symbol - Trading pair symbol
     * @param context - Execution context with strategyName, exchangeName, frameName
     * @returns Promise resolving to pending signal or null
     */
    getPendingSignal: (backtest: boolean, symbol: string, context: {
        strategyName: StrategyName;
        exchangeName: string;
        frameName: string;
    }) => Promise<ISignalRow | null>;
    /**
     * Retrieves the currently active scheduled signal for the symbol.
     * If no scheduled signal exists, returns null.
     * Used internally for monitoring scheduled signal activation.
     *
     * @param backtest - Whether running in backtest mode
     * @param symbol - Trading pair symbol
     * @param context - Execution context with strategyName, exchangeName, frameName
     * @returns Promise resolving to scheduled signal or null
     */
    getScheduledSignal: (backtest: boolean, symbol: string, context: {
        strategyName: StrategyName;
        exchangeName: string;
        frameName: string;
    }) => Promise<IScheduledSignalRow | null>;
    /**
     * Checks if the strategy has been stopped.
     *
     * Validates strategy existence and delegates to connection service
     * to retrieve the stopped state from the strategy instance.
     *
     * @param backtest - Whether running in backtest mode
     * @param symbol - Trading pair symbol
     * @param context - Execution context with strategyName, exchangeName, frameName
     * @returns Promise resolving to true if strategy is stopped, false otherwise
     */
    getStopped: (backtest: boolean, symbol: string, context: {
        strategyName: StrategyName;
        exchangeName: string;
        frameName: string;
    }) => Promise<boolean>;
    /**
     * Checks signal status at a specific timestamp.
     *
     * Wraps strategy tick() with execution context containing symbol, timestamp,
     * and backtest mode flag.
     *
     * @param symbol - Trading pair symbol
     * @param when - Timestamp for tick evaluation
     * @param backtest - Whether running in backtest mode
     * @param context - Execution context with strategyName, exchangeName, frameName
     * @returns Discriminated union of tick result (idle, opened, active, closed)
     */
    tick: (symbol: string, when: Date, backtest: boolean, context: {
        strategyName: StrategyName;
        exchangeName: string;
        frameName: string;
    }) => Promise<IStrategyTickResult>;
    /**
     * Runs fast backtest against candle array.
     *
     * Wraps strategy backtest() with execution context containing symbol,
     * timestamp, and backtest mode flag.
     *
     * @param symbol - Trading pair symbol
     * @param candles - Array of historical candles to test against
     * @param when - Starting timestamp for backtest
     * @param backtest - Whether running in backtest mode (typically true)
     * @param context - Execution context with strategyName, exchangeName, frameName
     * @returns Closed signal result with PNL
     */
    backtest: (symbol: string, candles: ICandleData[], when: Date, backtest: boolean, context: {
        strategyName: StrategyName;
        exchangeName: string;
        frameName: string;
    }) => Promise<IStrategyBacktestResult>;
    /**
     * Stops the strategy from generating new signals.
     *
     * Delegates to StrategyConnectionService.stop() to set internal flag.
     * Does not require execution context.
     *
     * @param backtest - Whether running in backtest mode
     * @param symbol - Trading pair symbol
     * @param ctx - Context with strategyName, exchangeName, frameName
     * @returns Promise that resolves when stop flag is set
     */
    stop: (backtest: boolean, symbol: string, context: {
        strategyName: StrategyName;
        exchangeName: string;
        frameName: string;
    }) => Promise<void>;
    /**
     * Cancels the scheduled signal without stopping the strategy.
     *
     * Delegates to StrategyConnectionService.cancel() to clear scheduled signal
     * and emit cancelled event through emitters.
     * Does not require execution context.
     *
     * @param backtest - Whether running in backtest mode
     * @param symbol - Trading pair symbol
     * @param ctx - Context with strategyName, exchangeName, frameName
     * @param cancelId - Optional cancellation ID for user-initiated cancellations
     * @returns Promise that resolves when scheduled signal is cancelled
     */
    cancel: (backtest: boolean, symbol: string, context: {
        strategyName: StrategyName;
        exchangeName: string;
        frameName: string;
    }, cancelId?: string) => Promise<void>;
    /**
     * Clears the memoized ClientStrategy instance from cache.
     *
     * Delegates to StrategyConnectionService.clear() to remove strategy from cache.
     * Forces re-initialization of strategy on next operation.
     *
     * @param payload - Optional payload with symbol, context and backtest flag (clears all if not provided)
     */
    clear: (payload?: {
        symbol: string;
        strategyName: StrategyName;
        exchangeName: string;
        frameName: string;
        backtest: boolean;
    }) => Promise<void>;
    /**
     * Executes partial close at profit level (moving toward TP).
     *
     * Validates strategy existence and delegates to connection service
     * to close a percentage of the pending position at profit.
     *
     * Does not require execution context as this is a direct state mutation.
     *
     * @param backtest - Whether running in backtest mode
     * @param symbol - Trading pair symbol
     * @param percentToClose - Percentage of position to close (0-100, absolute value)
     * @param currentPrice - Current market price for this partial close (must be in profit direction)
     * @param context - Execution context with strategyName, exchangeName, frameName
     * @returns Promise that resolves when state is updated and persisted
     *
     * @example
     * ```typescript
     * // Close 30% of position at profit
     * await strategyCoreService.partialProfit(
     *   false,
     *   "BTCUSDT",
     *   30,
     *   45000,
     *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "" }
     * );
     * ```
     */
    partialProfit: (backtest: boolean, symbol: string, percentToClose: number, currentPrice: number, context: {
        strategyName: StrategyName;
        exchangeName: string;
        frameName: string;
    }) => Promise<void>;
    /**
     * Executes partial close at loss level (moving toward SL).
     *
     * Validates strategy existence and delegates to connection service
     * to close a percentage of the pending position at loss.
     *
     * Does not require execution context as this is a direct state mutation.
     *
     * @param backtest - Whether running in backtest mode
     * @param symbol - Trading pair symbol
     * @param percentToClose - Percentage of position to close (0-100, absolute value)
     * @param currentPrice - Current market price for this partial close (must be in loss direction)
     * @param context - Execution context with strategyName, exchangeName, frameName
     * @returns Promise that resolves when state is updated and persisted
     *
     * @example
     * ```typescript
     * // Close 40% of position at loss
     * await strategyCoreService.partialLoss(
     *   false,
     *   "BTCUSDT",
     *   40,
     *   38000,
     *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "" }
     * );
     * ```
     */
    partialLoss: (backtest: boolean, symbol: string, percentToClose: number, currentPrice: number, context: {
        strategyName: StrategyName;
        exchangeName: string;
        frameName: string;
    }) => Promise<void>;
}

/**
 * Type definition for frame methods.
 * Maps all keys of IFrame to any type.
 * Used for dynamic method routing in FrameCoreService.
 */
type TFrame = {
    [key in keyof IFrame]: any;
};
/**
 * Global service for frame operations.
 *
 * Wraps FrameConnectionService for timeframe generation.
 * Used internally by BacktestLogicPrivateService.
 */
declare class FrameCoreService implements TFrame {
    private readonly loggerService;
    private readonly frameConnectionService;
    private readonly frameValidationService;
    /**
     * Generates timeframe array for backtest iteration.
     *
     * @param frameName - Target frame name (e.g., "1m", "1h")
     * @returns Promise resolving to array of Date objects
     */
    getTimeframe: (symbol: string, frameName: string) => Promise<Date[]>;
}

/**
 * Type definition for sizing methods.
 * Maps all keys of ISizing to any type.
 * Used for dynamic method routing in SizingGlobalService.
 */
type TSizing = {
    [key in keyof ISizing]: any;
};
/**
 * Global service for sizing operations.
 *
 * Wraps SizingConnectionService for position size calculation.
 * Used internally by strategy execution and public API.
 */
declare class SizingGlobalService implements TSizing {
    private readonly loggerService;
    private readonly sizingConnectionService;
    private readonly sizingValidationService;
    /**
     * Calculates position size based on risk parameters.
     *
     * @param params - Calculation parameters (symbol, balance, prices, method-specific data)
     * @param context - Execution context with sizing name
     * @returns Promise resolving to calculated position size
     */
    calculate: (params: ISizingCalculateParams, context: {
        sizingName: SizingName;
    }) => Promise<number>;
}

/**
 * Type definition for risk methods.
 * Maps all keys of IRisk to any type.
 * Used for dynamic method routing in RiskGlobalService.
 */
type TRisk = {
    [key in keyof IRisk]: any;
};
/**
 * Global service for risk operations.
 *
 * Wraps RiskConnectionService for risk limit validation.
 * Used internally by strategy execution and public API.
 */
declare class RiskGlobalService implements TRisk {
    private readonly loggerService;
    private readonly riskConnectionService;
    private readonly riskValidationService;
    /**
     * Validates risk configuration.
     * Memoized to avoid redundant validations for the same risk-exchange-frame combination.
     * Logs validation activity.
     * @param payload - Payload with riskName, exchangeName and frameName
     * @returns Promise that resolves when validation is complete
     */
    private validate;
    /**
     * Checks if a signal should be allowed based on risk limits.
     *
     * @param params - Risk check arguments (portfolio state, position details)
     * @param payload - Execution payload with risk name, exchangeName, frameName and backtest mode
     * @returns Promise resolving to risk check result
     */
    checkSignal: (params: IRiskCheckArgs, payload: {
        riskName: RiskName;
        exchangeName: string;
        frameName: string;
        backtest: boolean;
    }) => Promise<boolean>;
    /**
     * Registers an opened signal with the risk management system.
     *
     * @param symbol - Trading pair symbol
     * @param payload - Payload information (strategyName, riskName, exchangeName, frameName, backtest)
     */
    addSignal: (symbol: string, payload: {
        strategyName: string;
        riskName: RiskName;
        exchangeName: string;
        frameName: string;
        backtest: boolean;
    }) => Promise<void>;
    /**
     * Removes a closed signal from the risk management system.
     *
     * @param symbol - Trading pair symbol
     * @param payload - Payload information (strategyName, riskName, exchangeName, frameName, backtest)
     */
    removeSignal: (symbol: string, payload: {
        strategyName: string;
        riskName: RiskName;
        exchangeName: string;
        frameName: string;
        backtest: boolean;
    }) => Promise<void>;
    /**
     * Clears risk data.
     * If payload is provided, clears data for that specific risk instance.
     * If no payload is provided, clears all risk data.
     * @param payload - Optional payload with riskName, exchangeName, frameName, backtest (clears all if not provided)
     */
    clear: (payload?: {
        riskName: RiskName;
        exchangeName: string;
        frameName: string;
        backtest: boolean;
    }) => Promise<void>;
}

/**
 * Global service providing access to walker functionality.
 *
 * Simple wrapper around WalkerLogicPublicService for dependency injection.
 * Used by public API exports.
 */
declare class WalkerCommandService {
    private readonly loggerService;
    private readonly walkerLogicPublicService;
    private readonly walkerSchemaService;
    private readonly strategyValidationService;
    private readonly exchangeValidationService;
    private readonly frameValidationService;
    private readonly walkerValidationService;
    private readonly strategySchemaService;
    private readonly riskValidationService;
    /**
     * Runs walker comparison for a symbol with context propagation.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param context - Walker context with strategies and metric
     */
    run: (symbol: string, context: {
        walkerName: string;
        exchangeName: string;
        frameName: string;
    }) => AsyncGenerator<WalkerContract, any, any>;
}

/**
 * Service for managing exchange schema registry.
 *
 * Uses ToolRegistry from functools-kit for type-safe schema storage.
 * Exchanges are registered via addExchange() and retrieved by name.
 */
declare class ExchangeSchemaService {
    readonly loggerService: LoggerService;
    private _registry;
    /**
     * Registers a new exchange schema.
     *
     * @param key - Unique exchange name
     * @param value - Exchange schema configuration
     * @throws Error if exchange name already exists
     */
    register: (key: ExchangeName, value: IExchangeSchema) => void;
    /**
     * Validates exchange schema structure for required properties.
     *
     * Performs shallow validation to ensure all required properties exist
     * and have correct types before registration in the registry.
     *
     * @param exchangeSchema - Exchange schema to validate
     * @throws Error if exchangeName is missing or not a string
     * @throws Error if getCandles is missing or not a function
     * @throws Error if formatPrice is missing or not a function
     * @throws Error if formatQuantity is missing or not a function
     */
    private validateShallow;
    /**
     * Overrides an existing exchange schema with partial updates.
     *
     * @param key - Exchange name to override
     * @param value - Partial schema updates
     * @returns Updated exchange schema
     * @throws Error if exchange name doesn't exist
     */
    override: (key: ExchangeName, value: Partial<IExchangeSchema>) => IExchangeSchema;
    /**
     * Retrieves an exchange schema by name.
     *
     * @param key - Exchange name
     * @returns Exchange schema configuration
     * @throws Error if exchange name doesn't exist
     */
    get: (key: ExchangeName) => IExchangeSchema;
}

/**
 * Service for managing frame schema registry.
 *
 * Uses ToolRegistry from functools-kit for type-safe schema storage.
 * Frames are registered via addFrame() and retrieved by name.
 */
declare class FrameSchemaService {
    readonly loggerService: LoggerService;
    private _registry;
    /**
     * Registers a new frame schema.
     *
     * @param key - Unique frame name
     * @param value - Frame schema configuration
     * @throws Error if frame name already exists
     */
    register(key: FrameName, value: IFrameSchema): void;
    /**
     * Validates frame schema structure for required properties.
     *
     * Performs shallow validation to ensure all required properties exist
     * and have correct types before registration in the registry.
     *
     * @param frameSchema - Frame schema to validate
     * @throws Error if frameName is missing or not a string
     * @throws Error if interval is missing or not a valid FrameInterval
     * @throws Error if startDate is missing or not a Date
     * @throws Error if endDate is missing or not a Date
     */
    private validateShallow;
    /**
     * Overrides an existing frame schema with partial updates.
     *
     * @param key - Frame name to override
     * @param value - Partial schema updates
     * @throws Error if frame name doesn't exist
     */
    override(key: FrameName, value: Partial<IFrameSchema>): IFrameSchema;
    /**
     * Retrieves a frame schema by name.
     *
     * @param key - Frame name
     * @returns Frame schema configuration
     * @throws Error if frame name doesn't exist
     */
    get(key: FrameName): IFrameSchema;
}

/**
 * Service for managing sizing schema registry.
 *
 * Uses ToolRegistry from functools-kit for type-safe schema storage.
 * Sizing schemas are registered via addSizing() and retrieved by name.
 */
declare class SizingSchemaService {
    readonly loggerService: LoggerService;
    private _registry;
    /**
     * Registers a new sizing schema.
     *
     * @param key - Unique sizing name
     * @param value - Sizing schema configuration
     * @throws Error if sizing name already exists
     */
    register(key: SizingName, value: ISizingSchema): void;
    /**
     * Validates sizing schema structure for required properties.
     *
     * Performs shallow validation to ensure all required properties exist
     * and have correct types before registration in the registry.
     *
     * @param sizingSchema - Sizing schema to validate
     * @throws Error if sizingName is missing or not a string
     * @throws Error if method is missing or not a valid sizing method
     * @throws Error if required method-specific fields are missing
     */
    private validateShallow;
    /**
     * Overrides an existing sizing schema with partial updates.
     *
     * @param key - Sizing name to override
     * @param value - Partial schema updates
     * @throws Error if sizing name doesn't exist
     */
    override(key: SizingName, value: Partial<ISizingSchema>): ISizingSchema;
    /**
     * Retrieves a sizing schema by name.
     *
     * @param key - Sizing name
     * @returns Sizing schema configuration
     * @throws Error if sizing name doesn't exist
     */
    get(key: SizingName): ISizingSchema;
}

/**
 * Service for managing risk schema registry.
 *
 * Uses ToolRegistry from functools-kit for type-safe schema storage.
 * Risk profiles are registered via addRisk() and retrieved by name.
 */
declare class RiskSchemaService {
    readonly loggerService: LoggerService;
    private _registry;
    /**
     * Registers a new risk schema.
     *
     * @param key - Unique risk profile name
     * @param value - Risk schema configuration
     * @throws Error if risk name already exists
     */
    register: (key: RiskName, value: IRiskSchema) => void;
    /**
     * Validates risk schema structure for required properties.
     *
     * Performs shallow validation to ensure all required properties exist
     * and have correct types before registration in the registry.
     *
     * @param riskSchema - Risk schema to validate
     * @throws Error if riskName is missing or not a string
     */
    private validateShallow;
    /**
     * Overrides an existing risk schema with partial updates.
     *
     * @param key - Risk name to override
     * @param value - Partial schema updates
     * @returns Updated risk schema
     * @throws Error if risk name doesn't exist
     */
    override: (key: RiskName, value: Partial<IRiskSchema>) => IRiskSchema;
    /**
     * Retrieves a risk schema by name.
     *
     * @param key - Risk name
     * @returns Risk schema configuration
     * @throws Error if risk name doesn't exist
     */
    get: (key: RiskName) => IRiskSchema;
}

/**
 * Service for managing walker schema registry.
 *
 * Uses ToolRegistry from functools-kit for type-safe schema storage.
 * Walkers are registered via addWalker() and retrieved by name.
 */
declare class WalkerSchemaService {
    readonly loggerService: LoggerService;
    private _registry;
    /**
     * Registers a new walker schema.
     *
     * @param key - Unique walker name
     * @param value - Walker schema configuration
     * @throws Error if walker name already exists
     */
    register: (key: WalkerName, value: IWalkerSchema) => void;
    /**
     * Validates walker schema structure for required properties.
     *
     * Performs shallow validation to ensure all required properties exist
     * and have correct types before registration in the registry.
     *
     * @param walkerSchema - Walker schema to validate
     * @throws Error if walkerName is missing or not a string
     * @throws Error if exchangeName is missing or not a string
     * @throws Error if frameName is missing or not a string
     * @throws Error if strategies is missing or not an array
     * @throws Error if strategies array is empty
     */
    private validateShallow;
    /**
     * Overrides an existing walker schema with partial updates.
     *
     * @param key - Walker name to override
     * @param value - Partial schema updates
     * @returns Updated walker schema
     * @throws Error if walker name doesn't exist
     */
    override: (key: WalkerName, value: Partial<IWalkerSchema>) => IWalkerSchema;
    /**
     * Retrieves a walker schema by name.
     *
     * @param key - Walker name
     * @returns Walker schema configuration
     * @throws Error if walker name doesn't exist
     */
    get: (key: WalkerName) => IWalkerSchema;
}

/**
 * Private service for backtest orchestration using async generators.
 *
 * Flow:
 * 1. Get timeframes from frame service
 * 2. Iterate through timeframes calling tick()
 * 3. When signal opens: fetch candles and call backtest()
 * 4. Skip timeframes until signal closes
 * 5. Yield closed result and continue
 *
 * Memory efficient: streams results without array accumulation.
 * Supports early termination via break in consumer.
 */
declare class BacktestLogicPrivateService {
    private readonly loggerService;
    private readonly strategyCoreService;
    private readonly exchangeCoreService;
    private readonly frameCoreService;
    private readonly methodContextService;
    /**
     * Runs backtest for a symbol, streaming closed signals as async generator.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @yields Closed signal results with PNL
     *
     * @example
     * ```typescript
     * for await (const result of backtestLogic.run("BTCUSDT")) {
     *   console.log(result.closeReason, result.pnl.pnlPercentage);
     *   if (result.pnl.pnlPercentage < -10) break; // Early termination
     * }
     * ```
     */
    run(symbol: string): AsyncGenerator<IStrategyBacktestResult, void, unknown>;
}

/**
 * Private service for live trading orchestration using async generators.
 *
 * Flow:
 * 1. Infinite while(true) loop for continuous monitoring
 * 2. Create real-time date with new Date()
 * 3. Call tick() to check signal status
 * 4. Yield opened/closed results (skip idle/active)
 * 5. Sleep for TICK_TTL between iterations
 *
 * Features:
 * - Crash recovery via ClientStrategy.waitForInit()
 * - Real-time progression with new Date()
 * - Memory efficient streaming
 * - Never completes (infinite generator)
 */
declare class LiveLogicPrivateService {
    private readonly loggerService;
    private readonly strategyCoreService;
    private readonly methodContextService;
    /**
     * Runs live trading for a symbol, streaming results as async generator.
     *
     * Infinite generator that yields opened and closed signals.
     * Process can crash and restart - state will be recovered from disk.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @yields Opened and closed signal results
     *
     * @example
     * ```typescript
     * for await (const result of liveLogic.run("BTCUSDT")) {
     *   if (result.action === "opened") {
     *     console.log("New signal:", result.signal.id);
     *   }
     *   if (result.action === "closed") {
     *     console.log("PNL:", result.pnl.pnlPercentage);
     *   }
     *   // Infinite loop - will never complete
     * }
     * ```
     */
    run(symbol: string): AsyncGenerator<IStrategyTickResultOpened | IStrategyTickResultClosed, void, unknown>;
}

/**
 * Private service for walker orchestration (strategy comparison).
 *
 * Flow:
 * 1. Yields progress updates as each strategy completes
 * 2. Tracks best metric in real-time
 * 3. Returns final results with all strategies ranked
 *
 * Uses BacktestLogicPublicService internally for each strategy.
 */
declare class WalkerLogicPrivateService {
    private readonly loggerService;
    private readonly backtestLogicPublicService;
    private readonly backtestMarkdownService;
    private readonly walkerSchemaService;
    /**
     * Runs walker comparison for a symbol.
     *
     * Executes backtest for each strategy sequentially.
     * Yields WalkerContract after each strategy completes.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param strategies - List of strategy names to compare
     * @param metric - Metric to use for comparison
     * @param context - Walker context with exchangeName, frameName, walkerName
     * @yields WalkerContract with progress after each strategy
     *
     * @example
     * ```typescript
     * for await (const progress of walkerLogic.run(
     *   "BTCUSDT",
     *   ["strategy-v1", "strategy-v2"],
     *   "sharpeRatio",
     *   {
     *     exchangeName: "binance",
     *     frameName: "1d-backtest",
     *     walkerName: "my-optimizer"
     *   }
     * )) {
     *   console.log("Progress:", progress.strategiesTested, "/", progress.totalStrategies);
     * }
     * ```
     */
    run(symbol: string, strategies: StrategyName[], metric: WalkerMetric, context: {
        exchangeName: string;
        frameName: string;
        walkerName: string;
    }): AsyncGenerator<WalkerContract>;
}

/**
 * Public service for backtest orchestration with context management.
 *
 * Wraps BacktestLogicPrivateService with MethodContextService to provide
 * implicit context propagation for strategyName, exchangeName, and frameName.
 *
 * This allows getCandles(), getSignal(), and other functions to work without
 * explicit context parameters.
 *
 * @example
 * ```typescript
 * const backtestLogicPublicService = inject(TYPES.backtestLogicPublicService);
 *
 * for await (const result of backtestLogicPublicService.run("BTCUSDT", {
 *   strategyName: "my-strategy",
 *   exchangeName: "my-exchange",
 *   frameName: "1d-backtest",
 * })) {
 *   if (result.action === "closed") {
 *     console.log("PNL:", result.pnl.profit);
 *   }
 * }
 * ```
 */
declare class BacktestLogicPublicService {
    private readonly loggerService;
    private readonly backtestLogicPrivateService;
    /**
     * Runs backtest for a symbol with context propagation.
     *
     * Streams closed signals as async generator. Context is automatically
     * injected into all framework functions called during iteration.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param context - Execution context with strategy, exchange, and frame names
     * @returns Async generator yielding closed signals with PNL
     */
    run: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
        frameName: string;
    }) => AsyncGenerator<IStrategyBacktestResult, void, unknown>;
}

/**
 * Public service for live trading orchestration with context management.
 *
 * Wraps LiveLogicPrivateService with MethodContextService to provide
 * implicit context propagation for strategyName and exchangeName.
 *
 * This allows getCandles(), getSignal(), and other functions to work without
 * explicit context parameters.
 *
 * Features:
 * - Infinite async generator (never completes)
 * - Crash recovery via persisted state
 * - Real-time progression with Date.now()
 *
 * @example
 * ```typescript
 * const liveLogicPublicService = inject(TYPES.liveLogicPublicService);
 *
 * // Infinite loop - use Ctrl+C to stop
 * for await (const result of liveLogicPublicService.run("BTCUSDT", {
 *   strategyName: "my-strategy",
 *   exchangeName: "my-exchange",
 * })) {
 *   if (result.action === "opened") {
 *     console.log("Signal opened:", result.signal);
 *   } else if (result.action === "closed") {
 *     console.log("PNL:", result.pnl.profit);
 *   }
 * }
 * ```
 */
declare class LiveLogicPublicService {
    private readonly loggerService;
    private readonly liveLogicPrivateService;
    /**
     * Runs live trading for a symbol with context propagation.
     *
     * Streams opened and closed signals as infinite async generator.
     * Context is automatically injected into all framework functions.
     * Process can crash and restart - state will be recovered from disk.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param context - Execution context with strategy and exchange names
     * @returns Infinite async generator yielding opened and closed signals
     */
    run: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
    }) => AsyncGenerator<IStrategyTickResultOpened | IStrategyTickResultClosed, void, unknown>;
}

/**
 * Public service for walker orchestration with context management.
 *
 * Wraps WalkerLogicPrivateService with MethodContextService to provide
 * implicit context propagation for strategyName, exchangeName, frameName, and walkerName.
 *
 * @example
 * ```typescript
 * const walkerLogicPublicService = inject(TYPES.walkerLogicPublicService);
 *
 * const results = await walkerLogicPublicService.run("BTCUSDT", {
 *   walkerName: "my-optimizer",
 *   exchangeName: "binance",
 *   frameName: "1d-backtest",
 *   strategies: ["strategy-v1", "strategy-v2"],
 *   metric: "sharpeRatio",
 * });
 *
 * console.log("Best strategy:", results.bestStrategy);
 * ```
 */
declare class WalkerLogicPublicService {
    private readonly loggerService;
    private readonly walkerLogicPrivateService;
    private readonly walkerSchemaService;
    /**
     * Runs walker comparison for a symbol with context propagation.
     *
     * Executes backtests for all strategies.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param context - Walker context with strategies and metric
     */
    run: (symbol: string, context: {
        walkerName: string;
        exchangeName: string;
        frameName: string;
    }) => AsyncGenerator<WalkerContract, any, any>;
}

/**
 * Global service providing access to live trading functionality.
 *
 * Simple wrapper around LiveLogicPublicService for dependency injection.
 * Used by public API exports.
 */
declare class LiveCommandService {
    private readonly loggerService;
    private readonly liveLogicPublicService;
    private readonly strategyValidationService;
    private readonly exchangeValidationService;
    private readonly strategySchemaService;
    private readonly riskValidationService;
    /**
     * Runs live trading for a symbol with context propagation.
     *
     * Infinite async generator with crash recovery support.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param context - Execution context with strategy and exchange names
     * @returns Infinite async generator yielding opened and closed signals
     */
    run: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
    }) => AsyncGenerator<IStrategyTickResultOpened | IStrategyTickResultClosed, void, unknown>;
}

/**
 * Global service providing access to backtest functionality.
 *
 * Simple wrapper around BacktestLogicPublicService for dependency injection.
 * Used by public API exports.
 */
declare class BacktestCommandService {
    private readonly loggerService;
    private readonly strategySchemaService;
    private readonly riskValidationService;
    private readonly backtestLogicPublicService;
    private readonly strategyValidationService;
    private readonly exchangeValidationService;
    private readonly frameValidationService;
    /**
     * Runs backtest for a symbol with context propagation.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param context - Execution context with strategy, exchange, and frame names
     * @returns Async generator yielding closed signals with PNL
     */
    run: (symbol: string, context: {
        strategyName: string;
        exchangeName: string;
        frameName: string;
    }) => AsyncGenerator<IStrategyBacktestResult, void, unknown>;
}

/**
 * Service for managing and validating exchange configurations.
 *
 * Maintains a registry of all configured exchanges and validates
 * their existence before operations. Uses memoization for performance.
 *
 * Key features:
 * - Registry management: addExchange() to register new exchanges
 * - Validation: validate() ensures exchange exists before use
 * - Memoization: validation results are cached for performance
 * - Listing: list() returns all registered exchanges
 *
 * @throws {Error} If duplicate exchange name is added
 * @throws {Error} If unknown exchange is referenced
 *
 * @example
 * ```typescript
 * const exchangeValidation = new ExchangeValidationService();
 * exchangeValidation.addExchange("binance", binanceSchema);
 * exchangeValidation.validate("binance", "backtest"); // OK
 * exchangeValidation.validate("unknown", "live"); // Throws error
 * ```
 */
declare class ExchangeValidationService {
    /**
     * @private
     * @readonly
     * Injected logger service instance
     */
    private readonly loggerService;
    /**
     * @private
     * Map storing exchange schemas by exchange name
     */
    private _exchangeMap;
    /**
     * Adds an exchange schema to the validation service
     * @public
     * @throws {Error} If exchangeName already exists
     */
    addExchange: (exchangeName: ExchangeName, exchangeSchema: IExchangeSchema) => void;
    /**
     * Validates the existence of an exchange
     * @public
     * @throws {Error} If exchangeName is not found
     * Memoized function to cache validation results
     */
    validate: (exchangeName: ExchangeName, source: string) => void;
    /**
     * Returns a list of all registered exchange schemas
     * @public
     * @returns Array of exchange schemas with their configurations
     */
    list: () => Promise<IExchangeSchema[]>;
}

/**
 * Service for managing and validating trading strategy configurations.
 *
 * Maintains a registry of all configured strategies, validates their existence
 * before operations, and ensures associated risk profiles are valid.
 * Uses memoization for performance.
 *
 * Key features:
 * - Registry management: addStrategy() to register new strategies
 * - Dual validation: validates both strategy existence and risk profile (if configured)
 * - Memoization: validation results are cached for performance
 * - Listing: list() returns all registered strategies
 *
 * @throws {Error} If duplicate strategy name is added
 * @throws {Error} If unknown strategy is referenced
 * @throws {Error} If strategy's risk profile doesn't exist
 *
 * @example
 * ```typescript
 * const strategyValidation = new StrategyValidationService();
 * strategyValidation.addStrategy("momentum-btc", { ...schema, riskName: "conservative" });
 * strategyValidation.validate("momentum-btc", "backtest"); // Validates strategy + risk
 * strategyValidation.validate("unknown", "live"); // Throws error
 * ```
 */
declare class StrategyValidationService {
    /**
     * @private
     * @readonly
     * Injected logger service instance
     */
    private readonly loggerService;
    /**
     * @private
     * @readonly
     * Injected risk validation service instance
     */
    private readonly riskValidationService;
    /**
     * @private
     * Map storing strategy schemas by strategy name
     */
    private _strategyMap;
    /**
     * Adds a strategy schema to the validation service
     * @public
     * @throws {Error} If strategyName already exists
     */
    addStrategy: (strategyName: StrategyName, strategySchema: IStrategySchema) => void;
    /**
     * Validates the existence of a strategy and its risk profile (if configured)
     * @public
     * @throws {Error} If strategyName is not found
     * @throws {Error} If riskName is configured but not found
     * Memoized function to cache validation results
     */
    validate: (strategyName: StrategyName, source: string) => void;
    /**
     * Returns a list of all registered strategy schemas
     * @public
     * @returns Array of strategy schemas with their configurations
     */
    list: () => Promise<IStrategySchema[]>;
}

/**
 * Service for managing and validating frame (timeframe) configurations.
 *
 * Maintains a registry of all configured frames and validates
 * their existence before operations. Uses memoization for performance.
 *
 * Key features:
 * - Registry management: addFrame() to register new timeframes
 * - Validation: validate() ensures frame exists before use
 * - Memoization: validation results are cached for performance
 * - Listing: list() returns all registered frames
 *
 * @throws {Error} If duplicate frame name is added
 * @throws {Error} If unknown frame is referenced
 *
 * @example
 * ```typescript
 * const frameValidation = new FrameValidationService();
 * frameValidation.addFrame("2024-Q1", frameSchema);
 * frameValidation.validate("2024-Q1", "backtest"); // OK
 * frameValidation.validate("unknown", "live"); // Throws error
 * ```
 */
declare class FrameValidationService {
    /**
     * @private
     * @readonly
     * Injected logger service instance
     */
    private readonly loggerService;
    /**
     * @private
     * Map storing frame schemas by frame name
     */
    private _frameMap;
    /**
     * Adds a frame schema to the validation service
     * @public
     * @throws {Error} If frameName already exists
     */
    addFrame: (frameName: FrameName, frameSchema: IFrameSchema) => void;
    /**
     * Validates the existence of a frame
     * @public
     * @throws {Error} If frameName is not found
     * Memoized function to cache validation results
     */
    validate: (frameName: FrameName, source: string) => void;
    /**
     * Returns a list of all registered frame schemas
     * @public
     * @returns Array of frame schemas with their configurations
     */
    list: () => Promise<IFrameSchema[]>;
}

/**
 * Service for managing and validating walker (parameter sweep) configurations.
 *
 * Maintains a registry of all configured walkers and validates
 * their existence before operations. Uses memoization for performance.
 *
 * Walkers define parameter ranges for optimization and hyperparameter tuning.
 *
 * Key features:
 * - Registry management: addWalker() to register new walker configurations
 * - Validation: validate() ensures walker exists before use
 * - Memoization: validation results are cached for performance
 * - Listing: list() returns all registered walkers
 *
 * @throws {Error} If duplicate walker name is added
 * @throws {Error} If unknown walker is referenced
 *
 * @example
 * ```typescript
 * const walkerValidation = new WalkerValidationService();
 * walkerValidation.addWalker("rsi-sweep", walkerSchema);
 * walkerValidation.validate("rsi-sweep", "optimizer"); // OK
 * walkerValidation.validate("unknown", "optimizer"); // Throws error
 * ```
 */
declare class WalkerValidationService {
    /**
     * @private
     * @readonly
     * Injected logger service instance
     */
    private readonly loggerService;
    /**
     * @private
     * Map storing walker schemas by walker name
     */
    private _walkerMap;
    /**
     * Adds a walker schema to the validation service
     * @public
     * @throws {Error} If walkerName already exists
     */
    addWalker: (walkerName: WalkerName, walkerSchema: IWalkerSchema) => void;
    /**
     * Validates the existence of a walker
     * @public
     * @throws {Error} If walkerName is not found
     * Memoized function to cache validation results
     */
    validate: (walkerName: WalkerName, source: string) => void;
    /**
     * Returns a list of all registered walker schemas
     * @public
     * @returns Array of walker schemas with their configurations
     */
    list: () => Promise<IWalkerSchema[]>;
}

/**
 * Service for managing and validating position sizing configurations.
 *
 * Maintains a registry of all configured sizing strategies and validates
 * their existence before operations. Uses memoization for performance.
 *
 * Key features:
 * - Registry management: addSizing() to register new sizing strategies
 * - Validation: validate() ensures sizing strategy exists before use
 * - Memoization: validation results are cached for performance
 * - Listing: list() returns all registered sizing strategies
 *
 * @throws {Error} If duplicate sizing name is added
 * @throws {Error} If unknown sizing strategy is referenced
 *
 * @example
 * ```typescript
 * const sizingValidation = new SizingValidationService();
 * sizingValidation.addSizing("fixed-1000", fixedSizingSchema);
 * sizingValidation.validate("fixed-1000", "strategy-1"); // OK
 * sizingValidation.validate("unknown", "strategy-2"); // Throws error
 * ```
 */
declare class SizingValidationService {
    /**
     * @private
     * @readonly
     * Injected logger service instance
     */
    private readonly loggerService;
    /**
     * @private
     * Map storing sizing schemas by sizing name
     */
    private _sizingMap;
    /**
     * Adds a sizing schema to the validation service
     * @public
     * @throws {Error} If sizingName already exists
     */
    addSizing: (sizingName: SizingName, sizingSchema: ISizingSchema) => void;
    /**
     * Validates the existence of a sizing and optionally its method
     * @public
     * @throws {Error} If sizingName is not found
     * @throws {Error} If method is provided and doesn't match sizing schema method
     * Memoized function to cache validation results
     */
    validate: (sizingName: SizingName, source: string, method?: "fixed-percentage" | "kelly-criterion" | "atr-based") => void;
    /**
     * Returns a list of all registered sizing schemas
     * @public
     * @returns Array of sizing schemas with their configurations
     */
    list: () => Promise<ISizingSchema[]>;
}

/**
 * Service for managing and validating risk management configurations.
 *
 * Maintains a registry of all configured risk profiles and validates
 * their existence before operations. Uses memoization for performance.
 *
 * Key features:
 * - Registry management: addRisk() to register new risk profiles
 * - Validation: validate() ensures risk profile exists before use
 * - Memoization: validation results are cached by riskName:source for performance
 * - Listing: list() returns all registered risk profiles
 *
 * @throws {Error} If duplicate risk name is added
 * @throws {Error} If unknown risk profile is referenced
 *
 * @example
 * ```typescript
 * const riskValidation = new RiskValidationService();
 * riskValidation.addRisk("conservative", conservativeSchema);
 * riskValidation.validate("conservative", "strategy-1"); // OK
 * riskValidation.validate("unknown", "strategy-2"); // Throws error
 * ```
 */
declare class RiskValidationService {
    /**
     * @private
     * @readonly
     * Injected logger service instance
     */
    private readonly loggerService;
    /**
     * @private
     * Map storing risk schemas by risk name
     */
    private _riskMap;
    /**
     * Adds a risk schema to the validation service
     * @public
     * @throws {Error} If riskName already exists
     */
    addRisk: (riskName: RiskName, riskSchema: IRiskSchema) => void;
    /**
     * Validates the existence of a risk profile
     * @public
     * @throws {Error} If riskName is not found
     * Memoized function to cache validation results
     */
    validate: (riskName: RiskName, source: string) => void;
    /**
     * Returns a list of all registered risk schemas
     * @public
     * @returns Array of risk schemas with their configurations
     */
    list: () => Promise<IRiskSchema[]>;
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
    getWalkerTemplate: (walkerName: string, exchangeName: string, frameName: string, strategies: string[]) => Promise<string>;
    /**
     * Generates Strategy configuration with LLM integration.
     * Includes multi-timeframe analysis and signal generation.
     *
     * @param strategyName - Unique strategy identifier
     * @param interval - Signal throttling interval (e.g., "5m")
     * @param prompt - Strategy logic from getPrompt()
     * @returns Generated addStrategy() call with getSignal() function
     */
    getStrategyTemplate: (strategyName: string, interval: string, prompt: string) => Promise<string>;
    /**
     * Generates Exchange configuration code.
     * Uses CCXT Binance with standard formatters.
     *
     * @param symbol - Trading pair symbol (unused, for consistency)
     * @param exchangeName - Unique exchange identifier
     * @returns Generated addExchange() call with CCXT integration
     */
    getExchangeTemplate: (symbol: string, exchangeName: ExchangeName) => Promise<string>;
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
    getFrameTemplate: (symbol: string, frameName: string, interval: CandleInterval, startDate: Date, endDate: Date) => Promise<string>;
    /**
     * Generates launcher code to run Walker with event listeners.
     * Includes progress tracking and completion handlers.
     *
     * @param symbol - Trading pair symbol
     * @param walkerName - Walker name to launch
     * @returns Generated Walker.background() call with listeners
     */
    getLauncherTemplate: (symbol: string, walkerName: string) => Promise<string>;
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
 * Type definition for partial methods.
 * Maps all keys of IPartial to any type.
 * Used for dynamic method routing in PartialGlobalService.
 */
type TPartial = {
    [key in keyof IPartial]: any;
};
/**
 * Global service for partial profit/loss tracking.
 *
 * Thin delegation layer that forwards operations to PartialConnectionService.
 * Provides centralized logging for all partial operations at the global level.
 *
 * Architecture:
 * - Injected into ClientStrategy constructor via IStrategyParams
 * - Delegates all operations to PartialConnectionService
 * - Logs operations at "partialGlobalService" level before delegation
 *
 * Purpose:
 * - Single injection point for ClientStrategy (dependency injection pattern)
 * - Centralized logging for monitoring partial operations
 * - Layer of abstraction between strategy and connection layer
 *
 * @example
 * ```typescript
 * // Service injected into ClientStrategy via DI
 * const strategy = new ClientStrategy({
 *   partial: partialGlobalService,
 *   ...
 * });
 *
 * // Called during signal monitoring
 * await strategy.params.partial.profit("BTCUSDT", signal, 55000, 10.0, false, new Date());
 * // Logs at global level → delegates to PartialConnectionService
 * ```
 */
declare class PartialGlobalService implements TPartial {
    /**
     * Logger service injected from DI container.
     * Used for logging operations at global service level.
     */
    private readonly loggerService;
    /**
     * Connection service injected from DI container.
     * Handles actual ClientPartial instance creation and management.
     */
    private readonly partialConnectionService;
    /**
     * Strategy validation service for validating strategy existence.
     */
    private readonly strategyValidationService;
    /**
     * Strategy schema service for retrieving strategy configuration.
     */
    private readonly strategySchemaService;
    /**
     * Risk validation service for validating risk existence.
     */
    private readonly riskValidationService;
    /**
     * Validates strategy and associated risk configuration.
     * Memoized to avoid redundant validations for the same strategy-exchange-frame combination.
     *
     * @param context - Context with strategyName, exchangeName and frameName
     * @param methodName - Name of the calling method for error tracking
     */
    private validate;
    /**
     * Processes profit state and emits events for newly reached profit levels.
     *
     * Logs operation at global service level, then delegates to PartialConnectionService.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param data - Signal row data
     * @param currentPrice - Current market price
     * @param revenuePercent - Current profit percentage (positive value)
     * @param backtest - True if backtest mode, false if live mode
     * @param when - Event timestamp (current time for live, candle time for backtest)
     * @returns Promise that resolves when profit processing is complete
     */
    profit: (symbol: string, data: ISignalRow, currentPrice: number, revenuePercent: number, backtest: boolean, when: Date) => Promise<void>;
    /**
     * Processes loss state and emits events for newly reached loss levels.
     *
     * Logs operation at global service level, then delegates to PartialConnectionService.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param data - Signal row data
     * @param currentPrice - Current market price
     * @param lossPercent - Current loss percentage (negative value)
     * @param backtest - True if backtest mode, false if live mode
     * @param when - Event timestamp (current time for live, candle time for backtest)
     * @returns Promise that resolves when loss processing is complete
     */
    loss: (symbol: string, data: ISignalRow, currentPrice: number, lossPercent: number, backtest: boolean, when: Date) => Promise<void>;
    /**
     * Clears partial profit/loss state when signal closes.
     *
     * Logs operation at global service level, then delegates to PartialConnectionService.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param data - Signal row data
     * @param priceClose - Final closing price
     * @returns Promise that resolves when clear is complete
     */
    clear: (symbol: string, data: ISignalRow, priceClose: number, backtest: boolean) => Promise<void>;
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
 * Service for validating GLOBAL_CONFIG parameters to ensure mathematical correctness
 * and prevent unprofitable trading configurations.
 *
 * Performs comprehensive validation on:
 * - **Percentage parameters**: Slippage, fees, and profit margins must be non-negative
 * - **Economic viability**: Ensures CC_MIN_TAKEPROFIT_DISTANCE_PERCENT covers all trading costs
 *   (slippage + fees) to guarantee profitable trades when TakeProfit is hit
 * - **Range constraints**: Validates MIN < MAX relationships (e.g., StopLoss distances)
 * - **Time-based parameters**: Ensures positive integer values for timeouts and lifetimes
 * - **Candle parameters**: Validates retry counts, delays, and anomaly detection thresholds
 *
 * @throws {Error} If any validation fails, throws with detailed breakdown of all errors
 *
 * @example
 * ```typescript
 * const validator = new ConfigValidationService();
 * validator.validate(); // Throws if config is invalid
 * ```
 *
 * @example Validation failure output:
 * ```
 * GLOBAL_CONFIG validation failed:
 *   1. CC_MIN_TAKEPROFIT_DISTANCE_PERCENT (0.3%) is too low to cover trading costs.
 *      Required minimum: 0.40%
 *      Breakdown:
 *        - Slippage effect: 0.20% (0.1% × 2 transactions)
 *        - Fees: 0.20% (0.1% × 2 transactions)
 *      All TakeProfit signals will be unprofitable with current settings!
 * ```
 */
declare class ConfigValidationService {
    /**
     * @private
     * @readonly
     * Injected logger service instance
     */
    private readonly loggerService;
    /**
     * Validates GLOBAL_CONFIG parameters for mathematical correctness.
     *
     * Checks:
     * 1. CC_MIN_TAKEPROFIT_DISTANCE_PERCENT must cover slippage + fees
     * 2. All percentage values must be positive
     * 3. Time/count values must be positive integers
     *
     * @throws Error if configuration is invalid
     */
    validate: () => void;
}

/**
 * Service for validating column configurations to ensure consistency with ColumnModel interface
 * and prevent invalid column definitions.
 *
 * Performs comprehensive validation on all column definitions in COLUMN_CONFIG:
 * - **Required fields**: All columns must have key, label, format, and isVisible properties
 * - **Unique keys**: All key values must be unique within each column collection
 * - **Function validation**: format and isVisible must be callable functions
 * - **Data types**: key and label must be non-empty strings
 *
 * @throws {Error} If any validation fails, throws with detailed breakdown of all errors
 *
 * @example
 * ```typescript
 * const validator = new ColumnValidationService();
 * validator.validate(); // Throws if column configuration is invalid
 * ```
 *
 * @example Validation failure output:
 * ```
 * Column configuration validation failed:
 *   1. backtest_columns[0]: Missing required field "format"
 *   2. heat_columns: Duplicate key "symbol" at indexes 1, 5
 *   3. live_columns[3].isVisible must be a function, got "boolean"
 * ```
 */
declare class ColumnValidationService {
    /**
     * @private
     * @readonly
     * Injected logger service instance
     */
    private readonly loggerService;
    /**
     * Validates all column configurations in COLUMN_CONFIG for structural correctness.
     *
     * Checks:
     * 1. All required fields (key, label, format, isVisible) are present in each column
     * 2. key and label are non-empty strings
     * 3. format and isVisible are functions (not other types)
     * 4. All keys are unique within each column collection
     *
     * @throws Error if configuration is invalid
     */
    validate: () => void;
}

declare const backtest: {
    optimizerTemplateService: OptimizerTemplateService;
    exchangeValidationService: ExchangeValidationService;
    strategyValidationService: StrategyValidationService;
    frameValidationService: FrameValidationService;
    walkerValidationService: WalkerValidationService;
    sizingValidationService: SizingValidationService;
    riskValidationService: RiskValidationService;
    optimizerValidationService: OptimizerValidationService;
    configValidationService: ConfigValidationService;
    columnValidationService: ColumnValidationService;
    backtestMarkdownService: BacktestMarkdownService;
    liveMarkdownService: LiveMarkdownService;
    scheduleMarkdownService: ScheduleMarkdownService;
    performanceMarkdownService: PerformanceMarkdownService;
    walkerMarkdownService: WalkerMarkdownService;
    heatMarkdownService: HeatMarkdownService;
    partialMarkdownService: PartialMarkdownService;
    outlineMarkdownService: OutlineMarkdownService;
    riskMarkdownService: RiskMarkdownService;
    backtestLogicPublicService: BacktestLogicPublicService;
    liveLogicPublicService: LiveLogicPublicService;
    walkerLogicPublicService: WalkerLogicPublicService;
    backtestLogicPrivateService: BacktestLogicPrivateService;
    liveLogicPrivateService: LiveLogicPrivateService;
    walkerLogicPrivateService: WalkerLogicPrivateService;
    liveCommandService: LiveCommandService;
    backtestCommandService: BacktestCommandService;
    walkerCommandService: WalkerCommandService;
    sizingGlobalService: SizingGlobalService;
    riskGlobalService: RiskGlobalService;
    optimizerGlobalService: OptimizerGlobalService;
    partialGlobalService: PartialGlobalService;
    exchangeCoreService: ExchangeCoreService;
    strategyCoreService: StrategyCoreService;
    frameCoreService: FrameCoreService;
    exchangeSchemaService: ExchangeSchemaService;
    strategySchemaService: StrategySchemaService;
    frameSchemaService: FrameSchemaService;
    walkerSchemaService: WalkerSchemaService;
    sizingSchemaService: SizingSchemaService;
    riskSchemaService: RiskSchemaService;
    optimizerSchemaService: OptimizerSchemaService;
    exchangeConnectionService: ExchangeConnectionService;
    strategyConnectionService: StrategyConnectionService;
    frameConnectionService: FrameConnectionService;
    sizingConnectionService: SizingConnectionService;
    riskConnectionService: RiskConnectionService;
    optimizerConnectionService: OptimizerConnectionService;
    partialConnectionService: PartialConnectionService;
    executionContextService: {
        readonly context: IExecutionContext;
    };
    methodContextService: {
        readonly context: IMethodContext;
    };
    loggerService: LoggerService;
};

export { Backtest, type BacktestDoneNotification, type BacktestStatisticsModel, type BootstrapNotification, Cache, type CandleInterval, type ColumnConfig, type ColumnModel, Constant, type CriticalErrorNotification, type DoneContract, type EntityId, Exchange, ExecutionContextService, type FrameInterval, type GlobalConfig, Heat, type HeatmapStatisticsModel, type ICandleData, type IExchangeSchema, type IFrameSchema, type IHeatmapRow, type IOptimizerCallbacks, type IOptimizerData, type IOptimizerFetchArgs, type IOptimizerFilterArgs, type IOptimizerRange, type IOptimizerSchema, type IOptimizerSource, type IOptimizerStrategy, type IOptimizerTemplate, type IPersistBase, type IPositionSizeATRParams, type IPositionSizeFixedPercentageParams, type IPositionSizeKellyParams, type IRiskActivePosition, type IRiskCheckArgs, type IRiskSchema, type IRiskValidation, type IRiskValidationFn, type IRiskValidationPayload, type IScheduledSignalCancelRow, type IScheduledSignalRow, type ISignalDto, type ISignalRow, type ISizingCalculateParams, type ISizingCalculateParamsATR, type ISizingCalculateParamsFixedPercentage, type ISizingCalculateParamsKelly, type ISizingSchema, type ISizingSchemaATR, type ISizingSchemaFixedPercentage, type ISizingSchemaKelly, type IStrategyPnL, type IStrategyResult, type IStrategySchema, type IStrategyTickResult, type IStrategyTickResultActive, type IStrategyTickResultCancelled, type IStrategyTickResultClosed, type IStrategyTickResultIdle, type IStrategyTickResultOpened, type IStrategyTickResultScheduled, type IWalkerResults, type IWalkerSchema, type IWalkerStrategyResult, type InfoErrorNotification, Live, type LiveDoneNotification, type LiveStatisticsModel, type MessageModel, type MessageRole, MethodContextService, type MetricStats, Notification, type NotificationModel, Optimizer, Partial$1 as Partial, type PartialData, type PartialEvent, type PartialLossContract, type PartialLossNotification, type PartialProfitContract, type PartialProfitNotification, type PartialStatisticsModel, Performance, type PerformanceContract, type PerformanceMetricType, type PerformanceStatisticsModel, PersistBase, PersistPartialAdapter, PersistRiskAdapter, PersistScheduleAdapter, PersistSignalAdapter, type PingContract, PositionSize, type ProgressBacktestContract, type ProgressBacktestNotification, type ProgressOptimizerContract, type ProgressWalkerContract, Risk, type RiskContract, type RiskData, type RiskEvent, type RiskRejectionNotification, type RiskStatisticsModel, Schedule, type ScheduleData, type ScheduleStatisticsModel, type ScheduledEvent, type SignalCancelledNotification, type SignalClosedNotification, type SignalData, type SignalInterval, type SignalOpenedNotification, type SignalScheduledNotification, type TPersistBase, type TPersistBaseCtor, type TickEvent, type ValidationErrorNotification, Walker, type WalkerCompleteContract, type WalkerContract, type WalkerMetric, type SignalData$1 as WalkerSignalData, type WalkerStatisticsModel, addExchange, addFrame, addOptimizer, addRisk, addSizing, addStrategy, addWalker, cancel, dumpSignal, emitters, formatPrice, formatQuantity, getAveragePrice, getCandles, getColumns, getConfig, getDate, getDefaultColumns, getDefaultConfig, getMode, hasTradeContext, backtest as lib, listExchanges, listFrames, listOptimizers, listRisks, listSizings, listStrategies, listWalkers, listenBacktestProgress, listenDoneBacktest, listenDoneBacktestOnce, listenDoneLive, listenDoneLiveOnce, listenDoneWalker, listenDoneWalkerOnce, listenError, listenExit, listenOptimizerProgress, listenPartialLoss, listenPartialLossOnce, listenPartialProfit, listenPartialProfitOnce, listenPerformance, listenPing, listenPingOnce, listenRisk, listenRiskOnce, listenSignal, listenSignalBacktest, listenSignalBacktestOnce, listenSignalLive, listenSignalLiveOnce, listenSignalOnce, listenValidation, listenWalker, listenWalkerComplete, listenWalkerOnce, listenWalkerProgress, partialLoss, partialProfit, setColumns, setConfig, setLogger, stop, validate };

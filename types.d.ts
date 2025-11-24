import * as di_scoped from 'di-scoped';
import * as functools_kit from 'functools-kit';
import { Subject } from 'functools-kit';

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
declare function setLogger(logger: ILogger): Promise<void>;

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
    getTimeframe: (symbol: string) => Promise<Date[]>;
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
    /** Signal creation timestamp in milliseconds */
    timestamp: number;
    /** Trading pair symbol (e.g., "BTCUSDT") */
    symbol: string;
}
/**
 * Optional lifecycle callbacks for signal events.
 * Called when signals are opened, active, idle, or closed.
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
    /** Signal generation function (returns null if no signal, validated DTO if signal) */
    getSignal: (symbol: string) => Promise<ISignalDto | null>;
    /** Optional lifecycle event callbacks (onOpen, onClose) */
    callbacks?: Partial<IStrategyCallbacks>;
}
/**
 * Reason why signal was closed.
 * Used in discriminated union for type-safe handling.
 */
type StrategyCloseReason = "time_expired" | "take_profit" | "stop_loss";
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
    /** Current VWAP price during idle state */
    currentPrice: number;
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
    /** Current VWAP price at signal open */
    currentPrice: number;
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
}
/**
 * Discriminated union of all tick results.
 * Use type guards: `result.action === "closed"` for type safety.
 */
type IStrategyTickResult = IStrategyTickResultIdle | IStrategyTickResultOpened | IStrategyTickResultActive | IStrategyTickResultClosed;
/**
 * Backtest always returns closed result (TP/SL or time_expired).
 */
type IStrategyBacktestResult = IStrategyTickResultClosed;
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
     * @returns Promise resolving to tick result (idle | opened | active | closed)
     */
    tick: (symbol: string) => Promise<IStrategyTickResult>;
    /**
     * Fast backtest using historical candles.
     * Iterates through candles, calculates VWAP, checks TP/SL on each candle.
     *
     * @param candles - Array of historical candle data
     * @returns Promise resolving to closed result (always completes signal)
     */
    backtest: (candles: ICandleData[]) => Promise<IStrategyBacktestResult>;
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
    stop: (symbol: string) => Promise<void>;
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
interface BacktestStatistics {
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
     * Memoized function to get or create ReportStorage for a strategy.
     * Each strategy gets its own isolated storage instance.
     */
    private getStorage;
    /**
     * Processes tick events and accumulates closed signals.
     * Should be called from IStrategyCallbacks.onTick.
     *
     * Only processes closed signals - opened signals are ignored.
     *
     * @param data - Tick result from strategy execution (opened or closed)
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
     * Gets statistical data from all closed signals for a strategy.
     * Delegates to ReportStorage.getData().
     *
     * @param strategyName - Strategy name to get data for
     * @returns Statistical data object with all metrics
     *
     * @example
     * ```typescript
     * const service = new BacktestMarkdownService();
     * const stats = await service.getData("my-strategy");
     * console.log(stats.sharpeRatio, stats.winRate);
     * ```
     */
    getData: (strategyName: StrategyName) => Promise<BacktestStatistics>;
    /**
     * Generates markdown report with all closed signals for a strategy.
     * Delegates to ReportStorage.generateReport().
     *
     * @param strategyName - Strategy name to generate report for
     * @returns Markdown formatted report string with table of all closed signals
     *
     * @example
     * ```typescript
     * const service = new BacktestMarkdownService();
     * const markdown = await service.getReport("my-strategy");
     * console.log(markdown);
     * ```
     */
    getReport: (strategyName: StrategyName) => Promise<string>;
    /**
     * Saves strategy report to disk.
     * Creates directory if it doesn't exist.
     * Delegates to ReportStorage.dump().
     *
     * @param strategyName - Strategy name to save report for
     * @param path - Directory path to save report (default: "./logs/backtest")
     *
     * @example
     * ```typescript
     * const service = new BacktestMarkdownService();
     *
     * // Save to default path: ./logs/backtest/my-strategy.md
     * await service.dump("my-strategy");
     *
     * // Save to custom path: ./custom/path/my-strategy.md
     * await service.dump("my-strategy", "./custom/path");
     * ```
     */
    dump: (strategyName: StrategyName, path?: string) => Promise<void>;
    /**
     * Clears accumulated signal data from storage.
     * If strategyName is provided, clears only that strategy's data.
     * If strategyName is omitted, clears all strategies' data.
     *
     * @param strategyName - Optional strategy name to clear specific strategy data
     *
     * @example
     * ```typescript
     * const service = new BacktestMarkdownService();
     *
     * // Clear specific strategy data
     * await service.clear("my-strategy");
     *
     * // Clear all strategies' data
     * await service.clear();
     * ```
     */
    clear: (strategyName?: StrategyName) => Promise<void>;
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
    onStrategyComplete: (strategyName: StrategyName, symbol: string, stats: BacktestStatistics, metric: number | null) => void;
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
    stats: BacktestStatistics;
    /** Metric value used for comparison (null if invalid) */
    metric: number | null;
    /** Rank position (1 = best, 2 = second best, etc.) */
    rank: number;
}
/**
 * Complete walker results after comparing all strategies.
 */
interface IWalkerResults {
    /** Walker name */
    walkerName: WalkerName;
    /** Symbol tested */
    symbol: string;
    /** Exchange used */
    exchangeName: ExchangeName;
    /** Frame used */
    frameName: FrameName;
    /** Metric used for optimization */
    metric: WalkerMetric;
    /** Total number of strategies tested */
    totalStrategies: number;
    /** Best performing strategy name */
    bestStrategy: StrategyName | null;
    /** Best metric value achieved */
    bestMetric: number | null;
    /** Best strategy statistics */
    bestStats: BacktestStatistics | null;
}
/**
 * Unique walker identifier.
 */
type WalkerName = string;

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
 * import { listenProgress } from "backtest-kit";
 *
 * listenProgress((event) => {
 *   console.log(`Progress: ${(event.progress * 100).toFixed(2)}%`);
 *   console.log(`Processed: ${event.processedFrames} / ${event.totalFrames}`);
 * });
 * ```
 */
interface ProgressContract {
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
    stats: BacktestStatistics;
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
 * Subscribes to background execution errors with queued async processing.
 *
 * Listens to errors caught in Live.background() and Backtest.background() execution.
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
 *   console.error("Background execution error:", error.message);
 *   // Log to monitoring service, send alerts, etc.
 * });
 *
 * // Later: stop listening
 * unsubscribe();
 * ```
 */
declare function listenError(fn: (error: Error) => void): () => void;
/**
 * Subscribes to background execution completion events with queued async processing.
 *
 * Emits when Live.background() or Backtest.background() completes execution.
 * Events are processed sequentially in order received, even if callback is async.
 * Uses queued wrapper to prevent concurrent execution of the callback.
 *
 * @param fn - Callback function to handle completion events
 * @returns Unsubscribe function to stop listening to events
 *
 * @example
 * ```typescript
 * import { listenDone, Live } from "backtest-kit";
 *
 * const unsubscribe = listenDone((event) => {
 *   console.log("Completed:", event.strategyName, event.exchangeName, event.symbol);
 *   if (event.backtest) {
 *     console.log("Backtest mode completed");
 *   }
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
declare function listenDone(fn: (event: DoneContract) => void): () => void;
/**
 * Subscribes to filtered background execution completion events with one-time execution.
 *
 * Emits when Live.background() or Backtest.background() completes execution.
 * Executes callback once and automatically unsubscribes.
 *
 * @param filterFn - Predicate to filter which events trigger the callback
 * @param fn - Callback function to handle the filtered event (called only once)
 * @returns Unsubscribe function to cancel the listener before it fires
 *
 * @example
 * ```typescript
 * import { listenDoneOnce, Backtest } from "backtest-kit";
 *
 * // Wait for first backtest completion
 * listenDoneOnce(
 *   (event) => event.backtest && event.symbol === "BTCUSDT",
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
declare function listenDoneOnce(filterFn: (event: DoneContract) => boolean, fn: (event: DoneContract) => void): () => void;
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
 * import { listenProgress, Backtest } from "backtest-kit";
 *
 * const unsubscribe = listenProgress((event) => {
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
declare function listenProgress(fn: (event: ProgressContract) => void): () => void;
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
declare function listenWalkerComplete(fn: (event: IWalkerResults) => void): () => void;

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
 * Unified tick event data for report generation.
 * Contains all information about a tick event regardless of action type.
 */
interface TickEvent {
    /** Event timestamp in milliseconds */
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
interface LiveStatistics {
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
     * Memoized function to get or create ReportStorage for a strategy.
     * Each strategy gets its own isolated storage instance.
     */
    private getStorage;
    /**
     * Processes tick events and accumulates all event types.
     * Should be called from IStrategyCallbacks.onTick.
     *
     * Processes all event types: idle, opened, active, closed.
     *
     * @param data - Tick result from strategy execution
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
     * Gets statistical data from all live trading events for a strategy.
     * Delegates to ReportStorage.getData().
     *
     * @param strategyName - Strategy name to get data for
     * @returns Statistical data object with all metrics
     *
     * @example
     * ```typescript
     * const service = new LiveMarkdownService();
     * const stats = await service.getData("my-strategy");
     * console.log(stats.sharpeRatio, stats.winRate);
     * ```
     */
    getData: (strategyName: StrategyName) => Promise<LiveStatistics>;
    /**
     * Generates markdown report with all events for a strategy.
     * Delegates to ReportStorage.getReport().
     *
     * @param strategyName - Strategy name to generate report for
     * @returns Markdown formatted report string with table of all events
     *
     * @example
     * ```typescript
     * const service = new LiveMarkdownService();
     * const markdown = await service.getReport("my-strategy");
     * console.log(markdown);
     * ```
     */
    getReport: (strategyName: StrategyName) => Promise<string>;
    /**
     * Saves strategy report to disk.
     * Creates directory if it doesn't exist.
     * Delegates to ReportStorage.dump().
     *
     * @param strategyName - Strategy name to save report for
     * @param path - Directory path to save report (default: "./logs/live")
     *
     * @example
     * ```typescript
     * const service = new LiveMarkdownService();
     *
     * // Save to default path: ./logs/live/my-strategy.md
     * await service.dump("my-strategy");
     *
     * // Save to custom path: ./custom/path/my-strategy.md
     * await service.dump("my-strategy", "./custom/path");
     * ```
     */
    dump: (strategyName: StrategyName, path?: string) => Promise<void>;
    /**
     * Clears accumulated event data from storage.
     * If strategyName is provided, clears only that strategy's data.
     * If strategyName is omitted, clears all strategies' data.
     *
     * @param strategyName - Optional strategy name to clear specific strategy data
     *
     * @example
     * ```typescript
     * const service = new LiveMarkdownService();
     *
     * // Clear specific strategy data
     * await service.clear("my-strategy");
     *
     * // Clear all strategies' data
     * await service.clear();
     * ```
     */
    clear: (strategyName?: StrategyName) => Promise<void>;
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
interface PerformanceStatistics {
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
 * await Performance.dump("my-strategy");
 * ```
 */
declare class PerformanceMarkdownService {
    /** Logger service for debug output */
    private readonly loggerService;
    /**
     * Memoized function to get or create PerformanceStorage for a strategy.
     * Each strategy gets its own isolated storage instance.
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
     * Gets aggregated performance statistics for a strategy.
     *
     * @param strategyName - Strategy name to get data for
     * @returns Performance statistics with aggregated metrics
     *
     * @example
     * ```typescript
     * const stats = await performanceService.getData("my-strategy");
     * console.log("Total time:", stats.totalDuration);
     * console.log("Slowest operation:", Object.values(stats.metricStats)
     *   .sort((a, b) => b.avgDuration - a.avgDuration)[0]);
     * ```
     */
    getData: (strategyName: string) => Promise<PerformanceStatistics>;
    /**
     * Generates markdown report with performance analysis.
     *
     * @param strategyName - Strategy name to generate report for
     * @returns Markdown formatted report string
     *
     * @example
     * ```typescript
     * const markdown = await performanceService.getReport("my-strategy");
     * console.log(markdown);
     * ```
     */
    getReport: (strategyName: string) => Promise<string>;
    /**
     * Saves performance report to disk.
     *
     * @param strategyName - Strategy name to save report for
     * @param path - Directory path to save report
     *
     * @example
     * ```typescript
     * // Save to default path: ./logs/performance/my-strategy.md
     * await performanceService.dump("my-strategy");
     *
     * // Save to custom path
     * await performanceService.dump("my-strategy", "./custom/path");
     * ```
     */
    dump: (strategyName: string, path?: string) => Promise<void>;
    /**
     * Clears accumulated performance data from storage.
     *
     * @param strategyName - Optional strategy name to clear specific strategy data
     */
    clear: (strategyName?: string) => Promise<void>;
    /**
     * Initializes the service by subscribing to performance events.
     * Uses singleshot to ensure initialization happens only once.
     */
    protected init: (() => Promise<void>) & functools_kit.ISingleshotClearable;
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
type TPersistBaseCtor<EntityName extends string = string, Entity extends IEntity = IEntity> = new (entityName: EntityName, baseDir: string) => IPersistBase<Entity>;
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
interface IPersistBase<Entity extends IEntity = IEntity> {
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
     * PersistSignalAdaper.usePersistSignalAdapter(RedisPersist);
     * ```
     */
    usePersistSignalAdapter(Ctor: TPersistBaseCtor<StrategyName, SignalData>): void;
    /**
     * Reads persisted signal data for a strategy and symbol.
     *
     * Called by ClientStrategy.waitForInit() to restore state.
     * Returns null if no signal exists.
     *
     * @param strategyName - Strategy identifier
     * @param symbol - Trading pair symbol
     * @returns Promise resolving to signal or null
     */
    readSignalData: (strategyName: StrategyName, symbol: string) => Promise<ISignalRow | null>;
    /**
     * Writes signal data to disk with atomic file writes.
     *
     * Called by ClientStrategy.setPendingSignal() to persist state.
     * Uses atomic writes to prevent corruption on crashes.
     *
     * @param signalRow - Signal data (null to clear)
     * @param strategyName - Strategy identifier
     * @param symbol - Trading pair symbol
     * @returns Promise that resolves when write is complete
     */
    writeSignalData: (signalRow: ISignalRow | null, strategyName: StrategyName, symbol: string) => Promise<void>;
}
/**
 * Global singleton instance of PersistSignalUtils.
 * Used by ClientStrategy for signal persistence.
 *
 * @example
 * ```typescript
 * // Custom adapter
 * PersistSignalAdaper.usePersistSignalAdapter(RedisPersist);
 *
 * // Read signal
 * const signal = await PersistSignalAdaper.readSignalData("my-strategy", "BTCUSDT");
 *
 * // Write signal
 * await PersistSignalAdaper.writeSignalData(signal, "my-strategy", "BTCUSDT");
 * ```
 */
declare const PersistSignalAdaper: PersistSignalUtils;

/**
 * Utility class for backtest operations.
 *
 * Provides simplified access to backtestGlobalService.run() with logging.
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
    }) => AsyncGenerator<IStrategyTickResultClosed, void, unknown>;
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
     * Gets statistical data from all closed signals for a strategy.
     *
     * @param strategyName - Strategy name to get data for
     * @returns Promise resolving to statistical data object
     *
     * @example
     * ```typescript
     * const stats = await Backtest.getData("my-strategy");
     * console.log(stats.sharpeRatio, stats.winRate);
     * ```
     */
    getData: (strategyName: StrategyName) => Promise<BacktestStatistics>;
    /**
     * Generates markdown report with all closed signals for a strategy.
     *
     * @param strategyName - Strategy name to generate report for
     * @returns Promise resolving to markdown formatted report string
     *
     * @example
     * ```typescript
     * const markdown = await Backtest.getReport("my-strategy");
     * console.log(markdown);
     * ```
     */
    getReport: (strategyName: StrategyName) => Promise<string>;
    /**
     * Saves strategy report to disk.
     *
     * @param strategyName - Strategy name to save report for
     * @param path - Optional directory path to save report (default: "./logs/backtest")
     *
     * @example
     * ```typescript
     * // Save to default path: ./logs/backtest/my-strategy.md
     * await Backtest.dump("my-strategy");
     *
     * // Save to custom path: ./custom/path/my-strategy.md
     * await Backtest.dump("my-strategy", "./custom/path");
     * ```
     */
    dump: (strategyName: StrategyName, path?: string) => Promise<void>;
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
 * Utility class for live trading operations.
 *
 * Provides simplified access to liveGlobalService.run() with logging.
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
     * Gets statistical data from all live trading events for a strategy.
     *
     * @param strategyName - Strategy name to get data for
     * @returns Promise resolving to statistical data object
     *
     * @example
     * ```typescript
     * const stats = await Live.getData("my-strategy");
     * console.log(stats.sharpeRatio, stats.winRate);
     * ```
     */
    getData: (strategyName: StrategyName) => Promise<LiveStatistics>;
    /**
     * Generates markdown report with all events for a strategy.
     *
     * @param strategyName - Strategy name to generate report for
     * @returns Promise resolving to markdown formatted report string
     *
     * @example
     * ```typescript
     * const markdown = await Live.getReport("my-strategy");
     * console.log(markdown);
     * ```
     */
    getReport: (strategyName: StrategyName) => Promise<string>;
    /**
     * Saves strategy report to disk.
     *
     * @param strategyName - Strategy name to save report for
     * @param path - Optional directory path to save report (default: "./logs/live")
     *
     * @example
     * ```typescript
     * // Save to default path: ./logs/live/my-strategy.md
     * await Live.dump("my-strategy");
     *
     * // Save to custom path: ./custom/path/my-strategy.md
     * await Live.dump("my-strategy", "./custom/path");
     * ```
     */
    dump: (strategyName: StrategyName, path?: string) => Promise<void>;
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
 * // Run backtest...
 *
 * // Get aggregated statistics
 * const stats = await Performance.getData("my-strategy");
 * console.log("Total time:", stats.totalDuration);
 * console.log("Slowest operations:", Object.values(stats.metricStats)
 *   .sort((a, b) => b.avgDuration - a.avgDuration)
 *   .slice(0, 5));
 *
 * // Generate and save report
 * await Performance.dump("my-strategy");
 * ```
 */
declare class Performance {
    /**
     * Gets aggregated performance statistics for a strategy.
     *
     * Returns detailed metrics grouped by operation type:
     * - Count, total duration, average, min, max
     * - Standard deviation for volatility
     * - Percentiles (median, P95, P99) for outlier detection
     *
     * @param strategyName - Strategy name to analyze
     * @returns Performance statistics with aggregated metrics
     *
     * @example
     * ```typescript
     * const stats = await Performance.getData("my-strategy");
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
    static getData(strategyName: string): Promise<PerformanceStatistics>;
    /**
     * Generates markdown report with performance analysis.
     *
     * Report includes:
     * - Time distribution across operation types
     * - Detailed metrics table with statistics
     * - Percentile analysis for bottleneck detection
     *
     * @param strategyName - Strategy name to generate report for
     * @returns Markdown formatted report string
     *
     * @example
     * ```typescript
     * const markdown = await Performance.getReport("my-strategy");
     * console.log(markdown);
     *
     * // Or save to file
     * import fs from "fs/promises";
     * await fs.writeFile("performance-report.md", markdown);
     * ```
     */
    static getReport(strategyName: string): Promise<string>;
    /**
     * Saves performance report to disk.
     *
     * Creates directory if it doesn't exist.
     * Default path: ./logs/performance/{strategyName}.md
     *
     * @param strategyName - Strategy name to save report for
     * @param path - Optional custom directory path
     *
     * @example
     * ```typescript
     * // Save to default path: ./logs/performance/my-strategy.md
     * await Performance.dump("my-strategy");
     *
     * // Save to custom path: ./reports/perf/my-strategy.md
     * await Performance.dump("my-strategy", "./reports/perf");
     * ```
     */
    static dump(strategyName: string, path?: string): Promise<void>;
    /**
     * Clears accumulated performance metrics from memory.
     *
     * @param strategyName - Optional strategy name to clear specific strategy's metrics
     *
     * @example
     * ```typescript
     * // Clear specific strategy metrics
     * await Performance.clear("my-strategy");
     *
     * // Clear all metrics for all strategies
     * await Performance.clear();
     * ```
     */
    static clear(strategyName?: string): Promise<void>;
}

/**
 * Utility class for walker operations.
 *
 * Provides simplified access to walkerGlobalService.run() with logging.
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
     * Gets walker results data from all strategy comparisons.
     *
     * @param symbol - Trading symbol
     * @param walkerName - Walker name to get data for
     * @returns Promise resolving to walker results data object
     *
     * @example
     * ```typescript
     * const results = await Walker.getData("BTCUSDT", "my-walker");
     * console.log(results.bestStrategy, results.bestMetric);
     * ```
     */
    getData: (symbol: string, walkerName: WalkerName) => Promise<IWalkerResults>;
    /**
     * Generates markdown report with all strategy comparisons for a walker.
     *
     * @param symbol - Trading symbol
     * @param walkerName - Walker name to generate report for
     * @returns Promise resolving to markdown formatted report string
     *
     * @example
     * ```typescript
     * const markdown = await Walker.getReport("BTCUSDT", "my-walker");
     * console.log(markdown);
     * ```
     */
    getReport: (symbol: string, walkerName: WalkerName) => Promise<string>;
    /**
     * Saves walker report to disk.
     *
     * @param symbol - Trading symbol
     * @param walkerName - Walker name to save report for
     * @param path - Optional directory path to save report (default: "./logs/walker")
     *
     * @example
     * ```typescript
     * // Save to default path: ./logs/walker/my-walker.md
     * await Walker.dump("BTCUSDT", "my-walker");
     *
     * // Save to custom path: ./custom/path/my-walker.md
     * await Walker.dump("BTCUSDT", "my-walker", "./custom/path");
     * ```
     */
    dump: (symbol: string, walkerName: WalkerName, path?: string) => Promise<void>;
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
 * Done emitter for background execution completion.
 * Emits when background tasks complete (Live.background, Backtest.background).
 */
declare const doneEmitter: Subject<DoneContract>;
/**
 * Progress emitter for backtest execution progress.
 * Emits progress updates during backtest execution.
 */
declare const progressEmitter: Subject<ProgressContract>;
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
declare const walkerCompleteSubject: Subject<IWalkerResults>;

declare const emitters_doneEmitter: typeof doneEmitter;
declare const emitters_errorEmitter: typeof errorEmitter;
declare const emitters_performanceEmitter: typeof performanceEmitter;
declare const emitters_progressEmitter: typeof progressEmitter;
declare const emitters_signalBacktestEmitter: typeof signalBacktestEmitter;
declare const emitters_signalEmitter: typeof signalEmitter;
declare const emitters_signalLiveEmitter: typeof signalLiveEmitter;
declare const emitters_walkerCompleteSubject: typeof walkerCompleteSubject;
declare const emitters_walkerEmitter: typeof walkerEmitter;
declare namespace emitters {
  export { emitters_doneEmitter as doneEmitter, emitters_errorEmitter as errorEmitter, emitters_performanceEmitter as performanceEmitter, emitters_progressEmitter as progressEmitter, emitters_signalBacktestEmitter as signalBacktestEmitter, emitters_signalEmitter as signalEmitter, emitters_signalLiveEmitter as signalLiveEmitter, emitters_walkerCompleteSubject as walkerCompleteSubject, emitters_walkerEmitter as walkerEmitter };
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
     * Calculates VWAP (Volume Weighted Average Price) from last 5 1m candles.
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
    formatQuantity(symbol: string, quantity: number): Promise<string>;
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
 * Connection service routing strategy operations to correct ClientStrategy instance.
 *
 * Routes all IStrategy method calls to the appropriate strategy implementation
 * based on methodContextService.context.strategyName. Uses memoization to cache
 * ClientStrategy instances for performance.
 *
 * Key features:
 * - Automatic strategy routing via method context
 * - Memoized ClientStrategy instances by strategyName
 * - Implements IStrategy interface
 * - Ensures initialization with waitForInit() before operations
 * - Handles both tick() (live) and backtest() operations
 *
 * @example
 * ```typescript
 * // Used internally by framework
 * const result = await strategyConnectionService.tick();
 * // Automatically routes to correct strategy based on methodContext
 * ```
 */
declare class StrategyConnectionService implements IStrategy {
    private readonly loggerService;
    private readonly executionContextService;
    private readonly strategySchemaService;
    private readonly exchangeConnectionService;
    private readonly methodContextService;
    /**
     * Retrieves memoized ClientStrategy instance for given strategy name.
     *
     * Creates ClientStrategy on first call, returns cached instance on subsequent calls.
     * Cache key is strategyName string.
     *
     * @param strategyName - Name of registered strategy schema
     * @returns Configured ClientStrategy instance
     */
    private getStrategy;
    /**
     * Executes live trading tick for current strategy.
     *
     * Waits for strategy initialization before processing tick.
     * Evaluates current market conditions and returns signal state.
     *
     * @returns Promise resolving to tick result (idle, opened, active, closed)
     */
    tick: () => Promise<IStrategyTickResult>;
    /**
     * Executes backtest for current strategy with provided candles.
     *
     * Waits for strategy initialization before processing candles.
     * Evaluates strategy signals against historical data.
     *
     * @param candles - Array of historical candle data to backtest
     * @returns Promise resolving to backtest result (signal or idle)
     */
    backtest: (candles: ICandleData[]) => Promise<IStrategyBacktestResult>;
    /**
     * Stops the specified strategy from generating new signals.
     *
     * Delegates to ClientStrategy.stop() which sets internal flag to prevent
     * getSignal from being called on subsequent ticks.
     *
     * @param strategyName - Name of strategy to stop
     * @returns Promise that resolves when stop flag is set
     */
    stop: (strategyName: StrategyName) => Promise<void>;
    /**
     * Clears the memoized ClientStrategy instance from cache.
     *
     * Forces re-initialization of strategy on next getStrategy call.
     * Useful for resetting strategy state or releasing resources.
     *
     * @param strategyName - Name of strategy to clear from cache
     */
    clear: (strategyName: StrategyName) => Promise<void>;
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
    getTimeframe: (symbol: string) => Promise<Date[]>;
}

/**
 * Global service for exchange operations with execution context injection.
 *
 * Wraps ExchangeConnectionService with ExecutionContextService to inject
 * symbol, when, and backtest parameters into the execution context.
 *
 * Used internally by BacktestLogicPrivateService and LiveLogicPrivateService.
 */
declare class ExchangeGlobalService {
    private readonly loggerService;
    private readonly exchangeConnectionService;
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
 * Global service for strategy operations with execution context injection.
 *
 * Wraps StrategyConnectionService with ExecutionContextService to inject
 * symbol, when, and backtest parameters into the execution context.
 *
 * Used internally by BacktestLogicPrivateService and LiveLogicPrivateService.
 */
declare class StrategyGlobalService {
    private readonly loggerService;
    private readonly strategyConnectionService;
    /**
     * Checks signal status at a specific timestamp.
     *
     * Wraps strategy tick() with execution context containing symbol, timestamp,
     * and backtest mode flag.
     *
     * @param symbol - Trading pair symbol
     * @param when - Timestamp for tick evaluation
     * @param backtest - Whether running in backtest mode
     * @returns Discriminated union of tick result (idle, opened, active, closed)
     */
    tick: (symbol: string, when: Date, backtest: boolean) => Promise<IStrategyTickResult>;
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
     * @returns Closed signal result with PNL
     */
    backtest: (symbol: string, candles: ICandleData[], when: Date, backtest: boolean) => Promise<IStrategyBacktestResult>;
    /**
     * Stops the strategy from generating new signals.
     *
     * Delegates to StrategyConnectionService.stop() to set internal flag.
     * Does not require execution context.
     *
     * @param strategyName - Name of strategy to stop
     * @returns Promise that resolves when stop flag is set
     */
    stop: (strategyName: StrategyName) => Promise<void>;
    /**
     * Clears the memoized ClientStrategy instance from cache.
     *
     * Delegates to StrategyConnectionService.clear() to remove strategy from cache.
     * Forces re-initialization of strategy on next operation.
     *
     * @param strategyName - Name of strategy to clear from cache
     */
    clear: (strategyName: StrategyName) => Promise<void>;
}

/**
 * Global service for frame operations.
 *
 * Wraps FrameConnectionService for timeframe generation.
 * Used internally by BacktestLogicPrivateService.
 */
declare class FrameGlobalService {
    private readonly loggerService;
    private readonly frameConnectionService;
    /**
     * Generates timeframe array for backtest iteration.
     *
     * @param symbol - Trading pair symbol
     * @returns Promise resolving to array of Date objects
     */
    getTimeframe: (symbol: string) => Promise<Date[]>;
}

/**
 * Global service providing access to walker functionality.
 *
 * Simple wrapper around WalkerLogicPublicService for dependency injection.
 * Used by public API exports.
 */
declare class WalkerGlobalService {
    private readonly loggerService;
    private readonly walkerLogicPublicService;
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
    private readonly strategyGlobalService;
    private readonly exchangeGlobalService;
    private readonly frameGlobalService;
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
    run(symbol: string): AsyncGenerator<IStrategyTickResultClosed, void, unknown>;
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
    private readonly strategyGlobalService;
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
    }) => AsyncGenerator<IStrategyTickResultClosed, void, unknown>;
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
declare class LiveGlobalService {
    private readonly loggerService;
    private readonly liveLogicPublicService;
    private readonly strategyValidationService;
    private readonly exchangeValidationService;
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
declare class BacktestGlobalService {
    private readonly loggerService;
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
    }) => AsyncGenerator<IStrategyTickResultClosed, void, unknown>;
}

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
    }) => Promise<IWalkerResults>;
    /**
     * Generates markdown report with all strategy results for a walker.
     * Delegates to ReportStorage.getReport().
     *
     * @param walkerName - Walker name to generate report for
     * @param symbol - Trading symbol
     * @param metric - Metric being optimized
     * @param context - Context with exchangeName and frameName
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
    }) => Promise<string>;
    /**
     * Saves walker report to disk.
     * Creates directory if it doesn't exist.
     * Delegates to ReportStorage.dump().
     *
     * @param walkerName - Walker name to save report for
     * @param symbol - Trading symbol
     * @param metric - Metric being optimized
     * @param context - Context with exchangeName and frameName
     * @param path - Directory path to save report (default: "./logs/walker")
     *
     * @example
     * ```typescript
     * const service = new WalkerMarkdownService();
     *
     * // Save to default path: ./logs/walker/my-walker.md
     * await service.dump("my-walker", "BTCUSDT", "sharpeRatio", { exchangeName: "binance", frameName: "1d" });
     *
     * // Save to custom path: ./custom/path/my-walker.md
     * await service.dump("my-walker", "BTCUSDT", "sharpeRatio", { exchangeName: "binance", frameName: "1d" }, "./custom/path");
     * ```
     */
    dump: (walkerName: WalkerName, symbol: string, metric: WalkerMetric, context: {
        exchangeName: string;
        frameName: string;
    }, path?: string) => Promise<void>;
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
 * @class ExchangeValidationService
 * Service for managing and validating exchange configurations
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
 * @class StrategyValidationService
 * Service for managing and validating strategy configurations
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
     * Validates the existence of a strategy
     * @public
     * @throws {Error} If strategyName is not found
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
 * @class FrameValidationService
 * Service for managing and validating frame configurations
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
 * @class WalkerValidationService
 * Service for managing and validating walker configurations
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

declare const backtest: {
    exchangeValidationService: ExchangeValidationService;
    strategyValidationService: StrategyValidationService;
    frameValidationService: FrameValidationService;
    walkerValidationService: WalkerValidationService;
    backtestMarkdownService: BacktestMarkdownService;
    liveMarkdownService: LiveMarkdownService;
    performanceMarkdownService: PerformanceMarkdownService;
    walkerMarkdownService: WalkerMarkdownService;
    backtestLogicPublicService: BacktestLogicPublicService;
    liveLogicPublicService: LiveLogicPublicService;
    walkerLogicPublicService: WalkerLogicPublicService;
    backtestLogicPrivateService: BacktestLogicPrivateService;
    liveLogicPrivateService: LiveLogicPrivateService;
    walkerLogicPrivateService: WalkerLogicPrivateService;
    exchangeGlobalService: ExchangeGlobalService;
    strategyGlobalService: StrategyGlobalService;
    frameGlobalService: FrameGlobalService;
    liveGlobalService: LiveGlobalService;
    backtestGlobalService: BacktestGlobalService;
    walkerGlobalService: WalkerGlobalService;
    exchangeSchemaService: ExchangeSchemaService;
    strategySchemaService: StrategySchemaService;
    frameSchemaService: FrameSchemaService;
    walkerSchemaService: WalkerSchemaService;
    exchangeConnectionService: ExchangeConnectionService;
    strategyConnectionService: StrategyConnectionService;
    frameConnectionService: FrameConnectionService;
    executionContextService: {
        readonly context: IExecutionContext;
    };
    methodContextService: {
        readonly context: IMethodContext;
    };
    loggerService: LoggerService;
};

export { Backtest, type BacktestStatistics, type CandleInterval, type DoneContract, type EntityId, ExecutionContextService, type FrameInterval, type ICandleData, type IExchangeSchema, type IFrameSchema, type IPersistBase, type ISignalDto, type ISignalRow, type IStrategyPnL, type IStrategySchema, type IStrategyTickResult, type IStrategyTickResultActive, type IStrategyTickResultClosed, type IStrategyTickResultIdle, type IStrategyTickResultOpened, type IWalkerResults, type IWalkerSchema, type IWalkerStrategyResult, Live, type LiveStatistics, MethodContextService, Performance, type PerformanceContract, type PerformanceMetricType, type PerformanceStatistics, PersistBase, PersistSignalAdaper, type ProgressContract, type SignalData, type SignalInterval, type TPersistBase, type TPersistBaseCtor, Walker, type WalkerMetric, addExchange, addFrame, addStrategy, addWalker, emitters, formatPrice, formatQuantity, getAveragePrice, getCandles, getDate, getMode, backtest as lib, listExchanges, listFrames, listStrategies, listWalkers, listenDone, listenDoneOnce, listenError, listenPerformance, listenProgress, listenSignal, listenSignalBacktest, listenSignalBacktestOnce, listenSignalLive, listenSignalLiveOnce, listenSignalOnce, listenWalker, listenWalkerComplete, listenWalkerOnce, setLogger };

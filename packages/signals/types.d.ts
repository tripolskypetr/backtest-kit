import { IBaseMessage, IOutlineHistory } from 'agent-swarm-kit';
import { ICandleData } from 'backtest-kit';

/**
 * Type representing the history container for technical analysis reports.
 *
 * Defines the contract for accumulating and organizing market analysis data
 * for consumption by LLM-based trading strategies. Supports both message array
 * format and outline history format from agent-swarm-kit.
 *
 * @example
 * ```typescript
 * import { commitHistorySetup } from '@backtest-kit/signals';
 *
 * // Using as message array
 * const messages: IBaseMessage[] = [];
 * await commitHistorySetup('BTCUSDT', messages);
 * // messages now contains all technical analysis reports
 *
 * // Using with outline history
 * const outline: IOutlineHistory = createOutline();
 * await commitMicroTermMath('BTCUSDT', outline);
 * ```
 */
type HistoryContract = IBaseMessage[] | IOutlineHistory;

/**
 * Type representing a report generation function for technical analysis.
 *
 * Standard signature for all report commit functions in the signals library.
 * Each function generates a specific type of market analysis (candle history,
 * technical indicators, order book data) and appends it to the history container
 * as formatted markdown.
 *
 * @param symbol - Trading pair symbol (e.g., 'BTCUSDT', 'ETHUSDT')
 * @param history - History container (message array or outline) to append report to
 * @returns Promise that resolves when report is successfully committed
 *
 * @example
 * ```typescript
 * import { commitMicroTermMath } from '@backtest-kit/signals';
 *
 * const messages = [];
 *
 * // Function signature matches ReportFn
 * await commitMicroTermMath('BTCUSDT', messages);
 *
 * // messages[0].content now contains 1-minute technical analysis table
 * ```
 */
type ReportFn = (symbol: string, history: HistoryContract) => Promise<void>;

/**
 * Candle history report generation functions for multi-timeframe analysis.
 *
 * Provides cached functions to fetch and commit OHLCV candle history reports
 * across 4 timeframes (1m, 15m, 30m, 1h) formatted as markdown for LLM consumption.
 * Each function automatically handles caching, error recovery, and report formatting.
 *
 * Key features:
 * - Intelligent caching with timeframe-specific TTL (1m: 1min, 15m: 5min, 30m: 15min, 1h: 30min)
 * - Automatic cache clearing on errors for data freshness
 * - Formatted markdown tables with candle details (OHLCV, volatility, body size, candle type)
 * - User/assistant message pair format for LLM context
 *
 * @module function/history
 */

/**
 * Commits 1-hour candle history report to history container.
 *
 * Fetches and appends a markdown-formatted report of the last 6 hourly candles
 * including OHLCV data, volatility, body size, and candle type (Green/Red/Doji).
 * Automatically clears cache on errors to ensure data freshness.
 *
 * @param symbol - Trading pair symbol (e.g., 'BTCUSDT')
 * @param history - History container to append report to
 * @returns Promise that resolves when report is committed
 *
 * @example
 * ```typescript
 * import { commitHourHistory } from '@backtest-kit/signals';
 *
 * const messages = [];
 * await commitHourHistory('BTCUSDT', messages);
 *
 * // messages now contains:
 * // [
 * //   { role: 'user', content: '=== HOURLY CANDLES HISTORY (LAST 6) ===\n\n...' },
 * //   { role: 'assistant', content: 'Hourly candles history received.' }
 * // ]
 * ```
 */
declare const commitHourHistory: ReportFn;
/**
 * Commits 30-minute candle history report to history container.
 *
 * Fetches and appends a markdown-formatted report of the last 6 thirty-minute candles
 * including OHLCV data, volatility, body size, and candle type (Green/Red/Doji).
 * Automatically clears cache on errors to ensure data freshness.
 *
 * @param symbol - Trading pair symbol (e.g., 'BTCUSDT')
 * @param history - History container to append report to
 * @returns Promise that resolves when report is committed
 *
 * @example
 * ```typescript
 * import { commitThirtyMinuteHistory } from '@backtest-kit/signals';
 *
 * const messages = [];
 * await commitThirtyMinuteHistory('ETHUSDT', messages);
 * ```
 */
declare const commitThirtyMinuteHistory: ReportFn;
/**
 * Commits 15-minute candle history report to history container.
 *
 * Fetches and appends a markdown-formatted report of the last 8 fifteen-minute candles
 * including OHLCV data, volatility, body size, and candle type (Green/Red/Doji).
 * Automatically clears cache on errors to ensure data freshness.
 *
 * @param symbol - Trading pair symbol (e.g., 'BTCUSDT')
 * @param history - History container to append report to
 * @returns Promise that resolves when report is committed
 *
 * @example
 * ```typescript
 * import { commitFifteenMinuteHistory } from '@backtest-kit/signals';
 *
 * const messages = [];
 * await commitFifteenMinuteHistory('BTCUSDT', messages);
 * ```
 */
declare const commitFifteenMinuteHistory: ReportFn;
/**
 * Commits 1-minute candle history report to history container.
 *
 * Fetches and appends a markdown-formatted report of the last 15 one-minute candles
 * including OHLCV data, volatility, body size, and candle type (Green/Red/Doji).
 * Automatically clears cache on errors to ensure data freshness.
 *
 * @param symbol - Trading pair symbol (e.g., 'BTCUSDT')
 * @param history - History container to append report to
 * @returns Promise that resolves when report is committed
 *
 * @example
 * ```typescript
 * import { commitOneMinuteHistory } from '@backtest-kit/signals';
 *
 * const messages = [];
 * await commitOneMinuteHistory('BTCUSDT', messages);
 * ```
 */
declare const commitOneMinuteHistory: ReportFn;

/**
 * Technical indicator report generation functions for multi-timeframe trading analysis.
 *
 * Provides cached functions to fetch and commit comprehensive technical indicator reports
 * across 4 trading timeframes (MicroTerm: 1m, ShortTerm: 15m, SwingTerm: 30m, LongTerm: 1h).
 * Each report includes 50+ indicators formatted as markdown tables for LLM consumption.
 *
 * Key features:
 * - MicroTerm (1m): RSI(9,14), MACD(8,21,5), Stochastic, ADX(9), Bollinger(8,2), ATR, CCI, Volume analysis, Squeeze momentum
 * - ShortTerm (15m): RSI(9), MACD(8,21,5), Stochastic(5,3,3), ADX(14), Bollinger(10,2), Fibonacci levels
 * - SwingTerm (30m): RSI(14), MACD(12,26,9), Stochastic(14,3,3), Bollinger(20,2), Support/Resistance, Fibonacci
 * - LongTerm (1h): RSI(14), MACD(12,26,9), ADX(14), Bollinger(20,2), SMA(50), DEMA, WMA, Volume trends
 * - Intelligent caching with timeframe-specific TTL
 * - Automatic cache clearing on errors
 *
 * @module function/math
 */

/**
 * Commits MicroTerm (1-minute) technical analysis report to history container.
 *
 * Generates comprehensive technical analysis for scalping and ultra-short term trading.
 * Includes 40+ indicators optimized for 1-minute timeframe with 60-candle lookback.
 *
 * Indicators included:
 * - Momentum: RSI(9,14), Stochastic RSI(9,14), MACD(8,21,5), Momentum(5,10), ROC(1,3,5)
 * - Trend: ADX(9), +DI/-DI(9), EMA(3,8,13,21), SMA(8), DEMA(8), WMA(5)
 * - Volatility: ATR(5,9), Bollinger Bands(8,2) with width/position, Squeeze momentum
 * - Volume: SMA(5), volume ratio, volume trend (increasing/decreasing/stable)
 * - Support/Resistance: Dynamic levels from 30-candle window
 * - Price Analysis: 1m/3m/5m price changes, volatility, true range, pressure index
 *
 * @param symbol - Trading pair symbol (e.g., 'BTCUSDT')
 * @param history - History container to append report to
 * @returns Promise that resolves when report is committed
 *
 * @example
 * ```typescript
 * import { commitMicroTermMath } from '@backtest-kit/signals';
 *
 * const messages = [];
 * await commitMicroTermMath('BTCUSDT', messages);
 *
 * // Use in LLM strategy for scalping signals
 * const signal = await llm([
 *   { role: 'system', content: 'Analyze for scalping opportunities' },
 *   ...messages
 * ]);
 * ```
 */
declare const commitMicroTermMath: ReportFn;
/**
 * Commits LongTerm (1-hour) technical analysis report to history container.
 *
 * Generates comprehensive technical analysis for trend identification and position management.
 * Includes 30+ indicators optimized for 1-hour timeframe with 48-candle lookback (48 hours).
 *
 * Indicators included:
 * - Momentum: RSI(14), Stochastic RSI(14), MACD(12,26,9), Stochastic(14,3,3), Momentum(10)
 * - Trend: ADX(14), +DI/-DI(14), SMA(50), EMA(20,34), DEMA(21), WMA(20)
 * - Volatility: ATR(14,20), Bollinger Bands(20,2), CCI(20)
 * - Support/Resistance: 4-candle pivot detection
 * - Fibonacci: Retracement levels (0%, 23.6%, 38.2%, 50%, 61.8%, 78.6%, 100%) with nearest level
 * - Volume: Trend analysis (increasing/decreasing/stable)
 *
 * @param symbol - Trading pair symbol (e.g., 'BTCUSDT')
 * @param history - History container to append report to
 * @returns Promise that resolves when report is committed
 *
 * @example
 * ```typescript
 * import { commitLongTermMath } from '@backtest-kit/signals';
 *
 * const messages = [];
 * await commitLongTermMath('ETHUSDT', messages);
 * ```
 */
declare const commitLongTermMath: ReportFn;
/**
 * Commits ShortTerm (15-minute) technical analysis report to history container.
 *
 * Generates comprehensive technical analysis for day trading strategies.
 * Includes 30+ indicators optimized for 15-minute timeframe with 144-candle lookback (36 hours).
 *
 * Indicators included:
 * - Momentum: RSI(9), Stochastic RSI(9), MACD(8,21,5), Stochastic(5,3,3), Momentum(8), ROC(5,10)
 * - Trend: ADX(14), +DI/-DI(14), SMA(50), EMA(8,21), DEMA(21), WMA(20)
 * - Volatility: ATR(9), Bollinger Bands(10,2) with width, CCI(14)
 * - Support/Resistance: 48-candle window with 0.3% threshold
 * - Fibonacci: Retracement levels over 288-candle lookback (72 hours)
 * - Volume: Trend analysis over 16-candle window
 *
 * @param symbol - Trading pair symbol (e.g., 'BTCUSDT')
 * @param history - History container to append report to
 * @returns Promise that resolves when report is committed
 *
 * @example
 * ```typescript
 * import { commitShortTermMath } from '@backtest-kit/signals';
 *
 * const messages = [];
 * await commitShortTermMath('BTCUSDT', messages);
 * ```
 */
declare const commitShortTermMath: ReportFn;
/**
 * Commits SwingTerm (30-minute) technical analysis report to history container.
 *
 * Generates comprehensive technical analysis for swing trading strategies.
 * Includes 30+ indicators optimized for 30-minute timeframe with 96-candle lookback (48 hours).
 *
 * Indicators included:
 * - Momentum: RSI(14), Stochastic RSI(14), MACD(12,26,9), Stochastic(14,3,3), Momentum(8)
 * - Trend: ADX(14), +DI/-DI(14), SMA(20), EMA(13,34), DEMA(21), WMA(20)
 * - Volatility: ATR(14), Bollinger Bands(20,2) with width, CCI(20), Basic volatility
 * - Support/Resistance: 20-candle window detection
 * - Fibonacci: Support/resistance levels with current level identification
 * - Volume: Trading volume analysis
 * - Price Momentum: 6-period momentum indicator
 *
 * @param symbol - Trading pair symbol (e.g., 'BTCUSDT')
 * @param history - History container to append report to
 * @returns Promise that resolves when report is committed
 *
 * @example
 * ```typescript
 * import { commitSwingTermMath } from '@backtest-kit/signals';
 *
 * const messages = [];
 * await commitSwingTermMath('BTCUSDT', messages);
 * ```
 */
declare const commitSwingTermMath: ReportFn;

/**
 * Orchestrator functions for complete market analysis setup.
 *
 * Provides high-level functions that combine multiple analysis types
 * (order book, candle history, technical indicators) into comprehensive
 * market reports for LLM-based trading strategies.
 *
 * Key features:
 * - commitBookDataReport: Order book analysis with top 20 levels by volume
 * - commitHistorySetup: All-in-one setup with full multi-timeframe analysis
 * - Automatic mode detection (skips order book in backtest mode)
 * - System context injection (symbol, price, timestamp)
 *
 * @module function/other
 */

/**
 * Commits order book analysis report to history container.
 *
 * Fetches and appends real-time order book data including top 20 price levels
 * by volume percentage, best bid/ask, mid price, spread, and depth imbalance.
 * Automatically skipped in backtest mode (order book data unavailable).
 *
 * Order book metrics:
 * - Best Bid/Ask: Top buy and sell prices
 * - Mid Price: (Best Bid + Best Ask) / 2
 * - Spread: Best Ask - Best Bid
 * - Depth Imbalance: (Bid Volume - Ask Volume) / (Bid Volume + Ask Volume)
 *   - Positive = buying pressure
 *   - Negative = selling pressure
 * - Top 20 Levels: Sorted by volume percentage on each side
 *
 * @param symbol - Trading pair symbol (e.g., 'BTCUSDT')
 * @param history - History container to append report to
 * @returns Promise that resolves when report is committed (or immediately in backtest mode)
 *
 * @example
 * ```typescript
 * import { commitBookDataReport } from '@backtest-kit/signals';
 *
 * const messages = [];
 * await commitBookDataReport('BTCUSDT', messages);
 *
 * // In live mode: messages contains order book analysis
 * // In backtest mode: messages unchanged (order book skipped)
 * ```
 */
declare const commitBookDataReport: ReportFn;
/**
 * Commits complete multi-timeframe market analysis setup to history container.
 *
 * All-in-one function that orchestrates the full technical analysis pipeline.
 * Sequentially commits order book data, candle histories, technical indicators,
 * and system context for comprehensive LLM-based trading analysis.
 *
 * Analysis pipeline:
 * 1. Order Book: Top 20 levels, bid/ask depth, spread, imbalance (live mode only)
 * 2. Candle Histories: 1m (15 candles), 15m (8 candles), 30m (6 candles), 1h (6 candles)
 * 3. Technical Indicators:
 *    - MicroTerm (1m): 40+ scalping indicators
 *    - ShortTerm (15m): 30+ day trading indicators
 *    - SwingTerm (30m): 30+ swing trading indicators
 *    - LongTerm (1h): 30+ trend indicators
 * 4. System Context: Symbol, current price (VWAP), timestamp
 *
 * Total output: 150+ indicators across 4 timeframes + order book + candle data
 *
 * @param symbol - Trading pair symbol (e.g., 'BTCUSDT')
 * @param history - History container to append all reports to
 * @returns Promise that resolves when all reports are committed
 *
 * @example
 * ```typescript
 * import { commitHistorySetup } from '@backtest-kit/signals';
 * import { json } from './llm-wrapper';
 *
 * // Complete LLM strategy setup
 * const messages = [
 *   { role: 'system', content: 'You are a trading bot. Analyze and generate signals.' }
 * ];
 *
 * // Inject all technical analysis
 * await commitHistorySetup('BTCUSDT', messages);
 *
 * // Generate trading signal
 * const signal = await json(messages);
 * console.log(signal); // { position: 'long', priceTakeProfit: 50500, priceStopLoss: 49500 }
 * ```
 */
declare const commitHistorySetup: (symbol: string, history: HistoryContract) => Promise<void>;

/**
 * Logger interface for diagnostic output in signals library.
 *
 * Defines the contract for custom logging implementations.
 * By default, signals uses a no-op logger (all methods do nothing).
 * Use setLogger() to provide a custom implementation for debugging and monitoring.
 *
 * @example
 * ```typescript
 * import { setLogger } from '@backtest-kit/signals';
 *
 * // Enable console logging
 * setLogger({
 *   log: console.log,
 *   debug: console.debug,
 *   info: console.info,
 *   warn: console.warn,
 * });
 *
 * // Or custom logger
 * setLogger({
 *   log: (topic, ...args) => myLogger.log(`[SIGNALS] ${topic}`, args),
 *   debug: (topic, ...args) => myLogger.debug(`[SIGNALS] ${topic}`, args),
 *   info: (topic, ...args) => myLogger.info(`[SIGNALS] ${topic}`, args),
 *   warn: (topic, ...args) => myLogger.warn(`[SIGNALS] ${topic}`, args),
 * });
 * ```
 */
interface ILogger {
    /**
     * Log general information.
     * @param topic - Log category or topic
     * @param args - Additional arguments to log
     */
    log(topic: string, ...args: any[]): void;
    /**
     * Log debug information.
     * @param topic - Log category or topic
     * @param args - Additional arguments to log
     */
    debug(topic: string, ...args: any[]): void;
    /**
     * Log informational messages.
     * @param topic - Log category or topic
     * @param args - Additional arguments to log
     */
    info(topic: string, ...args: any[]): void;
    /**
     * Log warning messages.
     * @param topic - Log category or topic
     * @param args - Additional arguments to log
     */
    warn(topic: string, ...args: any[]): void;
}

/**
 * Configuration utilities for signals library.
 *
 * Provides functions to customize library behavior, primarily logging configuration.
 *
 * @module tools/setup
 */

/**
 * Sets custom logger implementation for signals library.
 *
 * By default, signals uses a no-op logger (no output).
 * Use this function to enable logging for debugging and monitoring.
 *
 * @param logger - Custom logger implementation conforming to ILogger interface
 *
 * @example
 * ```typescript
 * import { setLogger } from '@backtest-kit/signals';
 *
 * // Enable console logging
 * setLogger({
 *   log: console.log,
 *   debug: console.debug,
 *   info: console.info,
 *   warn: console.warn,
 * });
 *
 * // Or use custom logger
 * import winston from 'winston';
 * setLogger({
 *   log: (topic, ...args) => winston.log('info', topic, args),
 *   debug: (topic, ...args) => winston.debug(topic, args),
 *   info: (topic, ...args) => winston.info(topic, args),
 *   warn: (topic, ...args) => winston.warn(topic, args),
 * });
 * ```
 */
declare const setLogger: (logger: ILogger) => void;

interface ISwingTermRow {
    symbol: string;
    rsi14: number | null;
    stochasticRSI14: number | null;
    macd12_26_9: number | null;
    signal9: number | null;
    bollingerUpper20_2: number | null;
    bollingerMiddle20_2: number | null;
    bollingerLower20_2: number | null;
    bollingerWidth20_2: number | null;
    stochasticK14_3_3: number | null;
    stochasticD14_3_3: number | null;
    adx14: number | null;
    plusDI14: number | null;
    minusDI14: number | null;
    cci20: number | null;
    atr14: number | null;
    sma20: number | null;
    ema13: number | null;
    ema34: number | null;
    dema21: number | null;
    wma20: number | null;
    momentum8: number | null;
    support: number;
    resistance: number;
    currentPrice: number;
    volume: number;
    volatility: number | null;
    priceMomentum6: number | null;
    fibonacciNearestSupport: number | null;
    fibonacciNearestResistance: number | null;
    fibonacciPositionPercent: number | null;
    bodySize: number;
    closePrice: number;
    date: Date;
    lookbackPeriod: string;
}
/**
 * Service for swing-term (30-minute) technical analysis and markdown report generation.
 *
 * Provides comprehensive technical analysis for 30-minute candles with 25+ indicators
 * including momentum (RSI, MACD), trend (EMA, SMA), volatility (ATR, Bollinger Bands),
 * support/resistance levels, and Fibonacci analysis with nearest support/resistance.
 *
 * Key features:
 * - 25+ technical indicators (RSI, MACD, Bollinger Bands, Stochastic, ADX, etc.)
 * - Support/resistance level detection
 * - Fibonacci retracement and extension analysis with nearest levels
 * - Volume and volatility analysis
 * - Price momentum tracking
 * - Markdown table generation for LLM consumption
 * - Intelligent indicator warmup (skips first 34 candles)
 * - Memory-efficient output (last 30 rows only)
 * - Dependency injection support
 *
 * @example
 * ```typescript
 * import { SwingTermHistoryService } from '@backtest-kit/signals';
 *
 * const service = new SwingTermHistoryService();
 *
 * // Get markdown report for symbol (fetches candles internally)
 * const report = await service.getReport('BTCUSDT');
 * console.log(report); // Markdown table with all indicators
 *
 * // Or analyze custom candles
 * const candles = await getCandles('ETHUSDT', '30m', 96);
 * const rows = await service.getData('ETHUSDT', candles);
 * console.log(rows[0].rsi14); // 52.45
 * console.log(rows[0].fibonacciPositionPercent); // 50.25
 * ```
 */
declare class SwingTermHistoryService {
    private loggerService;
    /**
     * Analyzes candle data and returns technical indicator rows.
     *
     * Calculates all technical indicators for provided candles, skips first WARMUP_PERIOD
     * rows to ensure stability, and returns last TABLE_ROWS_LIMIT rows.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param candles - Array of 30-minute candle data
     * @returns Array of technical analysis rows with all indicators
     *
     * @example
     * ```typescript
     * const candles = await getCandles('BTCUSDT', '30m', 96);
     * const rows = await service.getData('BTCUSDT', candles);
     * console.log(rows.length); // Up to 30 rows
     * console.log(rows[0].rsi14); // 52.45
     * console.log(rows[0].fibonacciNearestSupport); // 42000.50
     * ```
     */
    getData: (symbol: string, candles: ICandleData[]) => Promise<ISwingTermRow[]>;
    /**
     * Generates complete markdown technical analysis report for a symbol.
     *
     * Fetches 96 30-minute candles (48 hours) from exchange, calculates all indicators,
     * and formats results as markdown table optimized for LLM consumption.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @returns Markdown-formatted technical analysis report with table and explanations
     *
     * @example
     * ```typescript
     * const report = await service.getReport('BTCUSDT');
     * console.log(report);
     * // # 30-Min Candles Analysis for BTCUSDT (Historical Data)
     * // > Current time: 2025-01-14T10:30:00.000Z
     * //
     * // | RSI(14) | MACD(12,26,9) | Fibonacci Current Level | ...
     * // | 52.45 | 0.0023 | 50.0% Retracement | ...
     * ```
     */
    getReport: (symbol: string) => Promise<string>;
    /**
     * Converts analysis rows into markdown table format.
     *
     * Takes pre-calculated indicator rows and formats them as markdown table
     * with column headers, formatted values, and data source explanations.
     *
     * @param symbol - Trading pair symbol for price formatting
     * @param rows - Array of technical analysis rows from getData()
     * @returns Markdown-formatted table with all indicators
     *
     * @example
     * ```typescript
     * const candles = await getCandles('BTCUSDT', '30m', 96);
     * const rows = await service.getData('BTCUSDT', candles);
     * const markdown = await service.generateHistoryTable('BTCUSDT', rows);
     * console.log(markdown); // Markdown table
     * ```
     */
    generateHistoryTable: (symbol: string, rows: ISwingTermRow[]) => Promise<string>;
}

/**
 * LongTerm (1-hour) technical analysis service for trend trading.
 *
 * Generates 30+ indicators on 1-hour candles with 48-candle lookback (48 hours).
 * Optimized for multi-day trend trading and position management.
 *
 * Indicators: RSI(14), StochRSI(14), MACD(12,26,9), Bollinger(20,2), Stochastic(14,3,3),
 * ADX(14), ATR(14,20), CCI(20), Momentum(10), SMA(50), EMA(20,34), DEMA(21), WMA(20),
 * Support/Resistance, Fibonacci levels, Volume trends.
 *
 * Used by commitLongTermMath().
 */

interface ILongTermRow {
    symbol: string;
    rsi14: number | null;
    stochasticRSI14: number | null;
    macd12_26_9: number | null;
    signal9: number | null;
    adx14: number | null;
    pdi14: number | null;
    ndi14: number | null;
    atr14: number | null;
    atr14_raw: number | null;
    atr20: number | null;
    cci20: number | null;
    bollinger20_2_upper: number | null;
    bollinger20_2_middle: number | null;
    bollinger20_2_lower: number | null;
    stochastic14_3_3_K: number | null;
    stochastic14_3_3_D: number | null;
    momentum10: number | null;
    dema21: number | null;
    wma20: number | null;
    sma50: number | null;
    ema20: number | null;
    ema34: number | null;
    currentPrice: number;
    support: number;
    resistance: number;
    volumeTrendRatio: number | null;
    fibonacciNearestLevel: string;
    fibonacciNearestPrice: number;
    fibonacciDistance: number;
    bodySize: number;
    closePrice: number;
    date: Date;
    lookbackPeriod: string;
}
/**
 * Service for long-term (1-hour) technical analysis and markdown report generation.
 *
 * Provides comprehensive technical analysis for 1-hour candles with 30+ indicators
 * including momentum (RSI, MACD), trend (EMA, SMA), volatility (ATR, Bollinger Bands),
 * support/resistance levels, and Fibonacci retracements.
 *
 * Key features:
 * - 30+ technical indicators (RSI, MACD, Bollinger Bands, Stochastic, ADX, etc.)
 * - Support/resistance level detection
 * - Fibonacci retracement analysis
 * - Volume trend analysis
 * - Markdown table generation for LLM consumption
 * - Intelligent indicator warmup (skips first 50 candles)
 * - Memory-efficient output (last 48 rows only)
 * - Dependency injection support
 *
 * @example
 * ```typescript
 * import { LongTermHistoryService } from '@backtest-kit/signals';
 *
 * const service = new LongTermHistoryService();
 *
 * // Get markdown report for symbol (fetches candles internally)
 * const report = await service.getReport('BTCUSDT');
 * console.log(report); // Markdown table with all indicators
 *
 * // Or analyze custom candles
 * const candles = await getCandles('ETHUSDT', '1h', 100);
 * const rows = await service.getData('ETHUSDT', candles);
 * console.log(rows[0].rsi14); // 52.45
 * ```
 */
declare class LongTermHistoryService {
    private loggerService;
    /**
     * Analyzes candle data and returns technical indicator rows.
     *
     * Calculates all technical indicators for provided candles, skips first WARMUP_PERIOD
     * rows to ensure stability, and returns last TABLE_ROWS_LIMIT rows.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param candles - Array of 1-hour candle data
     * @returns Array of technical analysis rows with all indicators
     *
     * @example
     * ```typescript
     * const candles = await getCandles('BTCUSDT', '1h', 100);
     * const rows = await service.getData('BTCUSDT', candles);
     * console.log(rows.length); // Up to 48 rows
     * console.log(rows[0].rsi14); // 52.45
     * console.log(rows[0].support); // 42000.50
     * ```
     */
    getData: (symbol: string, candles: ICandleData[]) => Promise<ILongTermRow[]>;
    /**
     * Generates complete markdown technical analysis report for a symbol.
     *
     * Fetches 100 1-hour candles (100 hours) from exchange, calculates all indicators,
     * and formats last 48 rows as markdown table optimized for LLM consumption.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @returns Markdown-formatted technical analysis report with table and explanations
     *
     * @example
     * ```typescript
     * const report = await service.getReport('BTCUSDT');
     * console.log(report);
     * // # 1-Hour Candles Trading Analysis for BTCUSDT (Historical Data)
     * // > Current time: 2025-01-14T10:30:00.000Z
     * //
     * // | RSI(14) | MACD(12,26,9) | Support Level | ...
     * // | 52.45 | 0.0023 | 42000.50 USD | ...
     * ```
     */
    getReport: (symbol: string) => Promise<string>;
    /**
     * Converts analysis rows into markdown table format.
     *
     * Takes pre-calculated indicator rows and formats them as markdown table
     * with column headers, formatted values, and data source explanations.
     *
     * @param symbol - Trading pair symbol for price formatting
     * @param rows - Array of technical analysis rows from getData()
     * @returns Markdown-formatted table with all indicators
     *
     * @example
     * ```typescript
     * const candles = await getCandles('BTCUSDT', '1h', 100);
     * const rows = await service.getData('BTCUSDT', candles);
     * const markdown = await service.generateHistoryTable('BTCUSDT', rows);
     * console.log(markdown); // Markdown table
     * ```
     */
    generateHistoryTable: (symbol: string, rows: ILongTermRow[]) => Promise<string>;
}

interface IShortTermRow {
    symbol: string;
    rsi9: number | null;
    stochasticRSI9: number | null;
    macd8_21_5: number | null;
    signal5: number | null;
    bollingerUpper10_2: number | null;
    bollingerMiddle10_2: number | null;
    bollingerLower10_2: number | null;
    bollingerWidth10_2: number | null;
    stochasticK5_3_3: number | null;
    stochasticD5_3_3: number | null;
    adx14: number | null;
    plusDI14: number | null;
    minusDI14: number | null;
    atr9: number | null;
    cci14: number | null;
    sma50: number | null;
    ema8: number | null;
    ema21: number | null;
    dema21: number | null;
    wma20: number | null;
    momentum8: number | null;
    roc5: number | null;
    roc10: number | null;
    volumeTrendRatio: number | null;
    support: number;
    resistance: number;
    currentPrice: number;
    fibonacciNearestLevel: string;
    fibonacciNearestPrice: number;
    fibonacciDistance: number;
    bodySize: number;
    closePrice: number;
    date: Date;
    lookbackPeriod: string;
}
/**
 * Service for short-term (15-minute) technical analysis and markdown report generation.
 *
 * Provides comprehensive technical analysis for 15-minute candles with 30+ indicators
 * including momentum (RSI, MACD), trend (EMA, SMA), volatility (ATR, Bollinger Bands),
 * support/resistance levels, and Fibonacci retracements.
 *
 * Key features:
 * - 30+ technical indicators (RSI, MACD, Bollinger Bands, Stochastic, ADX, etc.)
 * - Support/resistance level detection
 * - Fibonacci retracement analysis
 * - Volume trend analysis
 * - Markdown table generation for LLM consumption
 * - Intelligent indicator warmup (skips first 50 candles)
 * - Memory-efficient output (last 48 rows only)
 * - Dependency injection support
 *
 * @example
 * ```typescript
 * import { ShortTermHistoryService } from '@backtest-kit/signals';
 *
 * const service = new ShortTermHistoryService();
 *
 * // Get markdown report for symbol (fetches candles internally)
 * const report = await service.getReport('BTCUSDT');
 * console.log(report); // Markdown table with all indicators
 *
 * // Or analyze custom candles
 * const candles = await getCandles('ETHUSDT', '15m', 144);
 * const rows = await service.getData('ETHUSDT', candles);
 * console.log(rows[0].rsi9); // 45.23
 * ```
 */
declare class ShortTermHistoryService {
    private loggerService;
    /**
     * Analyzes candle data and returns technical indicator rows.
     *
     * Calculates all technical indicators for provided candles, skips first WARMUP_PERIOD
     * rows to ensure stability, and returns last TABLE_ROWS_LIMIT rows.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param candles - Array of 15-minute candle data
     * @returns Array of technical analysis rows with all indicators
     *
     * @example
     * ```typescript
     * const candles = await getCandles('BTCUSDT', '15m', 144);
     * const rows = await service.getData('BTCUSDT', candles);
     * console.log(rows.length); // Up to 48 rows
     * console.log(rows[0].rsi9); // 45.23
     * console.log(rows[0].support); // 42000.50
     * ```
     */
    getData: (symbol: string, candles: ICandleData[]) => Promise<IShortTermRow[]>;
    /**
     * Generates complete markdown technical analysis report for a symbol.
     *
     * Fetches 144 15-minute candles (36 hours) from exchange, calculates all indicators,
     * and formats results as markdown table optimized for LLM consumption.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @returns Markdown-formatted technical analysis report with table and explanations
     *
     * @example
     * ```typescript
     * const report = await service.getReport('BTCUSDT');
     * console.log(report);
     * // # 15-Minute Candles Trading Analysis for BTCUSDT (Historical Data)
     * // > Current time: 2025-01-14T10:30:00.000Z
     * //
     * // | RSI(9) | MACD(8,21,5) | Support Level | ...
     * // | 45.23 | 0.0012 | 42000.50 USD | ...
     * ```
     */
    getReport: (symbol: string) => Promise<string>;
    /**
     * Converts analysis rows into markdown table format.
     *
     * Takes pre-calculated indicator rows and formats them as markdown table
     * with column headers, formatted values, and data source explanations.
     *
     * @param symbol - Trading pair symbol for price formatting
     * @param rows - Array of technical analysis rows from getData()
     * @returns Markdown-formatted table with all indicators
     *
     * @example
     * ```typescript
     * const candles = await getCandles('BTCUSDT', '15m', 144);
     * const rows = await service.getData('BTCUSDT', candles);
     * const markdown = await service.generateHistoryTable('BTCUSDT', rows);
     * console.log(markdown); // Markdown table
     * ```
     */
    generateHistoryTable: (symbol: string, rows: IShortTermRow[]) => Promise<string>;
}

/**
 * MicroTerm (1-minute) technical analysis service for scalping strategies.
 *
 * Generates 40+ indicators on 1-minute candles with 60-candle lookback.
 * Optimized for high-frequency trading and sub-5 minute positions.
 *
 * Indicators: RSI(9,14), StochRSI(9,14), MACD(8,21,5), Bollinger(8,2), Stochastic(3,5),
 * ADX(9), ATR(5,9), CCI(9), Momentum(5,10), ROC(1,3,5), EMA(3,8,13,21), SMA(8), DEMA(8),
 * WMA(5), Support/Resistance, Volume analysis, Squeeze momentum.
 *
 * Used by commitMicroTermMath().
 */

interface IMicroTermRow {
    symbol: string;
    rsi9: number | null;
    rsi14: number | null;
    stochasticRSI9: number | null;
    stochasticRSI14: number | null;
    macd8_21_5: number | null;
    signal5: number | null;
    macdHistogram: number | null;
    bollingerUpper8_2: number | null;
    bollingerMiddle8_2: number | null;
    bollingerLower8_2: number | null;
    bollingerWidth8_2: number | null;
    bollingerPosition: number | null;
    stochasticK3_3_3: number | null;
    stochasticD3_3_3: number | null;
    stochasticK5_3_3: number | null;
    stochasticD5_3_3: number | null;
    adx9: number | null;
    plusDI9: number | null;
    minusDI9: number | null;
    atr5: number | null;
    atr9: number | null;
    cci9: number | null;
    momentum5: number | null;
    momentum10: number | null;
    roc1: number | null;
    roc3: number | null;
    roc5: number | null;
    ema3: number | null;
    ema8: number | null;
    ema13: number | null;
    ema21: number | null;
    sma8: number | null;
    dema8: number | null;
    wma5: number | null;
    volumeSma5: number | null;
    volumeRatio: number | null;
    volumeTrendRatio: number | null;
    currentPrice: number;
    priceChange1m: number | null;
    priceChange3m: number | null;
    priceChange5m: number | null;
    volatility5: number | null;
    trueRange: number | null;
    support: number;
    resistance: number;
    squeezeMomentum: number | null;
    pressureIndex: number | null;
    closePrice: number;
    date: Date;
    lookbackPeriod: string;
}
/**
 * Service for micro-term (1-minute) technical analysis and markdown report generation.
 *
 * Provides comprehensive technical analysis for 1-minute candles with 40+ indicators
 * including momentum (RSI, MACD), trend (EMA, SMA), volatility (ATR, Bollinger Bands),
 * support/resistance levels, volume analysis, and specialized scalping indicators.
 *
 * Key features:
 * - 40+ technical indicators (RSI, MACD, Bollinger Bands, Stochastic, ADX, etc.)
 * - Support/resistance level detection (30-candle lookback)
 * - Volume analysis (SMA, ratio, trend)
 * - Price change tracking (1m, 3m, 5m)
 * - Specialized scalping indicators (squeeze momentum, pressure index, Bollinger position)
 * - Volatility and true range calculations
 * - Markdown table generation for LLM consumption
 * - Intelligent indicator warmup (skips first 21 candles)
 * - Memory-efficient output (last 40 rows only)
 * - Dependency injection support
 *
 * @example
 * ```typescript
 * import { MicroTermHistoryService } from '@backtest-kit/signals';
 *
 * const service = new MicroTermHistoryService();
 *
 * // Get markdown report for symbol (fetches candles internally)
 * const report = await service.getReport('BTCUSDT');
 * console.log(report); // Markdown table with all indicators
 *
 * // Or analyze custom candles
 * const candles = await getCandles('ETHUSDT', '1m', 60);
 * const rows = await service.getData('ETHUSDT', candles);
 * console.log(rows[0].rsi9); // 45.23
 * console.log(rows[0].squeezeMomentum); // 1.25
 * ```
 */
declare class MicroTermHistoryService {
    private loggerService;
    /**
     * Analyzes candle data and returns technical indicator rows.
     *
     * Calculates all technical indicators for provided candles, skips first WARMUP_PERIOD
     * rows to ensure stability, and returns last TABLE_ROWS_LIMIT rows.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @param candles - Array of 1-minute candle data
     * @returns Array of technical analysis rows with all indicators
     *
     * @example
     * ```typescript
     * const candles = await getCandles('BTCUSDT', '1m', 60);
     * const rows = await service.getData('BTCUSDT', candles);
     * console.log(rows.length); // Up to 40 rows
     * console.log(rows[0].rsi9); // 45.23
     * console.log(rows[0].volumeRatio); // 1.25
     * ```
     */
    getData: (symbol: string, candles: ICandleData[]) => Promise<IMicroTermRow[]>;
    /**
     * Generates complete markdown technical analysis report for a symbol.
     *
     * Fetches 60 1-minute candles (60 minutes) from exchange, calculates all indicators,
     * and formats results as markdown table optimized for LLM consumption.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @returns Markdown-formatted technical analysis report with table and explanations
     *
     * @example
     * ```typescript
     * const report = await service.getReport('BTCUSDT');
     * console.log(report);
     * // # 1-Minute Candles Trading Analysis for BTCUSDT (Historical Data)
     * // > Current time: 2025-01-14T10:30:00.000Z
     * //
     * // | RSI(9) | MACD(8,21,5) | Squeeze Momentum | ...
     * // | 45.23 | 0.0012 | 1.25 | ...
     * ```
     */
    getReport: (symbol: string) => Promise<string>;
    /**
     * Converts analysis rows into markdown table format.
     *
     * Takes pre-calculated indicator rows and formats them as markdown table
     * with column headers, formatted values, and data source explanations.
     *
     * @param symbol - Trading pair symbol for price formatting
     * @param rows - Array of technical analysis rows from getData()
     * @returns Markdown-formatted table with all indicators
     *
     * @example
     * ```typescript
     * const candles = await getCandles('BTCUSDT', '1m', 60);
     * const rows = await service.getData('BTCUSDT', candles);
     * const markdown = await service.generateHistoryTable('BTCUSDT', rows);
     * console.log(markdown); // Markdown table
     * ```
     */
    generateHistoryTable: (symbol: string, rows: IMicroTermRow[]) => Promise<string>;
}

/**
 * Fifteen-minute candle history service for day trading analysis.
 *
 * Generates markdown reports of the last 8 fifteen-minute candles including:
 * - OHLCV data with high-volatility detection
 * - Candle type (Green/Red/Doji)
 * - Volatility percentage (flagged if >1.5x average)
 * - Body size percentage
 * - Timestamp
 *
 * Used by commitFifteenMinuteHistory() for LLM context injection.
 */

/**
 * Service for generating 15-minute candle history reports for day trading analysis.
 *
 * Provides detailed OHLCV analysis for the last 8 fifteen-minute candles with
 * candle pattern identification, volatility metrics, high-volatility detection,
 * and body size calculations.
 *
 * Key features:
 * - Last 8 fifteen-minute candles (2 hours of price action)
 * - OHLCV data with formatted prices and volumes
 * - Candle type identification (Green/Red/Doji)
 * - Volatility percentage calculations
 * - High-volatility detection (>1.5x average volatility)
 * - Body size percentage relative to candle range
 * - ISO timestamp formatting
 * - Dependency injection support
 *
 * @example
 * ```typescript
 * import { FifteenMinuteCandleHistoryService } from '@backtest-kit/signals';
 *
 * const service = new FifteenMinuteCandleHistoryService();
 *
 * // Get markdown report
 * const report = await service.getReport('BTCUSDT');
 * console.log(report);
 * // ## 15-Minute Candles History (Last 8)
 * // ### 15m Candle 1 (Green) HIGH-VOLATILITY
 * // - **Open**: 42000.50 USD
 * // - **15m Volatility**: 0.85%
 *
 * // Or get raw candle data
 * const candles = await service.getData('ETHUSDT');
 * console.log(candles.length); // 8
 * ```
 */
declare class FifteenMinuteCandleHistoryService {
    private loggerService;
    /**
     * Fetches last 8 fifteen-minute candles for a symbol.
     *
     * Retrieves recent 15-minute candles from exchange for day trading analysis.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @returns Array of 8 fifteen-minute candles
     *
     * @example
     * ```typescript
     * const candles = await service.getData('BTCUSDT');
     * console.log(candles.length); // 8
     * console.log(candles[0].close); // Latest candle close price
     * ```
     */
    getData: (symbol: string) => Promise<ICandleData[]>;
    /**
     * Generates markdown report from candle data with volatility detection.
     *
     * Creates detailed markdown report with OHLCV data, candle patterns,
     * volatility metrics, and HIGH-VOLATILITY flags for candles exceeding
     * 1.5x the average volatility of all candles.
     *
     * @param symbol - Trading pair symbol for price formatting
     * @param candles - Array of candle data to analyze
     * @returns Markdown-formatted candle history report with volatility flags
     *
     * @example
     * ```typescript
     * const candles = await service.getData('BTCUSDT');
     * const report = await service.generateReport('BTCUSDT', candles);
     * console.log(report);
     * // ## 15-Minute Candles History (Last 8)
     * // ### 15m Candle 1 (Green) HIGH-VOLATILITY
     * // - **Open**: 42000.50 USD
     * ```
     */
    generateReport: (symbol: string, candles: ICandleData[]) => Promise<string>;
    /**
     * Generates complete markdown candle history report for a symbol.
     *
     * Fetches last 8 fifteen-minute candles and formats them as markdown report
     * with OHLCV data, patterns, volatility flags, and metrics.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @returns Markdown-formatted candle history report with high-volatility detection
     *
     * @example
     * ```typescript
     * const report = await service.getReport('BTCUSDT');
     * console.log(report);
     * // ## 15-Minute Candles History (Last 8)
     * // > Current time: 2025-01-14T10:30:00.000Z
     * //
     * // ### 15m Candle 1 (Green) HIGH-VOLATILITY
     * // - **Time**: 2025-01-14T10:15:00.000Z
     * // - **Open**: 42000.50 USD
     * // - **15m Volatility**: 0.85%
     * ```
     */
    getReport: (symbol: string) => Promise<string>;
}

/**
 * Hourly candle history service for trend analysis.
 *
 * Generates markdown reports of the last 6 hourly candles including:
 * - OHLCV data
 * - Candle type (Green/Red/Doji)
 * - Volatility percentage
 * - Body size percentage
 * - Timestamp
 *
 * Used by commitHourHistory() for LLM context injection.
 */

/**
 * Service for generating 1-hour candle history reports for trend analysis.
 *
 * Provides detailed OHLCV analysis for the last 6 hourly candles with
 * candle pattern identification, volatility metrics, and body size calculations.
 *
 * Key features:
 * - Last 6 hourly candles (6 hours of price action)
 * - OHLCV data with formatted prices and volumes
 * - Candle type identification (Green/Red/Doji)
 * - Volatility percentage calculations
 * - Body size percentage relative to candle range
 * - ISO timestamp formatting
 * - Dependency injection support
 *
 * @example
 * ```typescript
 * import { HourCandleHistoryService } from '@backtest-kit/signals';
 *
 * const service = new HourCandleHistoryService();
 *
 * // Get markdown report
 * const report = await service.getReport('BTCUSDT');
 * console.log(report);
 * // ## Hourly Candles History (Last 6)
 * // ### 1h Candle 1 (Green)
 * // - **Open**: 42000.50 USD
 * // - **1h Volatility**: 2.15%
 *
 * // Or get raw candle data
 * const candles = await service.getData('ETHUSDT');
 * console.log(candles.length); // 6
 * ```
 */
declare class HourCandleHistoryService {
    private loggerService;
    /**
     * Fetches last 6 hourly candles for a symbol.
     *
     * Retrieves recent 1-hour candles from exchange for trend analysis.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @returns Array of 6 hourly candles
     *
     * @example
     * ```typescript
     * const candles = await service.getData('BTCUSDT');
     * console.log(candles.length); // 6
     * console.log(candles[0].close); // Latest candle close price
     * ```
     */
    getData: (symbol: string) => Promise<ICandleData[]>;
    /**
     * Generates markdown report from candle data.
     *
     * Creates detailed markdown report with OHLCV data, candle patterns,
     * volatility metrics, and body size percentages for each candle.
     *
     * @param symbol - Trading pair symbol for price formatting
     * @param candles - Array of candle data to analyze
     * @returns Markdown-formatted candle history report
     *
     * @example
     * ```typescript
     * const candles = await service.getData('BTCUSDT');
     * const report = await service.generateReport('BTCUSDT', candles);
     * console.log(report);
     * // ## Hourly Candles History (Last 6)
     * // ### 1h Candle 1 (Green)
     * // - **Open**: 42000.50 USD
     * ```
     */
    generateReport: (symbol: string, candles: ICandleData[]) => Promise<string>;
    /**
     * Generates complete markdown candle history report for a symbol.
     *
     * Fetches last 6 hourly candles and formats them as markdown report
     * with OHLCV data, patterns, and metrics.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @returns Markdown-formatted candle history report
     *
     * @example
     * ```typescript
     * const report = await service.getReport('BTCUSDT');
     * console.log(report);
     * // ## Hourly Candles History (Last 6)
     * // > Current time: 2025-01-14T10:30:00.000Z
     * //
     * // ### 1h Candle 1 (Green)
     * // - **Time**: 2025-01-14T10:00:00.000Z
     * // - **Open**: 42000.50 USD
     * // - **1h Volatility**: 2.15%
     * ```
     */
    getReport: (symbol: string) => Promise<string>;
}

/**
 * One-minute candle history service for ultra-short term analysis.
 *
 * Generates markdown reports of the last 15 one-minute candles including:
 * - OHLCV data (Open, High, Low, Close, Volume)
 * - Candle type (Green/Red/Doji)
 * - Volatility percentage
 * - Body size percentage
 * - Timestamp
 *
 * Used by commitOneMinuteHistory() for LLM context injection.
 */

/**
 * Service for generating 1-minute candle history reports for scalping analysis.
 *
 * Provides detailed OHLCV analysis for the last 15 one-minute candles with
 * candle pattern identification, volatility metrics, and body size calculations.
 *
 * Key features:
 * - Last 15 one-minute candles (15 minutes of price action)
 * - OHLCV data with formatted prices and volumes
 * - Candle type identification (Green/Red/Doji)
 * - Volatility percentage calculations
 * - Body size percentage relative to candle range
 * - ISO timestamp formatting
 * - Dependency injection support
 *
 * @example
 * ```typescript
 * import { OneMinuteCandleHistoryService } from '@backtest-kit/signals';
 *
 * const service = new OneMinuteCandleHistoryService();
 *
 * // Get markdown report
 * const report = await service.getReport('BTCUSDT');
 * console.log(report);
 * // ## One-Minute Candles History (Last 15)
 * // ### 1m Candle 1 (Green)
 * // - **Open**: 42000.50 USD
 * // - **1m Volatility**: 0.15%
 *
 * // Or get raw candle data
 * const candles = await service.getData('ETHUSDT');
 * console.log(candles.length); // 15
 * ```
 */
declare class OneMinuteCandleHistoryService {
    private loggerService;
    /**
     * Fetches last 15 one-minute candles for a symbol.
     *
     * Retrieves recent 1-minute candles from exchange for scalping analysis.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @returns Array of 15 one-minute candles
     *
     * @example
     * ```typescript
     * const candles = await service.getData('BTCUSDT');
     * console.log(candles.length); // 15
     * console.log(candles[0].close); // Latest candle close price
     * ```
     */
    getData: (symbol: string) => Promise<ICandleData[]>;
    /**
     * Generates markdown report from candle data.
     *
     * Creates detailed markdown report with OHLCV data, candle patterns,
     * volatility metrics, and body size percentages for each candle.
     *
     * @param symbol - Trading pair symbol for price formatting
     * @param candles - Array of candle data to analyze
     * @returns Markdown-formatted candle history report
     *
     * @example
     * ```typescript
     * const candles = await service.getData('BTCUSDT');
     * const report = await service.generateReport('BTCUSDT', candles);
     * console.log(report);
     * // ## One-Minute Candles History (Last 15)
     * // ### 1m Candle 1 (Green)
     * // - **Open**: 42000.50 USD
     * ```
     */
    generateReport: (symbol: string, candles: ICandleData[]) => Promise<string>;
    /**
     * Generates complete markdown candle history report for a symbol.
     *
     * Fetches last 15 one-minute candles and formats them as markdown report
     * with OHLCV data, patterns, and metrics.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @returns Markdown-formatted candle history report
     *
     * @example
     * ```typescript
     * const report = await service.getReport('BTCUSDT');
     * console.log(report);
     * // ## One-Minute Candles History (Last 15)
     * // > Current time: 2025-01-14T10:30:00.000Z
     * //
     * // ### 1m Candle 1 (Green)
     * // - **Time**: 2025-01-14T10:29:00.000Z
     * // - **Open**: 42000.50 USD
     * // - **1m Volatility**: 0.15%
     * ```
     */
    getReport: (symbol: string) => Promise<string>;
}

/**
 * Thirty-minute candle history service for swing trading analysis.
 *
 * Generates markdown reports of the last 6 thirty-minute candles including:
 * - OHLCV data
 * - Candle type (Green/Red/Doji)
 * - Volatility percentage
 * - Body size percentage
 * - Timestamp
 *
 * Used by commitThirtyMinuteHistory() for LLM context injection.
 */

/**
 * Service for generating 30-minute candle history reports for swing trading analysis.
 *
 * Provides detailed OHLCV analysis for the last 6 thirty-minute candles with
 * candle pattern identification, volatility metrics, and body size calculations.
 *
 * Key features:
 * - Last 6 thirty-minute candles (3 hours of price action)
 * - OHLCV data with formatted prices and volumes
 * - Candle type identification (Green/Red/Doji)
 * - Volatility percentage calculations
 * - Body size percentage relative to candle range
 * - ISO timestamp formatting
 * - Dependency injection support
 *
 * @example
 * ```typescript
 * import { ThirtyMinuteCandleHistoryService } from '@backtest-kit/signals';
 *
 * const service = new ThirtyMinuteCandleHistoryService();
 *
 * // Get markdown report
 * const report = await service.getReport('BTCUSDT');
 * console.log(report);
 * // ## 30-Min Candles History (Last 6)
 * // ### 30m Candle 1 (Green)
 * // - **Open**: 42000.50 USD
 * // - **30m Volatility**: 1.25%
 *
 * // Or get raw candle data
 * const candles = await service.getData('ETHUSDT');
 * console.log(candles.length); // 6
 * ```
 */
declare class ThirtyMinuteCandleHistoryService {
    private loggerService;
    /**
     * Fetches last 6 thirty-minute candles for a symbol.
     *
     * Retrieves recent 30-minute candles from exchange for analysis.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @returns Array of 6 thirty-minute candles
     *
     * @example
     * ```typescript
     * const candles = await service.getData('BTCUSDT');
     * console.log(candles.length); // 6
     * console.log(candles[0].close); // Latest candle close price
     * ```
     */
    getData: (symbol: string) => Promise<ICandleData[]>;
    /**
     * Generates markdown report from candle data.
     *
     * Creates detailed markdown report with OHLCV data, candle patterns,
     * volatility metrics, and body size percentages for each candle.
     *
     * @param symbol - Trading pair symbol for price formatting
     * @param candles - Array of candle data to analyze
     * @returns Markdown-formatted candle history report
     *
     * @example
     * ```typescript
     * const candles = await service.getData('BTCUSDT');
     * const report = await service.generateReport('BTCUSDT', candles);
     * console.log(report);
     * // ## 30-Min Candles History (Last 6)
     * // ### 30m Candle 1 (Green)
     * // - **Open**: 42000.50 USD
     * ```
     */
    generateReport: (symbol: string, candles: ICandleData[]) => Promise<string>;
    /**
     * Generates complete markdown candle history report for a symbol.
     *
     * Fetches last 6 thirty-minute candles and formats them as markdown report
     * with OHLCV data, patterns, and metrics.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @returns Markdown-formatted candle history report
     *
     * @example
     * ```typescript
     * const report = await service.getReport('BTCUSDT');
     * console.log(report);
     * // ## 30-Min Candles History (Last 6)
     * // > Current time: 2025-01-14T10:30:00.000Z
     * //
     * // ### 30m Candle 1 (Green)
     * // - **Time**: 2025-01-14T10:00:00.000Z
     * // - **Open**: 42000.50 USD
     * // - **30m Volatility**: 1.25%
     * ```
     */
    getReport: (symbol: string) => Promise<string>;
}

/**
 * Order book analysis service for real-time market depth and liquidity assessment.
 *
 * Generates comprehensive order book reports including:
 * - Top 20 bid/ask levels sorted by volume percentage
 * - Best bid/ask prices
 * - Mid price and spread
 * - Depth imbalance (buy vs sell pressure indicator)
 *
 * Depth Imbalance Formula:
 * (Total Bid Volume - Total Ask Volume) / (Total Bid Volume + Total Ask Volume)
 * - Positive: Buy pressure (more bids)
 * - Negative: Sell pressure (more asks)
 * - Zero: Balanced market
 *
 * Used by commitBookDataReport() for LLM context injection.
 * Only available in live mode (skipped in backtest mode).
 */
/**
 * Order book entry with volume percentage.
 */
interface IOrderBookEntry {
    /** Price level */
    price: number;
    /** Total quantity at this price */
    quantity: number;
    /** Percentage of total side volume */
    percentage: number;
}
/**
 * Complete order book analysis result.
 */
interface IBookDataAnalysis {
    /** Trading pair symbol */
    symbol: string;
    /** Analysis timestamp */
    timestamp: string;
    /** Bid (buy) levels with percentages */
    bids: IOrderBookEntry[];
    /** Ask (sell) levels with percentages */
    asks: IOrderBookEntry[];
    /** Highest bid price */
    bestBid: number;
    /** Lowest ask price */
    bestAsk: number;
    /** Mid price: (bestBid + bestAsk) / 2 */
    midPrice: number;
    /** Spread: bestAsk - bestBid */
    spread: number;
    /** Depth imbalance: (bidVol - askVol) / (bidVol + askVol) */
    depthImbalance: number;
}
/**
 * Service for order book analysis and markdown report generation.
 *
 * Provides real-time order book depth analysis with market liquidity metrics
 * including bid/ask levels, depth imbalance, spread, and volume distribution.
 *
 * Key features:
 * - Fetches up to 1000 order book depth levels
 * - Calculates best bid/ask, mid price, and spread
 * - Computes depth imbalance (buy vs sell pressure)
 * - Analyzes volume distribution with percentage calculations
 * - Generates markdown reports with top 20 levels
 * - Only available in live mode (skipped in backtest)
 * - Dependency injection support
 *
 * @example
 * ```typescript
 * import { BookDataMathService } from '@backtest-kit/signals';
 *
 * const service = new BookDataMathService();
 *
 * // Get markdown report (fetches order book internally)
 * const report = await service.getReport('BTCUSDT');
 * console.log(report); // Markdown with top 20 bid/ask levels
 *
 * // Or analyze custom order book data
 * const analysis = await service.getData('ETHUSDT');
 * console.log(analysis.depthImbalance); // 0.125 (12.5% buy pressure)
 * console.log(analysis.bestBid); // 2300.50
 * ```
 */
declare class BookDataMathService {
    private loggerService;
    /**
     * Converts order book analysis into markdown report format.
     *
     * Takes pre-calculated order book analysis and formats it as markdown
     * with summary metrics and top 20 bid/ask levels sorted by volume.
     *
     * @param symbol - Trading pair symbol for header
     * @param bookData - Order book analysis from getData()
     * @returns Markdown-formatted order book report
     *
     * @example
     * ```typescript
     * const analysis = await service.getData('BTCUSDT');
     * const report = await service.generateReport('BTCUSDT', analysis);
     * console.log(report); // Markdown table with order book data
     * ```
     */
    generateReport: (symbol: string, bookData: IBookDataAnalysis) => Promise<string>;
    /**
     * Generates complete markdown order book report for a symbol.
     *
     * Fetches order book depth (up to 1000 levels) from exchange, calculates all metrics,
     * and formats results as markdown report optimized for LLM consumption.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @returns Markdown-formatted order book report with depth analysis
     *
     * @example
     * ```typescript
     * const report = await service.getReport('BTCUSDT');
     * console.log(report);
     * // # Order Book Analysis for BTCUSDT
     * // > Current time: 2025-01-14T10:30:00.000Z
     * //
     * // ## Order Book Summary
     * // - **Best Bid**: 42000.50 USD
     * // - **Depth Imbalance**: 12.5%
     * //
     * // ## Top 20 Order Book Levels
     * // ### Bids (Buy Orders)
     * // | Price | Quantity | % of Total |
     * ```
     */
    getReport: (symbol: string) => Promise<string>;
    /**
     * Fetches and analyzes order book data with depth metrics.
     *
     * Retrieves up to 1000 depth levels from exchange, processes bid/ask data,
     * calculates volume percentages, and computes market depth metrics including
     * best bid/ask, mid price, spread, and depth imbalance.
     *
     * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
     * @returns Order book analysis with all calculated metrics
     *
     * @example
     * ```typescript
     * const analysis = await service.getData('BTCUSDT');
     * console.log(analysis.bestBid); // 42000.50
     * console.log(analysis.bestAsk); // 42001.25
     * console.log(analysis.spread); // 0.75
     * console.log(analysis.depthImbalance); // 0.125 (12.5% buy pressure)
     * console.log(analysis.bids.length); // Up to 1000 levels
     * ```
     */
    getData: (symbol: string) => Promise<IBookDataAnalysis>;
}

/**
 * Logger service for signals library diagnostic output.
 *
 * Provides logging capabilities with a no-op default implementation.
 * Use setLogger() from the public API to enable actual logging output.
 *
 * @example
 * ```typescript
 * import { setLogger } from '@backtest-kit/signals';
 *
 * setLogger({
 *   log: console.log,
 *   debug: console.debug,
 *   info: console.info,
 *   warn: console.warn,
 * });
 * ```
 */

/**
 * Logger service implementation with configurable backend.
 *
 * Delegates all logging calls to the configured logger implementation.
 * Defaults to NOOP_LOGGER which discards all output.
 */
declare class LoggerService implements ILogger {
    private _commonLogger;
    /**
     * Logs general messages with topic and optional arguments.
     *
     * Delegates to configured logger implementation. Uses no-op logger by default
     * until setLogger() is called with custom implementation.
     *
     * @param topic - Log topic or category identifier
     * @param args - Additional arguments to log
     *
     * @example
     * ```typescript
     * const logger = new LoggerService();
     * await logger.log('user-action', { userId: '123', action: 'login' });
     * // Output depends on configured logger implementation
     * ```
     */
    log: (topic: string, ...args: any[]) => Promise<void>;
    /**
     * Logs debug-level messages with topic and optional arguments.
     *
     * Typically used for detailed diagnostic information during development.
     * Delegates to configured logger implementation.
     *
     * @param topic - Debug topic or category identifier
     * @param args - Additional arguments to log
     *
     * @example
     * ```typescript
     * const logger = new LoggerService();
     * await logger.debug('api-call', { endpoint: '/data', params: { limit: 10 } });
     * ```
     */
    debug: (topic: string, ...args: any[]) => Promise<void>;
    /**
     * Logs informational messages with topic and optional arguments.
     *
     * Used for general informational messages about application state or progress.
     * Delegates to configured logger implementation.
     *
     * @param topic - Info topic or category identifier
     * @param args - Additional arguments to log
     *
     * @example
     * ```typescript
     * const logger = new LoggerService();
     * await logger.info('server-start', { port: 3000, env: 'production' });
     * ```
     */
    info: (topic: string, ...args: any[]) => Promise<void>;
    /**
     * Logs warning messages with topic and optional arguments.
     *
     * Used for potentially harmful situations that don't prevent execution.
     * Delegates to configured logger implementation.
     *
     * @param topic - Warning topic or category identifier
     * @param args - Additional arguments to log
     *
     * @example
     * ```typescript
     * const logger = new LoggerService();
     * await logger.warn('rate-limit', { limit: 100, current: 95 });
     * ```
     */
    warn: (topic: string, ...args: any[]) => Promise<void>;
    /**
     * Sets custom logger implementation.
     *
     * Replaces the default no-op logger with a custom implementation that
     * conforms to the ILogger interface. Call this during application initialization
     * to enable actual logging output.
     *
     * @param logger - Custom logger conforming to ILogger interface
     *
     * @example
     * ```typescript
     * const logger = new LoggerService();
     * logger.setLogger({
     *   log: console.log,
     *   debug: console.debug,
     *   info: console.info,
     *   warn: console.warn,
     * });
     * await logger.log('test', 'now logging to console');
     * ```
     */
    setLogger: (logger: ILogger) => void;
}

/**
 * Service container initialization and export for signals library.
 *
 * Initializes the DI container, injects all registered services,
 * and exports them as a unified 'signal' object for internal use.
 *
 * This module:
 * 1. Imports service registrations from './core/provide'
 * 2. Injects all services from DI container
 * 3. Initializes DI container
 * 4. Exports combined service object
 * 5. Attaches to globalThis for debugging (non-production only)
 *
 * @module lib/index
 */

/**
 * Combined service container for internal library use.
 * Contains all registered services: common, math, and history.
 */
declare const signal: {
    fifteenMinuteCandleHistoryService: FifteenMinuteCandleHistoryService;
    hourCandleHistoryService: HourCandleHistoryService;
    oneMinuteCandleHistoryService: OneMinuteCandleHistoryService;
    thirtyMinuteCandleHistoryService: ThirtyMinuteCandleHistoryService;
    swingTermMathService: SwingTermHistoryService;
    longTermMathService: LongTermHistoryService;
    shortTermMathService: ShortTermHistoryService;
    microTermMathService: MicroTermHistoryService;
    bookDataMathService: BookDataMathService;
    loggerService: LoggerService;
};

export { commitBookDataReport, commitFifteenMinuteHistory, commitHistorySetup, commitHourHistory, commitLongTermMath, commitMicroTermMath, commitOneMinuteHistory, commitShortTermMath, commitSwingTermMath, commitThirtyMinuteHistory, signal as lib, setLogger };

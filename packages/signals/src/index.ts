/**
 * @backtest-kit/signals - Technical Analysis & Signal Generation Library
 *
 * Comprehensive multi-timeframe technical analysis library for AI-powered trading systems.
 * Generates 50+ indicators across 4 timeframes (1m, 15m, 30m, 1h) with order book analysis,
 * formatted as markdown reports for LLM consumption.
 *
 * Features:
 * - Multi-timeframe analysis: MicroTerm (1m), ShortTerm (15m), SwingTerm (30m), LongTerm (1h)
 * - 50+ technical indicators: RSI, MACD, Bollinger Bands, Stochastic, ADX, ATR, CCI, Fibonacci
 * - Order book analysis: Bid/ask depth, spread, liquidity imbalance, top 20 levels
 * - Markdown report generation optimized for LLM context injection
 * - Intelligent caching with configurable TTL per timeframe
 * - Custom algorithms: Fibonacci retracements, support/resistance detection, volume analysis
 *
 * @packageDocumentation
 *
 * @example
 * ```typescript
 * import { commitHistorySetup } from '@backtest-kit/signals';
 *
 * // Quick start - all-in-one analysis
 * const messages = [];
 * await commitHistorySetup('BTCUSDT', messages);
 *
 * // messages now contains:
 * // - Order book analysis
 * // - Candle histories (1m, 15m, 30m, 1h)
 * // - 150+ indicators across 4 timeframes
 * // - System context (symbol, price, timestamp)
 *
 * // Use with LLM for signal generation
 * const signal = await llm(messages);
 * ```
 *
 * @example
 * ```typescript
 * import {
 *   commitOneMinuteHistory,
 *   commitMicroTermMath,
 *   commitBookDataReport
 * } from '@backtest-kit/signals';
 *
 * // Granular control - individual reports
 * const messages = [];
 *
 * await commitBookDataReport('BTCUSDT', messages);     // Order book
 * await commitOneMinuteHistory('BTCUSDT', messages);   // 1m candles
 * await commitMicroTermMath('BTCUSDT', messages);      // 1m indicators
 *
 * const signal = await llm(messages);
 * ```
 */

// Candle history report functions
export {
  commitFifteenMinuteHistory,
  commitHourHistory,
  commitOneMinuteHistory,
  commitThirtyMinuteHistory,
} from "./function/history.function";

// Technical indicator report functions
export {
  commitLongTermMath,
  commitMicroTermMath,
  commitShortTermMath,
  commitSwingTermMath,
} from "./function/math.function";

// Orchestrator functions
export {
  commitBookDataReport,
  commitHistorySetup,
} from "./function/other.function";

// Configuration utilities
export {
    setLogger,
} from "./tools/setup.tool";

// Internal service container (for advanced usage)
export { signal as lib } from "./lib";

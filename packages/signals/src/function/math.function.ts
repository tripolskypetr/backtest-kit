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

import lib from "../lib";
import History from "../contract/History.contract";
import { str, trycatch } from "functools-kit";
import { Cache } from "backtest-kit";
import { ReportFn } from "../contract/ReportFn.contract";

/**
 * Cached function to fetch MicroTerm (1-minute) technical analysis report.
 * Cache TTL: 1 minute
 */
const fetchMicroTermMath = Cache.fn(lib.microTermMathService.getReport, {
  interval: "1m",
});

/**
 * Cached function to fetch ShortTerm (15-minute) technical analysis report.
 * Cache TTL: 5 minutes
 */
const fetchShortTermMath = Cache.fn(lib.shortTermMathService.getReport, {
  interval: "5m",
});

/**
 * Cached function to fetch SwingTerm (30-minute) technical analysis report.
 * Cache TTL: 15 minutes
 */
const fetchSwingTermMath = Cache.fn(lib.swingTermMathService.getReport, {
  interval: "15m",
});

/**
 * Cached function to fetch LongTerm (1-hour) technical analysis report.
 * Cache TTL: 30 minutes
 */
const fetchLongTermMath = Cache.fn(lib.longTermMathService.getReport, {
  interval: "30m",
});

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
const commitMicroTermMath = trycatch(
  async (symbol: string, history: History) => {
    const microTermMath = await fetchMicroTermMath(symbol);
    await history.push(
      {
        role: "user",
        content: str.newline(
          "=== 1-MINUTE CANDLES TRADING ANALYSIS (HISTORICAL DATA) ===",
          "",
          microTermMath
        ),
      },
      {
        role: "assistant",
        content: "1-minute candles trading analysis received.",
      }
    );
  },
  {
    fallback: () => Cache.clear(fetchMicroTermMath),
  }
) as ReportFn;

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
const commitLongTermMath = trycatch(
  async (symbol: string, history: History) => {
    const longTermMath = await fetchLongTermMath(symbol);
    await history.push(
      {
        role: "user",
        content: str.newline(
          "=== 1-HOUR CANDLES TRADING ANALYSIS (HISTORICAL DATA) ===",
          "",
          longTermMath
        ),
      },
      {
        role: "assistant",
        content: "1-hour candles trading analysis received.",
      }
    );
  },
  {
    fallback: () => Cache.clear(fetchLongTermMath),
  }
) as ReportFn;

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
const commitShortTermMath = trycatch(
  async (symbol: string, history: History) => {
    const shortTermMath = await fetchShortTermMath(symbol);
    await history.push(
      {
        role: "user",
        content: str.newline(
          "=== 15-MINUTE CANDLES TRADING ANALYSIS (HISTORICAL DATA) ===",
          "",
          shortTermMath
        ),
      },
      {
        role: "assistant",
        content: "15-minute candles trading analysis received.",
      }
    );
  },
  {
    fallback: () => Cache.clear(fetchShortTermMath),
  }
) as ReportFn;

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
const commitSwingTermMath = trycatch(
  async (symbol: string, history: History) => {
    const swingTermMath = await fetchSwingTermMath(symbol);
    await history.push(
      {
        role: "user",
        content: str.newline(
          "=== 30-MIN CANDLES ANALYSIS (HISTORICAL DATA) ===",
          "",
          swingTermMath
        ),
      },
      {
        role: "assistant",
        content: "30-min candles analysis received.",
      }
    );
  },
  {
    fallback: () => Cache.clear(fetchSwingTermMath),
  }
) as ReportFn;

export {
  commitLongTermMath,
  commitMicroTermMath,
  commitShortTermMath,
  commitSwingTermMath,
};

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

import lib from "../lib";
import History from "../contract/History.contract";
import { str, trycatch } from "functools-kit";
import { Cache } from "backtest-kit";
import { ReportFn } from "../contract/ReportFn.contract";

/**
 * Cached function to fetch 1-hour candle history report.
 * Cache TTL: 30 minutes
 */
const fetchHourHistory = Cache.fn(lib.hourCandleHistoryService.getReport, {
  interval: "30m",
});

/**
 * Cached function to fetch 30-minute candle history report.
 * Cache TTL: 15 minutes
 */
const fetchThirtyMinuteHistory = Cache.fn(
  lib.thirtyMinuteCandleHistoryService.getReport,
  {
    interval: "15m",
  }
);

/**
 * Cached function to fetch 15-minute candle history report.
 * Cache TTL: 5 minutes
 */
const fetchFifteenMinuteHistory = Cache.fn(
  lib.fifteenMinuteCandleHistoryService.getReport,
  {
    interval: "5m",
  }
);

/**
 * Cached function to fetch 1-minute candle history report.
 * Cache TTL: 1 minute
 */
const fetchOneMinuteHistory = Cache.fn(
  lib.oneMinuteCandleHistoryService.getReport,
  {
    interval: "1m",
  }
);

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
const commitHourHistory = trycatch(
  async (symbol: string, history: History) => {
    const hourHistory = await fetchHourHistory(symbol);
    await history.push(
      {
        role: "user",
        content: str.newline(
          "=== HOURLY CANDLES HISTORY (LAST 6) ===",
          "",
          hourHistory
        ),
      },
      {
        role: "assistant",
        content: "Hourly candles history received.",
      }
    );
  },
  {
    fallback: () => Cache.clear(fetchHourHistory),
  }
) as ReportFn;

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
const commitThirtyMinuteHistory = trycatch(
  async (symbol: string, history: History) => {
    const thirtyMinuteHistory = await fetchThirtyMinuteHistory(symbol);
    await history.push(
      {
        role: "user",
        content: str.newline(
          "=== 30-MIN CANDLES HISTORY (LAST 6) ===",
          "",
          thirtyMinuteHistory
        ),
      },
      {
        role: "assistant",
        content: "30-min candles history received.",
      }
    );
  },
  {
    fallback: () => Cache.clear(fetchThirtyMinuteHistory),
  }
) as ReportFn;

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
const commitFifteenMinuteHistory = trycatch(
  async (symbol: string, history: History) => {
    const fifteenMinuteHistory = await fetchFifteenMinuteHistory(symbol);
    await history.push(
      {
        role: "user",
        content: str.newline(
          "=== 15-MINUTE CANDLES HISTORY (LAST 8) ===",
          "",
          fifteenMinuteHistory
        ),
      },
      {
        role: "assistant",
        content: "15-minute candles history received.",
      }
    );
  },
  {
    fallback: () => Cache.clear(fetchFifteenMinuteHistory),
  }
) as ReportFn;

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
const commitOneMinuteHistory = trycatch(
  async (symbol: string, history: History) => {
    const oneMinuteHistory = await fetchOneMinuteHistory(symbol);
    await history.push(
      {
        role: "user",
        content: str.newline(
          "=== ONE-MINUTE CANDLES HISTORY (LAST 15) ===",
          "",
          oneMinuteHistory
        ),
      },
      {
        role: "assistant",
        content: "One-minute candles history received.",
      }
    );
  },
  {
    fallback: () => Cache.clear(fetchOneMinuteHistory),
  }
) as ReportFn;

export {
  commitFifteenMinuteHistory,
  commitHourHistory,
  commitOneMinuteHistory,
  commitThirtyMinuteHistory,
};

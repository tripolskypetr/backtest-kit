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

import lib from "../lib";
import History from "../contract/History.contract";
import { str, trycatch } from "functools-kit";
import { Cache, formatPrice, getAveragePrice, getDate, getMode } from "backtest-kit";
import { commitFifteenMinuteHistory, commitHourHistory, commitOneMinuteHistory, commitThirtyMinuteHistory } from "./history.function";
import { commitLongTermMath, commitMicroTermMath, commitShortTermMath, commitSwingTermMath } from "./math.function";
import { ReportFn } from "../contract/ReportFn.contract";

/**
 * Cached function to fetch order book analysis report.
 * Cache TTL: 5 minutes
 */
const fetchBookData = Cache.fn(lib.bookDataMathService.getReport, {
  interval: "5m",
});

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
const commitBookDataReport = trycatch(
  async (symbol: string, history: History) => {
    const mode = await getMode();
    if (mode === "backtest") {
      return;
    }
    const bookDataReport = await fetchBookData(symbol);
    await history.push(
      {
        role: "user",
        content: str.newline(
          "=== ORDER BOOK ANALYSIS (TOP 20 LARGEST LEVELS BY VOLUME %, BEST BID/ASK, MID PRICE, SPREAD, DEPTH IMBALANCE) ===",
          "",
          bookDataReport
        ),
      },
      {
        role: "assistant",
        content:
          "Order book analysis received. Will use for short-term liquidity assessment, market pressure direction (depth imbalance), and major support/resistance levels.",
      }
    );
  },
  {
    fallback: () => Cache.clear(fetchBookData),
  }
) as ReportFn;

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
const commitHistorySetup = async (symbol: string, history: History) => {
  // Order book analysis
  await commitBookDataReport(symbol, history);

  // Candle histories across timeframes
  await commitOneMinuteHistory(symbol, history);
  await commitFifteenMinuteHistory(symbol, history);
  await commitThirtyMinuteHistory(symbol, history);
  await commitHourHistory(symbol, history);

  // Technical indicators across timeframes
  await commitMicroTermMath(symbol, history);
  await commitShortTermMath(symbol, history);
  await commitSwingTermMath(symbol, history);
  await commitLongTermMath(symbol, history);

  const displayName = await String(symbol).toUpperCase();

  const currentPrice = await getAveragePrice(symbol);
  const currentData = await getDate();


    await history.push({
    role: "system",
    content: str.newline(
      `Trading symbol: ${displayName}`,
      `Current price: ${await formatPrice(symbol, currentPrice)} USD`,
      `Current time: ${currentData.toISOString()}`
    ),
  });
};

export { commitBookDataReport, commitHistorySetup };

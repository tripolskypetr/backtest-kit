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

import { getCandles, ICandleData, formatPrice, formatQuantity, getDate } from "backtest-kit";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import LoggerService from "../common/LoggerService";

/**
 * Number of recent candles to include in history report.
 * Provides 15-minute price action context for scalping decisions.
 */
const RECENT_CANDLES = 15;

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
export class OneMinuteCandleHistoryService {
  private loggerService = inject<LoggerService>(TYPES.loggerService);

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
  public getData = async (symbol: string): Promise<ICandleData[]> => {
    this.loggerService.log("oneMinuteCandleHistoryService getData", { symbol });
    return getCandles(symbol, "1m", RECENT_CANDLES);
  };

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
  public generateReport = async (symbol: string, candles: ICandleData[]): Promise<string> => {
    this.loggerService.log("oneMinuteCandleHistoryService generateReport", { symbol });
    let markdown = "";

    const currentData = await getDate();
    markdown += `## One-Minute Candles History (Last ${RECENT_CANDLES})\n`;
    markdown += `> Current trading pair: ${String(symbol).toUpperCase()} Current datetime: ${currentData.toISOString()}\n\n`;

    for (let index = 0; index < candles.length; index++) {
      const candle = candles[index];
      const volatilityPercent = ((candle.high - candle.low) / candle.close) * 100;
      const bodySize = Math.abs(candle.close - candle.open);
      const candleRange = candle.high - candle.low;
      const bodyPercent = candleRange > 0 ? (bodySize / candleRange) * 100 : 0;
      const priceChangePercent = candle.open > 0 ? ((candle.close - candle.open) / candle.open) * 100 : 0;

      const formattedTime = new Date(candle.timestamp).toISOString();

      markdown += `### 1m Candle ${index + 1}\n`;
      markdown += `- **Price Change**: ${priceChangePercent.toFixed(3)}%\n`;
      markdown += `- **Time**: ${formattedTime}\n`;
      markdown += `- **Open**: ${formatPrice(symbol, candle.open)} USD\n`;
      markdown += `- **High**: ${formatPrice(symbol, candle.high)} USD\n`;
      markdown += `- **Low**: ${formatPrice(symbol, candle.low)} USD\n`;
      markdown += `- **Close**: ${formatPrice(symbol, candle.close)} USD\n`;
      markdown += `- **Volume**: ${formatQuantity(symbol, candle.volume)}\n`;
      markdown += `- **1m Volatility**: ${volatilityPercent.toFixed(2)}%\n`;
      markdown += `- **Body Size**: ${bodyPercent.toFixed(1)}%\n\n`;
    }

    return markdown;
  };

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
  public getReport = async (symbol: string): Promise<string> => {
    this.loggerService.log("oneMinuteCandleHistoryService getReport", { symbol });
    const candles = await this.getData(symbol);
    return await this.generateReport(symbol, candles);
  };
}

export default OneMinuteCandleHistoryService;
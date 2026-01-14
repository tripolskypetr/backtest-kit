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

import { getCandles, ICandleData, formatPrice, formatQuantity, getDate } from "backtest-kit";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import LoggerService from "../common/LoggerService";

/**
 * Number of recent candles to include in history report.
 * Provides 6-hour price action context for long-term trading decisions.
 */
const RECENT_CANDLES = 6;

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
export class HourCandleHistoryService {
  private loggerService = inject<LoggerService>(TYPES.loggerService);

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
  public getData = async (symbol: string): Promise<ICandleData[]> => {
    this.loggerService.log("hourCandleHistoryService getData", { symbol });
    return getCandles(symbol, "1h", RECENT_CANDLES);
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
   * // ## Hourly Candles History (Last 6)
   * // ### 1h Candle 1 (Green)
   * // - **Open**: 42000.50 USD
   * ```
   */
  public generateReport = async (symbol: string, candles: ICandleData[]): Promise<string> => {
    this.loggerService.log("hourCandleHistoryService generateReport", { symbol });
    let markdown = "";

    const currentData = await getDate();
    markdown += `## Hourly Candles History (Last ${RECENT_CANDLES})\n`;
    markdown += `> Current time: ${currentData.toISOString()}\n\n`;

    for (let index = 0; index < candles.length; index++) {
      const candle = candles[index];
      const volatilityPercent =
        ((candle.high - candle.low) / candle.close) * 100;
      const bodySize = Math.abs(candle.close - candle.open);
      const candleRange = candle.high - candle.low;
      const bodyPercent = candleRange > 0 ? (bodySize / candleRange) * 100 : 0;
      const candleType =
        candle.close > candle.open
          ? "Green"
          : candle.close < candle.open
          ? "Red"
          : "Doji";

      const formattedTime = new Date(candle.timestamp).toISOString();

      markdown += `### 1h Candle ${index + 1} (${candleType})\n`;
      markdown += `- **Time**: ${formattedTime}\n`;
      markdown += `- **Open**: ${formatPrice(symbol, candle.open)} USD\n`;
      markdown += `- **High**: ${formatPrice(symbol, candle.high)} USD\n`;
      markdown += `- **Low**: ${formatPrice(symbol, candle.low)} USD\n`;
      markdown += `- **Close**: ${formatPrice(symbol, candle.close)} USD\n`;
      markdown += `- **Volume**: ${formatQuantity(symbol, candle.volume)}\n`;
      markdown += `- **1h Volatility**: ${volatilityPercent.toFixed(2)}%\n`;
      markdown += `- **Body Size**: ${bodyPercent.toFixed(1)}%\n\n`;
    }

    return markdown;
  };

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
  public getReport = async (symbol: string): Promise<string> => {
    this.loggerService.log("hourCandleHistoryService getReport", { symbol });
    const candles = await this.getData(symbol);
    return await this.generateReport(symbol, candles);
  };
}

export default HourCandleHistoryService;

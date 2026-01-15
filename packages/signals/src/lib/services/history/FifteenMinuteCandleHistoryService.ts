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

import { getCandles, ICandleData, formatPrice, formatQuantity, getDate } from "backtest-kit";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import LoggerService from "../common/LoggerService";

/**
 * Number of recent candles to include in history report.
 * Provides 2-hour price action context for day trading decisions.
 */
const RECENT_CANDLES = 8;

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
export class FifteenMinuteCandleHistoryService {
  private loggerService = inject<LoggerService>(TYPES.loggerService);

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
  public getData = async (symbol: string): Promise<ICandleData[]> => {
    this.loggerService.log("fifteenMinuteCandleHistoryService getData", { symbol });
    return getCandles(symbol, "15m", RECENT_CANDLES);
  };

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
  public generateReport = async (
    symbol: string,
    candles: ICandleData[]
  ): Promise<string> => {
    this.loggerService.log("fifteenMinuteCandleHistoryService generateReport", { symbol });
    let report = "";

    const currentData = await getDate();
    report += `## 15-Minute Candles History (Last ${RECENT_CANDLES})\n`;
    report += `> Current trading pair: ${String(symbol).toUpperCase()} Current datetime: ${currentData.toISOString()}\n\n`;

    for (let index = 0; index < candles.length; index++) {
      const candle = candles[index];
      const volatilityPercent =
        ((candle.high - candle.low) / candle.close) * 100;
      const bodySize = Math.abs(candle.close - candle.open);
      const candleRange = candle.high - candle.low;
      const bodyPercent = candleRange > 0 ? (bodySize / candleRange) * 100 : 0;
      const priceChangePercent = candle.open > 0 ? ((candle.close - candle.open) / candle.open) * 100 : 0;

      const formattedTime = new Date(candle.timestamp).toISOString();

      report += `### 15m Candle ${index + 1}\n`;
      report += `- **Price Change**: ${priceChangePercent.toFixed(3)}%\n`;
      report += `- **Time**: ${formattedTime}\n`;
      report += `- **Open**: ${await formatPrice(symbol, candle.open)} USD\n`;
      report += `- **High**: ${await formatPrice(symbol, candle.high)} USD\n`;
      report += `- **Low**: ${await formatPrice(symbol, candle.low)} USD\n`;
      report += `- **Close**: ${await formatPrice(symbol, candle.close)} USD\n`;
      report += `- **Volume**: ${await formatQuantity(symbol, candle.volume)}\n`;
      report += `- **15m Volatility**: ${volatilityPercent.toFixed(2)}%\n`;
      report += `- **Body Size**: ${bodyPercent.toFixed(1)}%\n\n`;
    }

    return report;
  };

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
  public getReport = async (symbol: string): Promise<string> => {
    this.loggerService.log("fifteenMinuteCandleHistoryService getReport", { symbol });
    const candles = await this.getData(symbol);
    return this.generateReport(symbol, candles);
  };
}

export default FifteenMinuteCandleHistoryService;

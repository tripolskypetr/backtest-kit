import { Exchange, getCandles, ICandleData, formatPrice, formatQuantity } from "backtest-kit";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import LoggerService from "../common/LoggerService";

const RECENT_CANDLES = 15;

export class OneMinuteCandleHistoryService {
  private loggerService = inject<LoggerService>(TYPES.loggerService);

  public getData = async (symbol: string): Promise<ICandleData[]> => {
    this.loggerService.log("oneMinuteCandleHistoryService getData", { symbol });
    return getCandles(symbol, "1m", RECENT_CANDLES);
  };

  public generateReport = (symbol: string, candles: ICandleData[]): string => {
    this.loggerService.log("oneMinuteCandleHistoryService generateReport", { symbol });
    let markdown = "";

    markdown += `## One-Minute Candles History (Last ${RECENT_CANDLES})\n`;

    for (let index = 0; index < candles.length; index++) {
      const candle = candles[index];
      const volatilityPercent = ((candle.high - candle.low) / candle.close) * 100;
      const bodySize = Math.abs(candle.close - candle.open);
      const candleRange = candle.high - candle.low;
      const bodyPercent = candleRange > 0 ? (bodySize / candleRange) * 100 : 0;
      const candleType = candle.close > candle.open ? "Green" : candle.close < candle.open ? "Red" : "Doji";

      const formattedTime = new Date(candle.timestamp).toISOString();

      markdown += `### 1m Candle ${index + 1} (${candleType})\n`;
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

  public getReport = async (symbol: string): Promise<string> => {
    this.loggerService.log("oneMinuteCandleHistoryService getReport", { symbol });
    const candles = await this.getData(symbol);
    return this.generateReport(symbol, candles);
  };
}

export default OneMinuteCandleHistoryService;
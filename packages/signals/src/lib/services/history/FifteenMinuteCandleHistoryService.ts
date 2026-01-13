import { Exchange, getCandles, ICandleData, formatPrice, formatQuantity } from "backtest-kit";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import LoggerService from "../common/LoggerService";

const RECENT_CANDLES = 8;

export class FifteenMinuteCandleHistoryService {
  private loggerService = inject<LoggerService>(TYPES.loggerService);

  public getData = async (symbol: string): Promise<ICandleData[]> => {
    this.loggerService.log("fifteenMinuteCandleHistoryService getData", { symbol });
    return getCandles(symbol, "15m", RECENT_CANDLES);
  };

  public generateReport = async (
    symbol: string,
    candles: ICandleData[]
  ): Promise<string> => {
    this.loggerService.log("fifteenMinuteCandleHistoryService generateReport", { symbol });
    const averageVolatility =
      candles.reduce(
        (sum, candle) =>
          sum + ((candle.high - candle.low) / candle.close) * 100,
        0
      ) / candles.length;
    let report = "";

    report += `## 15-Minute Candles History (Last ${RECENT_CANDLES})\n`;

    for (let index = 0; index < candles.length; index++) {
      const candle = candles[index];
      const volatilityPercent =
        ((candle.high - candle.low) / candle.close) * 100;
      const isHighVolatility = volatilityPercent > averageVolatility * 1.5;
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

      report += `### 15m Candle ${index + 1} (${candleType}) ${
        isHighVolatility ? "HIGH-VOLATILITY" : ""
      }\n`;
      report += `- **Time**: ${formattedTime}\n`;
      report += `- **Open**: ${await formatPrice(symbol, candle.open)} USD\n`;
      report += `- **High**: ${await formatPrice(symbol, candle.high)} USD\n`;
      report += `- **Low**: ${await formatPrice(symbol, candle.low)} USD\n`;
      report += `- **Close**: ${await formatPrice(symbol, candle.close)} USD\n`;
      report += `- **Volume**: ${await formatQuantity(symbol, candle.volume)}\n`;
      report += `- **15m Volatility**: ${volatilityPercent.toFixed(2)}\n`;
      report += `- **Body Size**: ${bodyPercent.toFixed(1)}\n\n`;
    }

    return report;
  };

  public getReport = async (symbol: string): Promise<string> => {
    this.loggerService.log("fifteenMinuteCandleHistoryService getReport", { symbol });
    const candles = await this.getData(symbol);
    return this.generateReport(symbol, candles);
  };
}

export default FifteenMinuteCandleHistoryService;

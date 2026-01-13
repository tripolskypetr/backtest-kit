import { Exchange, getCandles, ICandleData, formatPrice, formatQuantity } from "backtest-kit";
import { log } from "pinolog";

const RECENT_CANDLES = 6;

export class ThirtyMinuteCandleHistoryService {
  public getData = async (symbol: string): Promise<ICandleData[]> => {
    log("thirtyMinuteCandleHistoryService getData", { symbol });
    return getCandles(symbol, "30m", RECENT_CANDLES);
  };

  public generateReport = (symbol: string, candles: ICandleData[]): string => {
    log("thirtyMinuteCandleHistoryService generateReport", { symbol });
    let report = "";
    report += `## 30-Min Candles History (Last ${RECENT_CANDLES})\n`;

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

      report += `### 30m Candle ${index + 1} (${candleType})\n`;
      report += `- **Time**: ${formattedTime}\n`;
      report += `- **Open**: ${formatPrice(symbol, candle.open)} USD\n`;
      report += `- **High**: ${formatPrice(symbol, candle.high)} USD\n`;
      report += `- **Low**: ${formatPrice(symbol, candle.low)} USD\n`;
      report += `- **Close**: ${formatPrice(symbol, candle.close)} USD\n`;
      report += `- **Volume**: ${formatQuantity(symbol, candle.volume)}\n`;
      report += `- **30m Volatility**: ${volatilityPercent.toFixed(2)}%\n`;
      report += `- **Body Size**: ${bodyPercent.toFixed(1)}%\n\n`;
    }

    return report;
  };

  public getReport = async (symbol: string): Promise<string> => {
    log("thirtyMinuteCandleHistoryService getReport", { symbol });
    const candles = await this.getData(symbol);
    return this.generateReport(symbol, candles);
  };
}

export default ThirtyMinuteCandleHistoryService;

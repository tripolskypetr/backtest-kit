import { CandleInterval, getDate } from "backtest-kit";
import { IProvider } from "src/interface/Provider.interface";
import { CandleModel } from "src/model/Candle.model";
import { SymbolInfoModel } from "src/model/SymbolInfo.model";

const INTERVAL_MINUTES: Record<CandleInterval, number> = {
  "1m": 1,
  "3m": 3,
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "1h": 60,
  "2h": 120,
  "4h": 240,
  "6h": 360,
  "8h": 480,
};

export const AXIS_SYMBOL = "_AXIS";

export class AxisProvider implements IProvider {
  async getMarketData(
    _: string,
    timeframe: string,
    limit?: number,
    sDate?: number,
    eDate?: number
  ): Promise<CandleModel[]> {
    if (!INTERVAL_MINUTES[timeframe as CandleInterval]) {
        throw new Error(`Timeframe '${timeframe}' is not supported. Allowed values: ${Object.keys(INTERVAL_MINUTES).join(', ')}`);
    }

    const currentDate = await getDate();
    const startTime = currentDate.getTime();

    const intervalMinutes = INTERVAL_MINUTES[timeframe];
    const intervalMs = intervalMinutes * 60 * 1000;

    let calculatedLimit = limit;

    if (sDate && eDate) {
        const timeDiffMs = eDate - sDate;
        const timeDiffMinutes = timeDiffMs / (1000 * 60);
        calculatedLimit = Math.ceil(timeDiffMinutes / intervalMinutes);
    }

    if (!calculatedLimit) {
        throw new Error("Limit parameter is required for AxisProvider.");
    }

    const adjustedStartTime = startTime - (calculatedLimit * intervalMs);

    const candles: CandleModel[] = [];
    for (let i = 0; i < calculatedLimit; i++) {
      candles.push({
        openTime: adjustedStartTime + i * intervalMs,
        open: 0,
        high: 0,
        low: 0,
        close: 0,
        volume: 0,
      });
    }

    return candles;
  }

  async getSymbolInfo(): Promise<SymbolInfoModel> {
    return {
      ticker: AXIS_SYMBOL,
      tickerid: AXIS_SYMBOL,
      description: "Time Axis",
      type: "index",
      basecurrency: "",
      currency: "",
      timezone: "UTC",
    };
  }
}

export default AxisProvider;
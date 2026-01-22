import { CandleInterval, getCandles, getDate } from "backtest-kit";
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

export class CandleProvider implements IProvider {
  async getMarketData(
    tickerId: string,
    timeframe: string,
    limit?: number,
    sDate?: number,
    eDate?: number
  ): Promise<any[]> {

    if (!INTERVAL_MINUTES[timeframe]) {
        throw new Error(`Timeframe '${timeframe}' is not supported. Allowed values: ${Object.keys(INTERVAL_MINUTES).join(', ')}`);
    }

    const timeframeDate = await getDate();

    let calculatedLimit = limit;

    if (sDate && eDate) {
        const intervalMinutes = INTERVAL_MINUTES[timeframe as CandleInterval];
        const timeDiffMs = eDate - sDate;
        const timeDiffMinutes = timeDiffMs / (1000 * 60);
        calculatedLimit = Math.ceil(timeDiffMinutes / intervalMinutes);
    }

    if (!calculatedLimit) {
        throw new Error("Limit parameter is required for CandleProvider.");
    }

    if (sDate) {
        const intervalMinutes = INTERVAL_MINUTES[timeframe as CandleInterval];
        const timeframeTimestamp = timeframeDate.getTime();
        const startCoverageDate = timeframeTimestamp - (calculatedLimit * intervalMinutes * 60 * 1000);

        if (startCoverageDate < sDate) {
            throw new Error(`Cannot fetch enough historical data. Requested start date: ${new Date(sDate).toISOString()}, but can only fetch back to: ${new Date(startCoverageDate).toISOString()}`);
        }
    }

    const rawCandles = await getCandles(tickerId, <CandleInterval> timeframe, calculatedLimit);
    const candles: CandleModel[] = rawCandles.map(c => ({
      openTime: c.timestamp,
      open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
    }));

    return candles;
  }
  
  async getSymbolInfo(tickerId: string): Promise<any> {
    const symbol = tickerId.toUpperCase().replace(/^BINANCE:|^BYBIT:|^OKX:/, '');
    const base = symbol.replace(/USDT$|BUSD$|USD$/, '');
    const quote = symbol.replace(base, '');
    
    const result: SymbolInfoModel = {
      ticker: symbol,
      tickerid: symbol,
      description: `${base}/${quote}`,
      type: 'crypto',
      basecurrency: base,
      currency: quote || 'USDT',
      timezone: 'UTC',
    };

    return result;
  }
};

export default CandleProvider;

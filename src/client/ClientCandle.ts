import {
  CandleInterval,
  ICandle,
  ICandleParams,
} from "../interfaces/Candle.interface";

const INTERVAL_MINUTES = {
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
} as const;

export class ClientCandle implements ICandle {
  constructor(readonly params: ICandleParams) {}

  public getCandles = async (
    symbol: string,
    interval: CandleInterval,
    limit: number
  ) => {
    this.params.logger.debug(`ClientCandle getCandles`, {
      symbol,
      interval,
      limit,
    });

    const step = INTERVAL_MINUTES[interval];
    const adjust = step + step * limit;

    if (!adjust) {
      throw new Error(
        `ClientCandle unknown time adjust for interval=${interval}`
      );
    }

    const since = new Date(
      this.params.execution.context.when.getTime() - adjust * 60 * 1_000
    );

    const data = await this.params.getCandles(symbol, interval, since, limit);

    if (this.params.callbacks?.onCandleData) {
      this.params.callbacks.onCandleData(symbol, interval, since, limit, data);
    }

    return data;
  };

  public getAveragePrice = async (symbol: string): Promise<number> => {
    this.params.logger.debug(`ClientCandle getAveragePrice`, {
      symbol,
    });

    const candles = await this.getCandles(symbol, "1m", 5);

    if (candles.length === 0) {
      throw new Error(
        `ClientCandle getAveragePrice: no candles data for symbol=${symbol}`
      );
    }

    // VWAP (Volume Weighted Average Price)
    // Используем типичную цену (typical price) = (high + low + close) / 3
    const sumPriceVolume = candles.reduce((acc, candle) => {
      const typicalPrice = (candle.high + candle.low + candle.close) / 3;
      return acc + typicalPrice * candle.volume;
    }, 0);

    const totalVolume = candles.reduce((acc, candle) => acc + candle.volume, 0);

    if (totalVolume === 0) {
      // Если объем нулевой, возвращаем простое среднее close цен
      const sum = candles.reduce((acc, candle) => acc + candle.close, 0);
      return sum / candles.length;
    }

    const vwap = sumPriceVolume / totalVolume;

    return vwap;
  };
}

export default ClientCandle;

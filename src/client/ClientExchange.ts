import {
  CandleInterval,
  ICandleData,
  IExchange,
  IExchangeParams,
} from "../interfaces/Exchange.interface";
import { GLOBAL_CONFIG } from "../config/params";
import { retry, sleep } from "functools-kit";

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

/**
 * Retries the getCandles function with specified retry count and delay.
 * @param dto - Data transfer object containing symbol, interval, and limit
 * @param since - Date object representing the start time for fetching candles
 * @param self - Instance of ClientExchange
 * @returns Promise resolving to array of candle data
 */
const GET_CANDLES_FN = async (
  dto: {
    symbol: string;
    interval: CandleInterval;
    limit: number;
  },
  since: Date,
  self: ClientExchange
) => {
  let lastError: Error;
  for (let i = 0; i !== GLOBAL_CONFIG.CC_GET_CANDLES_RETRY_COUNT; i++) {
    try {
      return await self.params.getCandles(
        dto.symbol,
        dto.interval,
        since,
        dto.limit
      );
    } catch (err) {
      self.params.logger.warn(
        `ClientExchange GET_CANDLES_FN: attempt ${i + 1} failed for symbol=${dto.symbol}, interval=${dto.interval}, since=${since.toISOString()}, limit=${dto.limit}: ${err}`
      );
      lastError = err;
      await sleep(GLOBAL_CONFIG.CC_GET_CANDLES_RETRY_DELAY_MS);
    }
  }
  throw lastError;
};

/**
 * Client implementation for exchange data access.
 *
 * Features:
 * - Historical candle fetching (backwards from execution context)
 * - Future candle fetching (forwards for backtest)
 * - VWAP calculation from last 5 1m candles
 * - Price/quantity formatting for exchange
 *
 * All methods use prototype functions for memory efficiency.
 *
 * @example
 * ```typescript
 * const exchange = new ClientExchange({
 *   exchangeName: "binance",
 *   getCandles: async (symbol, interval, since, limit) => [...],
 *   formatPrice: async (symbol, price) => price.toFixed(2),
 *   formatQuantity: async (symbol, quantity) => quantity.toFixed(8),
 *   execution: executionService,
 *   logger: loggerService,
 * });
 *
 * const candles = await exchange.getCandles("BTCUSDT", "1m", 100);
 * const vwap = await exchange.getAveragePrice("BTCUSDT");
 * ```
 */
export class ClientExchange implements IExchange {
  constructor(readonly params: IExchangeParams) {}

  /**
   * Fetches historical candles backwards from execution context time.
   *
   * @param symbol - Trading pair symbol
   * @param interval - Candle interval
   * @param limit - Number of candles to fetch
   * @returns Promise resolving to array of candles
   */
  public async getCandles(
    symbol: string,
    interval: CandleInterval,
    limit: number
  ) {
    this.params.logger.debug(`ClientExchange getCandles`, {
      symbol,
      interval,
      limit,
    });

    const step = INTERVAL_MINUTES[interval];
    const adjust = step * limit - step;

    if (!adjust) {
      throw new Error(
        `ClientExchange unknown time adjust for interval=${interval}`
      );
    }

    const since = new Date(
      this.params.execution.context.when.getTime() - adjust * 60 * 1_000
    );

    const data = await GET_CANDLES_FN({ symbol, interval, limit }, since, this);

    // Filter candles to strictly match the requested range
    const whenTimestamp = this.params.execution.context.when.getTime();
    const sinceTimestamp = since.getTime();

    const filteredData = data.filter(
      (candle) =>
        candle.timestamp >= sinceTimestamp && candle.timestamp <= whenTimestamp
    );

    if (filteredData.length < limit) {
      this.params.logger.warn(
        `ClientExchange Expected ${limit} candles, got ${filteredData.length}`
      );
    }

    if (this.params.callbacks?.onCandleData) {
      this.params.callbacks.onCandleData(
        symbol,
        interval,
        since,
        limit,
        filteredData
      );
    }

    return filteredData;
  }

  /**
   * Fetches future candles forwards from execution context time.
   * Used in backtest mode to get candles for signal duration.
   *
   * @param symbol - Trading pair symbol
   * @param interval - Candle interval
   * @param limit - Number of candles to fetch
   * @returns Promise resolving to array of candles
   * @throws Error if trying to fetch future candles in live mode
   */
  public async getNextCandles(
    symbol: string,
    interval: CandleInterval,
    limit: number
  ) {
    this.params.logger.debug(`ClientExchange getNextCandles`, {
      symbol,
      interval,
      limit,
    });

    const since = new Date(this.params.execution.context.when.getTime());
    const now = Date.now();

    // Вычисляем конечное время запроса
    const step = INTERVAL_MINUTES[interval];
    const endTime = since.getTime() + limit * step * 60 * 1000;

    // Проверяем что запрошенный период не заходит за Date.now()
    if (endTime > now) {
      return [];
    }

    const data = await GET_CANDLES_FN({ symbol, interval, limit }, since, this);

    // Filter candles to strictly match the requested range
    const sinceTimestamp = since.getTime();

    const filteredData = data.filter(
      (candle) =>
        candle.timestamp >= sinceTimestamp && candle.timestamp <= endTime
    );

    if (filteredData.length < limit) {
      this.params.logger.warn(
        `ClientExchange getNextCandles: Expected ${limit} candles, got ${filteredData.length}`
      );
    }

    if (this.params.callbacks?.onCandleData) {
      this.params.callbacks.onCandleData(
        symbol,
        interval,
        since,
        limit,
        filteredData
      );
    }

    return filteredData;
  }

  /**
   * Calculates VWAP (Volume Weighted Average Price) from last N 1m candles.
   * The number of candles is configurable via GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT.
   *
   * Formula:
   * - Typical Price = (high + low + close) / 3
   * - VWAP = sum(typical_price * volume) / sum(volume)
   *
   * If volume is zero, returns simple average of close prices.
   *
   * @param symbol - Trading pair symbol
   * @returns Promise resolving to VWAP price
   * @throws Error if no candles available
   */
  public async getAveragePrice(symbol: string): Promise<number> {
    this.params.logger.debug(`ClientExchange getAveragePrice`, {
      symbol,
    });

    const candles = await this.getCandles(
      symbol,
      "1m",
      GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT
    );

    if (candles.length === 0) {
      throw new Error(
        `ClientExchange getAveragePrice: no candles data for symbol=${symbol}`
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
  }

  public async formatQuantity(symbol: string, quantity: number) {
    this.params.logger.debug("binanceService formatQuantity", {
      symbol,
      quantity,
    });
    return await this.params.formatQuantity(symbol, quantity);
  }

  public async formatPrice(symbol: string, price: number) {
    this.params.logger.debug("binanceService formatPrice", {
      symbol,
      price,
    });
    return await this.params.formatPrice(symbol, price);
  }
}

export default ClientExchange;

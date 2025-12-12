import {
  CandleInterval,
  ICandleData,
  IExchange,
  IExchangeParams,
} from "../interfaces/Exchange.interface";
import { GLOBAL_CONFIG } from "../config/params";
import { errorData, getErrorMessage, sleep } from "functools-kit";

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
 * Validates that all candles have valid OHLCV data without anomalies.
 * Detects incomplete candles from Binance API by checking for abnormally low prices or volumes.
 * Incomplete candles often have prices like 0.1 instead of normal 100,000 or zero volume.
 *
 * @param candles - Array of candle data to validate
 * @throws Error if any candles have anomalous OHLCV values
 */
const VALIDATE_NO_INCOMPLETE_CANDLES_FN = (
  candles: ICandleData[]
): void => {
  if (candles.length === 0) {
    return;
  }

  // Calculate reference price (median or average depending on candle count)
  const allPrices = candles.flatMap((c) => [c.open, c.high, c.low, c.close]);
  const validPrices = allPrices.filter(p => p > 0);

  let referencePrice: number;
  if (candles.length >= GLOBAL_CONFIG.CC_GET_CANDLES_MIN_CANDLES_FOR_MEDIAN) {
    // Use median for reliable statistics with enough data
    const sortedPrices = [...validPrices].sort((a, b) => a - b);
    referencePrice = sortedPrices[Math.floor(sortedPrices.length / 2)] || 0;
  } else {
    // Use average for small datasets (more stable than median)
    const sum = validPrices.reduce((acc, p) => acc + p, 0);
    referencePrice = validPrices.length > 0 ? sum / validPrices.length : 0;
  }

  if (referencePrice === 0) {
    throw new Error(
      `VALIDATE_NO_INCOMPLETE_CANDLES_FN: cannot calculate reference price (all prices are zero)`
    );
  }

  const minValidPrice = referencePrice / GLOBAL_CONFIG.CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];

    // Check for invalid numeric values
    if (
      !Number.isFinite(candle.open) ||
      !Number.isFinite(candle.high) ||
      !Number.isFinite(candle.low) ||
      !Number.isFinite(candle.close) ||
      !Number.isFinite(candle.volume) ||
      !Number.isFinite(candle.timestamp)
    ) {
      throw new Error(
        `VALIDATE_NO_INCOMPLETE_CANDLES_FN: candle[${i}] has invalid numeric values (NaN or Infinity)`
      );
    }

    // Check for negative values
    if (
      candle.open <= 0 ||
      candle.high <= 0 ||
      candle.low <= 0 ||
      candle.close <= 0 ||
      candle.volume < 0
    ) {
      throw new Error(
        `VALIDATE_NO_INCOMPLETE_CANDLES_FN: candle[${i}] has zero or negative values`
      );
    }

    // Check for anomalously low prices (incomplete candle indicator)
    if (
      candle.open < minValidPrice ||
      candle.high < minValidPrice ||
      candle.low < minValidPrice ||
      candle.close < minValidPrice
    ) {
      throw new Error(
        `VALIDATE_NO_INCOMPLETE_CANDLES_FN: candle[${i}] has anomalously low price. ` +
        `OHLC: [${candle.open}, ${candle.high}, ${candle.low}, ${candle.close}], ` +
        `reference: ${referencePrice}, threshold: ${minValidPrice}`
      );
    }
  }
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
      const result = await self.params.getCandles(
        dto.symbol,
        dto.interval,
        since,
        dto.limit
      );

      VALIDATE_NO_INCOMPLETE_CANDLES_FN(result);

      return result;
    } catch (err) {
      const message = `ClientExchange GET_CANDLES_FN: attempt ${i + 1} failed for symbol=${dto.symbol}, interval=${dto.interval}, since=${since.toISOString()}, limit=${dto.limit}}`;
      const payload = {
        error: errorData(err),
        message: getErrorMessage(err),
      };
      self.params.logger.warn(
        message,
        payload,
      );
      console.warn(message, payload);
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

  /**
   * Formats quantity according to exchange-specific rules for the given symbol.
   * Applies proper decimal precision and rounding based on symbol's lot size filters.
   *
   * @param symbol - Trading pair symbol
   * @param quantity - Raw quantity to format
   * @returns Promise resolving to formatted quantity as string
   */
  public async formatQuantity(symbol: string, quantity: number) {
    this.params.logger.debug("binanceService formatQuantity", {
      symbol,
      quantity,
    });
    return await this.params.formatQuantity(symbol, quantity);
  }

  /**
   * Formats price according to exchange-specific rules for the given symbol.
   * Applies proper decimal precision and rounding based on symbol's price filters.
   *
   * @param symbol - Trading pair symbol
   * @param price - Raw price to format
   * @returns Promise resolving to formatted price as string
   */
  public async formatPrice(symbol: string, price: number) {
    this.params.logger.debug("binanceService formatPrice", {
      symbol,
      price,
    });
    return await this.params.formatPrice(symbol, price);
  }
}

export default ClientExchange;

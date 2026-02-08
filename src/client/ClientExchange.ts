import {
  CandleInterval,
  ICandleData,
  IExchange,
  IExchangeParams,
  type IOrderBookData,
} from "../interfaces/Exchange.interface";
import { GLOBAL_CONFIG } from "../config/params";
import {
  errorData,
  getErrorMessage,
  queued,
  sleep,
  trycatch,
} from "functools-kit";
import backtest from "../lib";
import { errorEmitter } from "../config/emitters";
import { PersistCandleAdapter } from "../classes/Persist";

const MS_PER_MINUTE = 60_000;

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
 * Aligns timestamp down to the nearest interval boundary.
 * For example, for 15m interval: 00:17 -> 00:15, 00:44 -> 00:30
 *
 * Candle timestamp convention:
 * - Candle timestamp = openTime (when candle opens)
 * - Candle with timestamp 00:00 covers period [00:00, 00:15) for 15m interval
 *
 * Adapter contract:
 * - Adapter must return candles with timestamp = openTime
 * - First returned candle.timestamp must equal aligned since
 * - Adapter must return exactly `limit` candles
 *
 * @param timestamp - Timestamp in milliseconds
 * @param intervalMinutes - Interval in minutes
 * @returns Aligned timestamp rounded down to interval boundary
 */
const ALIGN_TO_INTERVAL_FN = (
  timestamp: number,
  intervalMinutes: number,
): number => {
  const intervalMs = intervalMinutes * MS_PER_MINUTE;
  return Math.floor(timestamp / intervalMs) * intervalMs;
};

/**
 * Validates that all candles have valid OHLCV data without anomalies.
 * Detects incomplete candles from Binance API by checking for abnormally low prices or volumes.
 * Incomplete candles often have prices like 0.1 instead of normal 100,000 or zero volume.
 *
 * @param candles - Array of candle data to validate
 * @throws Error if any candles have anomalous OHLCV values
 */
const VALIDATE_NO_INCOMPLETE_CANDLES_FN = (candles: ICandleData[]): void => {
  if (candles.length === 0) {
    return;
  }

  // Calculate reference price (median or average depending on candle count)
  const allPrices = candles.flatMap((c) => [c.open, c.high, c.low, c.close]);
  const validPrices = allPrices.filter((p) => p > 0);

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
      `VALIDATE_NO_INCOMPLETE_CANDLES_FN: cannot calculate reference price (all prices are zero)`,
    );
  }

  const minValidPrice =
    referencePrice /
    GLOBAL_CONFIG.CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR;

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
        `VALIDATE_NO_INCOMPLETE_CANDLES_FN: candle[${i}] has invalid numeric values (NaN or Infinity)`,
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
        `VALIDATE_NO_INCOMPLETE_CANDLES_FN: candle[${i}] has zero or negative values`,
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
          `reference: ${referencePrice}, threshold: ${minValidPrice}`,
      );
    }
  }
};

/**
 * Attempts to read candles from cache.
 *
 * Cache lookup calculates expected timestamps:
 * sinceTimestamp + i * stepMs for i = 0..limit-1
 * Returns all candles if found, null if any missing.
 *
 * @param dto - Data transfer object containing symbol, interval, and limit
 * @param sinceTimestamp - Aligned start timestamp (openTime of first candle)
 * @param untilTimestamp - Unused, kept for API compatibility
 * @param self - Instance of ClientExchange
 * @returns Cached candles array (exactly limit) or null if cache miss
 */
const READ_CANDLES_CACHE_FN = trycatch(
  async (
    dto: {
      symbol: string;
      interval: CandleInterval;
      limit: number;
    },
    sinceTimestamp: number,
    untilTimestamp: number,
    self: ClientExchange,
  ): Promise<ICandleData[] | null> => {
    // PersistCandleAdapter.readCandlesData calculates expected timestamps:
    // sinceTimestamp + i * stepMs for i = 0..limit-1
    // Returns all candles if found, null if any missing
    const cachedCandles = await PersistCandleAdapter.readCandlesData(
      dto.symbol,
      dto.interval,
      self.params.exchangeName,
      dto.limit,
      sinceTimestamp,
      untilTimestamp,
    );

    // Return cached data only if we have exactly the requested limit
    if (cachedCandles?.length === dto.limit) {
      self.params.logger.debug(
        `ClientExchange READ_CANDLES_CACHE_FN: cache hit for symbol=${dto.symbol}, interval=${dto.interval}, limit=${dto.limit}`,
      );
      return cachedCandles;
    }

    self.params.logger.warn(
      `ClientExchange READ_CANDLES_CACHE_FN: cache inconsistent (count or range mismatch) for symbol=${dto.symbol}, interval=${dto.interval}, limit=${dto.limit}`,
    );

    return null;
  },
  {
    fallback: async (error) => {
      const message = `ClientExchange READ_CANDLES_CACHE_FN: cache read failed`;
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
    defaultValue: null,
  },
);

/**
 * Writes candles to cache with error handling.
 *
 * The candles passed to this function should be validated:
 * - First candle.timestamp equals aligned sinceTimestamp (openTime)
 * - Exact number of candles as requested (limit)
 * - Sequential timestamps: sinceTimestamp + i * stepMs
 *
 * @param candles - Array of validated candle data to cache
 * @param dto - Data transfer object containing symbol, interval, and limit
 * @param self - Instance of ClientExchange
 */
const WRITE_CANDLES_CACHE_FN = trycatch(
  queued(
    async (
      candles: ICandleData[],
      dto: {
        symbol: string;
        interval: CandleInterval;
        limit: number;
      },
      self: ClientExchange,
    ): Promise<void> => {
      await PersistCandleAdapter.writeCandlesData(
        candles,
        dto.symbol,
        dto.interval,
        self.params.exchangeName,
      );
      self.params.logger.debug(
        `ClientExchange WRITE_CANDLES_CACHE_FN: cache updated for symbol=${dto.symbol}, interval=${dto.interval}, count=${candles.length}`,
      );
    },
  ),
  {
    fallback: async (error) => {
      const message = `ClientExchange WRITE_CANDLES_CACHE_FN: cache write failed`;
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
    defaultValue: null,
  },
);

/**
 * Retries the getCandles function with specified retry count and delay.
 * Uses cache to avoid redundant API calls.
 *
 * Cache logic:
 * - Checks if cached candles exist for the time range
 * - If cache has exactly dto.limit candles, returns cached data
 * - Otherwise, fetches from API and updates cache
 *
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
  self: ClientExchange,
) => {
  const step = INTERVAL_MINUTES[dto.interval];
  const sinceTimestamp = since.getTime();
  const untilTimestamp = sinceTimestamp + dto.limit * step * MS_PER_MINUTE;

  // Try to read from cache first
  const cachedCandles = await READ_CANDLES_CACHE_FN(
    dto,
    sinceTimestamp,
    untilTimestamp,
    self,
  );

  if (cachedCandles !== null) {
    return cachedCandles;
  }

  // Cache miss or error - fetch from API
  let lastError: Error;
  for (let i = 0; i !== GLOBAL_CONFIG.CC_GET_CANDLES_RETRY_COUNT; i++) {
    try {
      const result = await self.params.getCandles(
        dto.symbol,
        dto.interval,
        since,
        dto.limit,
        self.params.execution.context.backtest,
      );

      VALIDATE_NO_INCOMPLETE_CANDLES_FN(result);

      // Write to cache after successful fetch
      await WRITE_CANDLES_CACHE_FN(result, dto, self);

      return result;
    } catch (err) {
      const message = `ClientExchange GET_CANDLES_FN: attempt ${i + 1} failed for symbol=${dto.symbol}, interval=${dto.interval}, since=${since.toISOString()}, limit=${dto.limit}}`;
      const payload = {
        error: errorData(err),
        message: getErrorMessage(err),
      };
      self.params.logger.warn(message, payload);
      console.warn(message, payload);
      lastError = err;
      await sleep(GLOBAL_CONFIG.CC_GET_CANDLES_RETRY_DELAY_MS);
    }
  }
  throw lastError;
};

/**
 * Wrapper to call onCandleData callback with error handling.
 * Catches and logs any errors thrown by the user-provided callback.
 *
 * @param self - ClientExchange instance reference
 * @param symbol - Trading pair symbol
 * @param interval - Candle interval
 * @param since - Start date for candle data
 * @param limit - Number of candles
 * @param data - Array of candle data
 */
const CALL_CANDLE_DATA_CALLBACKS_FN = trycatch(
  async (
    self: ClientExchange,
    symbol: string,
    interval: CandleInterval,
    since: Date,
    limit: number,
    data: ICandleData[],
  ): Promise<void> => {
    if (self.params.callbacks?.onCandleData) {
      await self.params.callbacks.onCandleData(
        symbol,
        interval,
        since,
        limit,
        data,
      );
    }
  },
  {
    fallback: (error) => {
      const message = "ClientExchange CALL_CANDLE_DATA_CALLBACKS_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
  },
);

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
   * Algorithm:
   * 1. Align when down to interval boundary (e.g., 00:17 -> 00:15 for 15m)
   * 2. Calculate since = alignedWhen - limit * step
   * 3. Fetch candles starting from since
   * 4. Validate first candle timestamp matches since (adapter must return inclusive data)
   * 5. Slice to limit
   *
   * @param symbol - Trading pair symbol
   * @param interval - Candle interval
   * @param limit - Number of candles to fetch
   * @returns Promise resolving to array of candles
   */
  public async getCandles(
    symbol: string,
    interval: CandleInterval,
    limit: number,
  ) {
    this.params.logger.debug(`ClientExchange getCandles`, {
      symbol,
      interval,
      limit,
    });

    const step = INTERVAL_MINUTES[interval];

    if (!step) {
      throw new Error(
        `ClientExchange unknown interval=${interval}`,
      );
    }

    const stepMs = step * MS_PER_MINUTE;

    // Align when down to interval boundary
    const whenTimestamp = this.params.execution.context.when.getTime();
    const alignedWhen = ALIGN_TO_INTERVAL_FN(whenTimestamp, step);

    // Calculate since: go back limit candles from aligned when
    const sinceTimestamp = alignedWhen - limit * stepMs;
    const since = new Date(sinceTimestamp);

    let allData: ICandleData[] = [];

    // If limit exceeds CC_MAX_CANDLES_PER_REQUEST, fetch data in chunks
    if (limit > GLOBAL_CONFIG.CC_MAX_CANDLES_PER_REQUEST) {
      let remaining = limit;
      let currentSince = new Date(since.getTime());

      while (remaining > 0) {
        const chunkLimit = Math.min(
          remaining,
          GLOBAL_CONFIG.CC_MAX_CANDLES_PER_REQUEST,
        );
        const chunkData = await GET_CANDLES_FN(
          { symbol, interval, limit: chunkLimit },
          currentSince,
          this,
        );

        allData.push(...chunkData);

        remaining -= chunkLimit;
        if (remaining > 0) {
          // Move currentSince forward by the number of candles fetched
          currentSince = new Date(
            currentSince.getTime() + chunkLimit * stepMs,
          );
        }
      }
    } else {
      allData = await GET_CANDLES_FN({ symbol, interval, limit }, since, this);
    }

    // Apply distinct by timestamp to remove duplicates
    const uniqueData = Array.from(
      new Map(
        allData.map((candle) => [candle.timestamp, candle]),
      ).values(),
    );

    if (allData.length !== uniqueData.length) {
      const msg = `ClientExchange getCandles: Removed ${allData.length - uniqueData.length} duplicate candles by timestamp`;
      this.params.logger.warn(msg);
      console.warn(msg);
    }

    // Validate adapter returned data
    if (uniqueData.length === 0) {
      throw new Error(
        `ClientExchange getCandles: adapter returned empty array. ` +
        `Expected ${limit} candles starting from openTime=${sinceTimestamp}.`,
      );
    }

    if (uniqueData[0].timestamp !== sinceTimestamp) {
      throw new Error(
        `ClientExchange getCandles: first candle timestamp mismatch. ` +
        `Expected openTime=${sinceTimestamp}, got=${uniqueData[0].timestamp}. ` +
        `Adapter must return candles with timestamp=openTime, starting from aligned since.`,
      );
    }

    if (uniqueData.length !== limit) {
      throw new Error(
        `ClientExchange getCandles: candle count mismatch. ` +
        `Expected ${limit} candles, got ${uniqueData.length}. ` +
        `Adapter must return exact number of candles requested.`,
      );
    }

    await CALL_CANDLE_DATA_CALLBACKS_FN(
      this,
      symbol,
      interval,
      since,
      limit,
      uniqueData,
    );

    return uniqueData;
  }

  /**
   * Fetches future candles forwards from execution context time.
   * Used in backtest mode to get candles for signal duration.
   *
   * Algorithm:
   * 1. Align when down to interval boundary (e.g., 00:17 -> 00:15 for 15m)
   * 2. since = alignedWhen (start from aligned when)
   * 3. Fetch candles starting from since
   * 4. Validate first candle timestamp matches since (adapter must return inclusive data)
   * 5. Slice to limit
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
    limit: number,
  ) {
    this.params.logger.debug(`ClientExchange getNextCandles`, {
      symbol,
      interval,
      limit,
    });

    if (!this.params.execution.context.backtest) {
      throw new Error(
        `ClientExchange getNextCandles: cannot fetch future candles in live mode`,
      );
    }

    const step = INTERVAL_MINUTES[interval];

    if (!step) {
      throw new Error(
        `ClientExchange getNextCandles: unknown interval=${interval}`,
      );
    }

    const stepMs = step * MS_PER_MINUTE;
    const now = Date.now();

    // Align when down to interval boundary
    const whenTimestamp = this.params.execution.context.when.getTime();
    const alignedWhen = ALIGN_TO_INTERVAL_FN(whenTimestamp, step);

    // since = alignedWhen (start from aligned when, going forward)
    const sinceTimestamp = alignedWhen;
    const since = new Date(sinceTimestamp);

    // Calculate end time for Date.now() check
    const endTime = sinceTimestamp + limit * stepMs;

    // Check that requested period does not exceed Date.now()
    if (endTime > now) {
      return [];
    }

    let allData: ICandleData[] = [];

    // If limit exceeds CC_MAX_CANDLES_PER_REQUEST, fetch data in chunks
    if (limit > GLOBAL_CONFIG.CC_MAX_CANDLES_PER_REQUEST) {
      let remaining = limit;
      let currentSince = new Date(since.getTime());

      while (remaining > 0) {
        const chunkLimit = Math.min(
          remaining,
          GLOBAL_CONFIG.CC_MAX_CANDLES_PER_REQUEST,
        );
        const chunkData = await GET_CANDLES_FN(
          { symbol, interval, limit: chunkLimit },
          currentSince,
          this,
        );

        allData.push(...chunkData);

        remaining -= chunkLimit;
        if (remaining > 0) {
          // Move currentSince forward by the number of candles fetched
          currentSince = new Date(
            currentSince.getTime() + chunkLimit * stepMs,
          );
        }
      }
    } else {
      allData = await GET_CANDLES_FN({ symbol, interval, limit }, since, this);
    }

    // Apply distinct by timestamp to remove duplicates
    const uniqueData = Array.from(
      new Map(
        allData.map((candle) => [candle.timestamp, candle]),
      ).values(),
    );

    if (allData.length !== uniqueData.length) {
      const msg = `ClientExchange getNextCandles: Removed ${allData.length - uniqueData.length} duplicate candles by timestamp`;
      this.params.logger.warn(msg);
      console.warn(msg);
    }

    // Validate adapter returned data
    if (uniqueData.length === 0) {
      throw new Error(
        `ClientExchange getNextCandles: adapter returned empty array. ` +
        `Expected ${limit} candles starting from openTime=${sinceTimestamp}.`,
      );
    }

    if (uniqueData[0].timestamp !== sinceTimestamp) {
      throw new Error(
        `ClientExchange getNextCandles: first candle timestamp mismatch. ` +
        `Expected openTime=${sinceTimestamp}, got=${uniqueData[0].timestamp}. ` +
        `Adapter must return candles with timestamp=openTime, starting from aligned since.`,
      );
    }

    if (uniqueData.length !== limit) {
      throw new Error(
        `ClientExchange getNextCandles: candle count mismatch. ` +
        `Expected ${limit} candles, got ${uniqueData.length}. ` +
        `Adapter must return exact number of candles requested.`,
      );
    }

    await CALL_CANDLE_DATA_CALLBACKS_FN(
      this,
      symbol,
      interval,
      since,
      limit,
      uniqueData,
    );

    return uniqueData;
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
      GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT,
    );

    if (candles.length === 0) {
      throw new Error(
        `ClientExchange getAveragePrice: no candles data for symbol=${symbol}`,
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
    return await this.params.formatQuantity(
      symbol,
      quantity,
      this.params.execution.context.backtest,
    );
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
    return await this.params.formatPrice(
      symbol,
      price,
      this.params.execution.context.backtest,
    );
  }

  /**
   * Fetches raw candles with flexible date/limit parameters.
   *
   * Algorithm:
   * 1. Align all timestamps down to interval boundary
   * 2. Fetch candles starting from aligned since
   * 3. Validate first candle timestamp matches aligned since (adapter must return inclusive data)
   * 4. Slice to limit
   *
   * All modes respect execution context and prevent look-ahead bias.
   *
   * Parameter combinations:
   * 1. sDate + eDate + limit: fetches with explicit parameters, validates eDate <= when
   * 2. sDate + eDate: calculates limit from date range, validates eDate <= when
   * 3. eDate + limit: calculates sDate backward, validates eDate <= when
   * 4. sDate + limit: fetches forward, validates calculated endTimestamp <= when
   * 5. Only limit: uses execution.context.when as reference (backward)
   *
   * Edge cases:
   * - If calculated limit is 0 or negative: throws error
   * - If sDate >= eDate: throws error
   * - If eDate > when: throws error to prevent look-ahead bias
   *
   * @param symbol - Trading pair symbol
   * @param interval - Candle interval
   * @param limit - Optional number of candles to fetch
   * @param sDate - Optional start date in milliseconds
   * @param eDate - Optional end date in milliseconds
   * @returns Promise resolving to array of candles
   * @throws Error if parameters are invalid or conflicting
   */
  public async getRawCandles(
    symbol: string,
    interval: CandleInterval,
    limit?: number,
    sDate?: number,
    eDate?: number,
  ): Promise<ICandleData[]> {
    this.params.logger.debug(`ClientExchange getRawCandles`, {
      symbol,
      interval,
      limit,
      sDate,
      eDate,
    });

    const step = INTERVAL_MINUTES[interval];
    if (!step) {
      throw new Error(
        `ClientExchange getRawCandles: unknown interval=${interval}`,
      );
    }

    const stepMs = step * MS_PER_MINUTE;
    const whenTimestamp = this.params.execution.context.when.getTime();
    const alignedWhen = ALIGN_TO_INTERVAL_FN(whenTimestamp, step);

    let sinceTimestamp: number;
    let calculatedLimit: number;

    // Case 1: all three parameters provided
    if (sDate !== undefined && eDate !== undefined && limit !== undefined) {
      if (sDate >= eDate) {
        throw new Error(
          `ClientExchange getRawCandles: sDate (${sDate}) must be < eDate (${eDate})`,
        );
      }
      if (eDate > whenTimestamp) {
        throw new Error(
          `ClientExchange getRawCandles: eDate (${eDate}) exceeds execution context when (${whenTimestamp}). Look-ahead bias protection.`,
        );
      }
      // Align sDate down to interval boundary
      sinceTimestamp = ALIGN_TO_INTERVAL_FN(sDate, step);
      calculatedLimit = limit;
    }
    // Case 2: sDate + eDate (no limit) - calculate limit from date range
    else if (sDate !== undefined && eDate !== undefined && limit === undefined) {
      if (sDate >= eDate) {
        throw new Error(
          `ClientExchange getRawCandles: sDate (${sDate}) must be < eDate (${eDate})`,
        );
      }
      if (eDate > whenTimestamp) {
        throw new Error(
          `ClientExchange getRawCandles: eDate (${eDate}) exceeds execution context when (${whenTimestamp}). Look-ahead bias protection.`,
        );
      }
      // Align sDate down to interval boundary
      sinceTimestamp = ALIGN_TO_INTERVAL_FN(sDate, step);
      const alignedEDate = ALIGN_TO_INTERVAL_FN(eDate, step);
      calculatedLimit = Math.ceil((alignedEDate - sinceTimestamp) / stepMs);
      if (calculatedLimit <= 0) {
        throw new Error(
          `ClientExchange getRawCandles: calculated limit is ${calculatedLimit}, must be > 0`,
        );
      }
    }
    // Case 3: eDate + limit (no sDate) - calculate sDate backward from eDate
    else if (sDate === undefined && eDate !== undefined && limit !== undefined) {
      if (eDate > whenTimestamp) {
        throw new Error(
          `ClientExchange getRawCandles: eDate (${eDate}) exceeds execution context when (${whenTimestamp}). Look-ahead bias protection.`,
        );
      }
      // Align eDate down and calculate sinceTimestamp
      const alignedEDate = ALIGN_TO_INTERVAL_FN(eDate, step);
      sinceTimestamp = alignedEDate - limit * stepMs;
      calculatedLimit = limit;
    }
    // Case 4: sDate + limit (no eDate) - calculate eDate forward from sDate
    else if (sDate !== undefined && eDate === undefined && limit !== undefined) {
      // Align sDate down to interval boundary
      sinceTimestamp = ALIGN_TO_INTERVAL_FN(sDate, step);
      const endTimestamp = sinceTimestamp + limit * stepMs;
      if (endTimestamp > whenTimestamp) {
        throw new Error(
          `ClientExchange getRawCandles: calculated endTimestamp (${endTimestamp}) exceeds execution context when (${whenTimestamp}). Look-ahead bias protection.`,
        );
      }
      calculatedLimit = limit;
    }
    // Case 5: Only limit - use execution.context.when as reference (backward like getCandles)
    else if (sDate === undefined && eDate === undefined && limit !== undefined) {
      sinceTimestamp = alignedWhen - limit * stepMs;
      calculatedLimit = limit;
    }
    // Invalid: no parameters or only sDate or only eDate
    else {
      throw new Error(
        `ClientExchange getRawCandles: invalid parameter combination. ` +
        `Provide one of: (sDate+eDate+limit), (sDate+eDate), (eDate+limit), (sDate+limit), or (limit only). ` +
        `Got: sDate=${sDate}, eDate=${eDate}, limit=${limit}`,
      );
    }

    // Fetch candles using existing logic
    const since = new Date(sinceTimestamp);
    let allData: ICandleData[] = [];

    if (calculatedLimit > GLOBAL_CONFIG.CC_MAX_CANDLES_PER_REQUEST) {
      let remaining = calculatedLimit;
      let currentSince = new Date(since.getTime());

      while (remaining > 0) {
        const chunkLimit = Math.min(
          remaining,
          GLOBAL_CONFIG.CC_MAX_CANDLES_PER_REQUEST,
        );
        const chunkData = await GET_CANDLES_FN(
          { symbol, interval, limit: chunkLimit },
          currentSince,
          this,
        );

        allData.push(...chunkData);

        remaining -= chunkLimit;
        if (remaining > 0) {
          currentSince = new Date(
            currentSince.getTime() + chunkLimit * stepMs,
          );
        }
      }
    } else {
      allData = await GET_CANDLES_FN(
        { symbol, interval, limit: calculatedLimit },
        since,
        this,
      );
    }

    // Apply distinct by timestamp to remove duplicates
    const uniqueData = Array.from(
      new Map(
        allData.map((candle) => [candle.timestamp, candle]),
      ).values(),
    );

    if (allData.length !== uniqueData.length) {
      const msg = `ClientExchange getRawCandles: Removed ${allData.length - uniqueData.length} duplicate candles by timestamp`;
      this.params.logger.warn(msg);
      console.warn(msg);
    }

    // Validate adapter returned data
    if (uniqueData.length === 0) {
      throw new Error(
        `ClientExchange getRawCandles: adapter returned empty array. ` +
        `Expected ${calculatedLimit} candles starting from openTime=${sinceTimestamp}.`,
      );
    }

    if (uniqueData[0].timestamp !== sinceTimestamp) {
      throw new Error(
        `ClientExchange getRawCandles: first candle timestamp mismatch. ` +
        `Expected openTime=${sinceTimestamp}, got=${uniqueData[0].timestamp}. ` +
        `Adapter must return candles with timestamp=openTime, starting from aligned since.`,
      );
    }

    if (uniqueData.length !== calculatedLimit) {
      throw new Error(
        `ClientExchange getRawCandles: candle count mismatch. ` +
        `Expected ${calculatedLimit} candles, got ${uniqueData.length}. ` +
        `Adapter must return exact number of candles requested.`,
      );
    }

    await CALL_CANDLE_DATA_CALLBACKS_FN(
      this,
      symbol,
      interval,
      since,
      calculatedLimit,
      uniqueData,
    );

    return uniqueData;
  }

  /**
   * Fetches order book for a trading pair.
   *
   * Calculates time range based on execution context time (when) and
   * CC_ORDER_BOOK_TIME_OFFSET_MINUTES, then delegates to the exchange
   * schema implementation which may use or ignore the time range.
   *
   * @param symbol - Trading pair symbol
   * @param depth - Maximum depth levels (default: CC_ORDER_BOOK_MAX_DEPTH_LEVELS)
   * @returns Promise resolving to order book data
   * @throws Error if getOrderBook is not implemented
   */
  public async getOrderBook(
    symbol: string,
    depth: number = GLOBAL_CONFIG.CC_ORDER_BOOK_MAX_DEPTH_LEVELS,
  ): Promise<IOrderBookData> {
    this.params.logger.debug("ClientExchange getOrderBook", {
      symbol,
      depth,
    });

    const whenTimestamp = this.params.execution.context.when.getTime();
    const alignedTo = ALIGN_TO_INTERVAL_FN(
      whenTimestamp,
      GLOBAL_CONFIG.CC_ORDER_BOOK_TIME_OFFSET_MINUTES,
    );
    const to = new Date(alignedTo);
    const from = new Date(
      alignedTo -
        GLOBAL_CONFIG.CC_ORDER_BOOK_TIME_OFFSET_MINUTES * MS_PER_MINUTE,
    );
    return await this.params.getOrderBook(
      symbol,
      depth,
      from,
      to,
      this.params.execution.context.backtest,
    );
  }
}

export default ClientExchange;

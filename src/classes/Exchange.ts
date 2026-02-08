import backtest, { ExecutionContextService } from "../lib";
import { CandleInterval, ExchangeName, ICandleData, IExchange, IExchangeSchema, IOrderBookData } from "../interfaces/Exchange.interface";
import { errorData, getErrorMessage, memoize, queued, trycatch } from "functools-kit";
import { GLOBAL_CONFIG } from "../config/params";
import { PersistCandleAdapter } from "./Persist";
import { errorEmitter } from "../config/emitters";

const EXCHANGE_METHOD_NAME_GET_CANDLES = "ExchangeUtils.getCandles";
const EXCHANGE_METHOD_NAME_GET_AVERAGE_PRICE = "ExchangeUtils.getAveragePrice";
const EXCHANGE_METHOD_NAME_FORMAT_QUANTITY = "ExchangeUtils.formatQuantity";
const EXCHANGE_METHOD_NAME_FORMAT_PRICE = "ExchangeUtils.formatPrice";
const EXCHANGE_METHOD_NAME_GET_ORDER_BOOK = "ExchangeUtils.getOrderBook";
const EXCHANGE_METHOD_NAME_GET_RAW_CANDLES = "ExchangeUtils.getRawCandles";

const MS_PER_MINUTE = 60_000;

/**
 * Gets current timestamp from execution context if available.
 * Returns current Date() if no execution context exists (non-trading GUI).
 */
const GET_TIMESTAMP_FN = async () => {
  if (ExecutionContextService.hasContext()) {
    return new Date(backtest.executionContextService.context.when);
  }
  return new Date();
}

/**
 * Gets backtest mode flag from execution context if available.
 * Returns false if no execution context exists (live mode).
 */
const GET_BACKTEST_FN = async () => {
  if (ExecutionContextService.hasContext()) {
    return backtest.executionContextService.context.backtest;
  }
  return false;
};

/**
 * Default implementation for getCandles.
 * Throws an error indicating the method is not implemented.
 */
const DEFAULT_GET_CANDLES_FN = async (_symbol: string, _interval: CandleInterval, _since: Date, _limit: number, _backtest: boolean): Promise<ICandleData[]> => {
  throw new Error(`getCandles is not implemented for this exchange`);
};

/**
 * Default implementation for formatQuantity.
 * Returns Bitcoin precision on Binance (8 decimal places).
 */
const DEFAULT_FORMAT_QUANTITY_FN = async (_symbol: string, quantity: number, _backtest: boolean): Promise<string> => {
  return quantity.toFixed(8);
};

/**
 * Default implementation for formatPrice.
 * Returns Bitcoin precision on Binance (2 decimal places).
 */
const DEFAULT_FORMAT_PRICE_FN = async (_symbol: string, price: number, _backtest: boolean): Promise<string> => {
  return price.toFixed(2);
};

/**
 * Default implementation for getOrderBook.
 * Throws an error indicating the method is not implemented.
 *
 * @param _symbol - Trading pair symbol (unused)
 * @param _depth - Maximum depth levels (unused)
 * @param _from - Start of time range (unused - can be ignored in live implementations)
 * @param _to - End of time range (unused - can be ignored in live implementations)
 * @param _backtest - Whether running in backtest mode (unused)
 */
const DEFAULT_GET_ORDER_BOOK_FN = async (_symbol: string, _depth: number, _from: Date, _to: Date, _backtest: boolean): Promise<IOrderBookData> => {
  throw new Error(`getOrderBook is not implemented for this exchange`);
};

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
 * Type representing exchange methods with defaults applied.
 *
 * Extracts only the method fields from IExchangeSchema (getCandles, formatQuantity,
 * formatPrice, getOrderBook) and makes them all required. Excludes metadata fields
 * like exchangeName, note, and callbacks.
 *
 * Used as the return type for CREATE_EXCHANGE_INSTANCE_FN to ensure all methods
 * are resolved with defaults applied during instance construction.
 */
type TExchange = Required<Omit<IExchangeSchema, keyof {
  exchangeName: never;
  note: never;
  callbacks: never;
}>>;

/**
 * Creates exchange instance with methods resolved once during construction.
 * Applies default implementations where schema methods are not provided.
 *
 * @param schema - Exchange schema from registry
 * @returns Object with resolved exchange methods
 */
const CREATE_EXCHANGE_INSTANCE_FN = (schema: IExchangeSchema): TExchange => {
  const getCandles = schema.getCandles ?? DEFAULT_GET_CANDLES_FN;
  const formatQuantity = schema.formatQuantity ?? DEFAULT_FORMAT_QUANTITY_FN;
  const formatPrice = schema.formatPrice ?? DEFAULT_FORMAT_PRICE_FN;
  const getOrderBook = schema.getOrderBook ?? DEFAULT_GET_ORDER_BOOK_FN;

  return {
    getCandles,
    formatQuantity,
    formatPrice,
    getOrderBook,
  };
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
 * @param exchangeName - Exchange name
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
    exchangeName: ExchangeName,
  ): Promise<ICandleData[] | null> => {
    // PersistCandleAdapter.readCandlesData calculates expected timestamps:
    // sinceTimestamp + i * stepMs for i = 0..limit-1
    // Returns all candles if found, null if any missing
    const cachedCandles = await PersistCandleAdapter.readCandlesData(
      dto.symbol,
      dto.interval,
      exchangeName,
      dto.limit,
      sinceTimestamp,
      untilTimestamp,
    );

    // Return cached data only if we have exactly the requested limit
    if (cachedCandles?.length === dto.limit) {
      backtest.loggerService.debug(
        `ExchangeInstance READ_CANDLES_CACHE_FN: cache hit for exchangeName=${exchangeName}, symbol=${dto.symbol}, interval=${dto.interval}, limit=${dto.limit}`,
      );
      return cachedCandles;
    }

    backtest.loggerService.warn(
      `ExchangeInstance READ_CANDLES_CACHE_FN: cache inconsistent (count or range mismatch) for exchangeName=${exchangeName}, symbol=${dto.symbol}, interval=${dto.interval}, limit=${dto.limit}`,
    );

    return null;
  },
  {
    fallback: async (error) => {
      const message = `ExchangeInstance READ_CANDLES_CACHE_FN: cache read failed`;
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
 * @param exchangeName - Exchange name
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
      exchangeName: ExchangeName,
    ): Promise<void> => {
      await PersistCandleAdapter.writeCandlesData(
        candles,
        dto.symbol,
        dto.interval,
        exchangeName,
      );
      backtest.loggerService.debug(
        `ExchangeInstance WRITE_CANDLES_CACHE_FN: cache updated for exchangeName=${exchangeName}, symbol=${dto.symbol}, interval=${dto.interval}, count=${candles.length}`,
      );
    },
  ),
  {
    fallback: async (error) => {
      const message = `ExchangeInstance WRITE_CANDLES_CACHE_FN: cache write failed`;
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
 * Instance class for exchange operations on a specific exchange.
 *
 * Provides isolated exchange operations for a single exchange.
 * Each instance maintains its own context and exposes IExchangeSchema methods.
 * The schema is retrieved once during construction for better performance.
 *
 * @example
 * ```typescript
 * const instance = new ExchangeInstance("binance");
 *
 * const candles = await instance.getCandles("BTCUSDT", "1m", 100);
 * const vwap = await instance.getAveragePrice("BTCUSDT");
 * const formattedQty = await instance.formatQuantity("BTCUSDT", 0.001);
 * const formattedPrice = await instance.formatPrice("BTCUSDT", 50000.123);
 * ```
 */
export class ExchangeInstance {
  /** Resolved exchange methods with defaults applied once during construction */
  private _methods: ReturnType<typeof CREATE_EXCHANGE_INSTANCE_FN>;

  /**
   * Creates a new ExchangeInstance for a specific exchange.
   *
   * @param exchangeName - Exchange name (e.g., "binance")
   */
  constructor(readonly exchangeName: ExchangeName) {
    const schema = backtest.exchangeSchemaService.get(this.exchangeName);
    this._methods = CREATE_EXCHANGE_INSTANCE_FN(schema);
  }

  /**
   * Fetch candles from data source (API or database).
   *
   * Automatically calculates the start date based on Date.now() and the requested interval/limit.
   * Uses the same logic as ClientExchange to ensure backwards compatibility.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param interval - Candle time interval (e.g., "1m", "1h")
   * @param limit - Maximum number of candles to fetch
   * @returns Promise resolving to array of OHLCV candle data
   *
   * @example
   * ```typescript
   * const instance = new ExchangeInstance("binance");
   * const candles = await instance.getCandles("BTCUSDT", "1m", 100);
   * ```
   */
  public getCandles = async (
    symbol: string,
    interval: CandleInterval,
    limit: number
  ) => {
    backtest.loggerService.info(EXCHANGE_METHOD_NAME_GET_CANDLES, {
      exchangeName: this.exchangeName,
      symbol,
      interval,
      limit,
    });

    const getCandles = this._methods.getCandles;

    const step = INTERVAL_MINUTES[interval];

    if (!step) {
      throw new Error(
        `ExchangeInstance unknown interval=${interval}`
      );
    }

    const stepMs = step * MS_PER_MINUTE;

    // Align when down to interval boundary
    const when = await GET_TIMESTAMP_FN();
    const whenTimestamp = when.getTime();
    const alignedWhen = ALIGN_TO_INTERVAL_FN(whenTimestamp, step);

    // Calculate since: go back limit candles from aligned when
    const sinceTimestamp = alignedWhen - limit * stepMs;
    const since = new Date(sinceTimestamp);
    const untilTimestamp = alignedWhen;

    // Try to read from cache first
    const cachedCandles = await READ_CANDLES_CACHE_FN(
      { symbol, interval, limit },
      sinceTimestamp,
      untilTimestamp,
      this.exchangeName,
    );

    if (cachedCandles !== null) {
      return cachedCandles;
    }

    let allData: ICandleData[] = [];

    // If limit exceeds CC_MAX_CANDLES_PER_REQUEST, fetch data in chunks
    if (limit > GLOBAL_CONFIG.CC_MAX_CANDLES_PER_REQUEST) {
      let remaining = limit;
      let currentSince = new Date(since.getTime());
      const isBacktest = await GET_BACKTEST_FN();

      while (remaining > 0) {
        const chunkLimit = Math.min(remaining, GLOBAL_CONFIG.CC_MAX_CANDLES_PER_REQUEST);
        const chunkData = await getCandles(
          symbol,
          interval,
          currentSince,
          chunkLimit,
          isBacktest
        );

        allData.push(...chunkData);

        remaining -= chunkLimit;
        if (remaining > 0) {
          // Move currentSince forward by the number of candles fetched
          currentSince = new Date(
            currentSince.getTime() + chunkLimit * stepMs
          );
        }
      }
    } else {
      const isBacktest = await GET_BACKTEST_FN();
      allData = await getCandles(symbol, interval, since, limit, isBacktest);
    }

    // Apply distinct by timestamp to remove duplicates
    const uniqueData = Array.from(
      new Map(allData.map((candle) => [candle.timestamp, candle])).values()
    );

    if (allData.length !== uniqueData.length) {
      backtest.loggerService.warn(
        `ExchangeInstance getCandles: Removed ${allData.length - uniqueData.length} duplicate candles by timestamp`
      );
    }

    // Validate adapter returned data
    if (uniqueData.length === 0) {
      throw new Error(
        `ExchangeInstance getCandles: adapter returned empty array. ` +
        `Expected ${limit} candles starting from openTime=${sinceTimestamp}.`
      );
    }

    if (uniqueData[0].timestamp !== sinceTimestamp) {
      throw new Error(
        `ExchangeInstance getCandles: first candle timestamp mismatch. ` +
        `Expected openTime=${sinceTimestamp}, got=${uniqueData[0].timestamp}. ` +
        `Adapter must return candles with timestamp=openTime, starting from aligned since.`
      );
    }

    if (uniqueData.length !== limit) {
      throw new Error(
        `ExchangeInstance getCandles: candle count mismatch. ` +
        `Expected ${limit} candles, got ${uniqueData.length}. ` +
        `Adapter must return exact number of candles requested.`
      );
    }

    // Write to cache after successful fetch
    await WRITE_CANDLES_CACHE_FN(
      uniqueData,
      { symbol, interval, limit },
      this.exchangeName,
    );

    return uniqueData;
  };

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
   *
   * @example
   * ```typescript
   * const instance = new ExchangeInstance("binance");
   * const vwap = await instance.getAveragePrice("BTCUSDT");
   * console.log(vwap); // 50125.43
   * ```
   */
  public getAveragePrice = async (symbol: string): Promise<number> => {
    backtest.loggerService.debug(`ExchangeInstance getAveragePrice`, {
      exchangeName: this.exchangeName,
      symbol,
    });

    const candles = await this.getCandles(
      symbol,
      "1m",
      GLOBAL_CONFIG.CC_AVG_PRICE_CANDLES_COUNT
    );

    if (candles.length === 0) {
      throw new Error(
        `ExchangeInstance getAveragePrice: no candles data for symbol=${symbol}`
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

  /**
   * Format quantity according to exchange precision rules.
   *
   * @param symbol - Trading pair symbol
   * @param quantity - Raw quantity value
   * @returns Promise resolving to formatted quantity string
   *
   * @example
   * ```typescript
   * const instance = new ExchangeInstance("binance");
   * const formatted = await instance.formatQuantity("BTCUSDT", 0.001);
   * console.log(formatted); // "0.00100000"
   * ```
   */
  public formatQuantity = async (symbol: string, quantity: number): Promise<string> => {
    backtest.loggerService.info(EXCHANGE_METHOD_NAME_FORMAT_QUANTITY, {
      exchangeName: this.exchangeName,
      symbol,
      quantity,
    });
    const isBacktest = await GET_BACKTEST_FN();
    return await this._methods.formatQuantity(symbol, quantity, isBacktest);
  };

  /**
   * Format price according to exchange precision rules.
   *
   * @param symbol - Trading pair symbol
   * @param price - Raw price value
   * @returns Promise resolving to formatted price string
   *
   * @example
   * ```typescript
   * const instance = new ExchangeInstance("binance");
   * const formatted = await instance.formatPrice("BTCUSDT", 50000.123);
   * console.log(formatted); // "50000.12"
   * ```
   */
  public formatPrice = async (symbol: string, price: number): Promise<string> => {
    backtest.loggerService.info(EXCHANGE_METHOD_NAME_FORMAT_PRICE, {
      exchangeName: this.exchangeName,
      symbol,
      price,
    });
    const isBacktest = await GET_BACKTEST_FN();
    return await this._methods.formatPrice(symbol, price, isBacktest);
  };

  /**
   * Fetch order book for a trading pair.
   *
   * Calculates time range using CC_ORDER_BOOK_TIME_OFFSET_MINUTES (default 10 minutes)
   * and passes it to the exchange schema implementation. The implementation may use
   * the time range (backtest) or ignore it (live trading).
   *
   * @param symbol - Trading pair symbol
   * @param depth - Maximum depth levels (default: CC_ORDER_BOOK_MAX_DEPTH_LEVELS)
   * @returns Promise resolving to order book data
   * @throws Error if getOrderBook is not implemented
   *
   * @example
   * ```typescript
   * const instance = new ExchangeInstance("binance");
   * const orderBook = await instance.getOrderBook("BTCUSDT");
   * console.log(orderBook.bids); // [{ price: "50000.00", quantity: "0.5" }, ...]
   * const deepOrderBook = await instance.getOrderBook("BTCUSDT", 100);
   * ```
   */
  public getOrderBook = async (symbol: string, depth: number = GLOBAL_CONFIG.CC_ORDER_BOOK_MAX_DEPTH_LEVELS): Promise<IOrderBookData> => {
    backtest.loggerService.info(EXCHANGE_METHOD_NAME_GET_ORDER_BOOK, {
      exchangeName: this.exchangeName,
      symbol,
      depth,
    });

    const when = await GET_TIMESTAMP_FN();
    const alignedTo = ALIGN_TO_INTERVAL_FN(
      when.getTime(),
      GLOBAL_CONFIG.CC_ORDER_BOOK_TIME_OFFSET_MINUTES,
    );
    const to = new Date(alignedTo);
    const from = new Date(alignedTo - GLOBAL_CONFIG.CC_ORDER_BOOK_TIME_OFFSET_MINUTES * MS_PER_MINUTE);
    const isBacktest = await GET_BACKTEST_FN();
    return await this._methods.getOrderBook(symbol, depth, from, to, isBacktest);
  };

  /**
   * Fetches raw candles with flexible date/limit parameters.
   *
   * Uses Date.now() instead of execution context when for look-ahead bias protection.
   *
   * Parameter combinations:
   * 1. sDate + eDate + limit: fetches with explicit parameters, validates eDate <= now
   * 2. sDate + eDate: calculates limit from date range, validates eDate <= now
   * 3. eDate + limit: calculates sDate backward, validates eDate <= now
   * 4. sDate + limit: fetches forward, validates calculated endTimestamp <= now
   * 5. Only limit: uses Date.now() as reference (backward)
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param interval - Candle interval (e.g., "1m", "1h")
   * @param limit - Optional number of candles to fetch
   * @param sDate - Optional start date in milliseconds
   * @param eDate - Optional end date in milliseconds
   * @returns Promise resolving to array of candle data
   *
   * @example
   * ```typescript
   * const instance = new ExchangeInstance("binance");
   *
   * // Fetch 100 candles backward from now
   * const candles = await instance.getRawCandles("BTCUSDT", "1m", 100);
   *
   * // Fetch candles for specific date range
   * const rangeCandles = await instance.getRawCandles("BTCUSDT", "1h", undefined, startMs, endMs);
   * ```
   */
  public getRawCandles = async (
    symbol: string,
    interval: CandleInterval,
    limit?: number,
    sDate?: number,
    eDate?: number
  ): Promise<ICandleData[]> => {
    backtest.loggerService.info(EXCHANGE_METHOD_NAME_GET_RAW_CANDLES, {
      exchangeName: this.exchangeName,
      symbol,
      interval,
      limit,
      sDate,
      eDate,
    });

    const step = INTERVAL_MINUTES[interval];
    if (!step) {
      throw new Error(
        `ExchangeInstance getRawCandles: unknown interval=${interval}`
      );
    }

    const stepMs = step * MS_PER_MINUTE;
    const when = await GET_TIMESTAMP_FN();
    const nowTimestamp = when.getTime();
    const alignedNow = ALIGN_TO_INTERVAL_FN(nowTimestamp, step);

    let sinceTimestamp: number;
    let calculatedLimit: number;

    // Case 1: all three parameters provided
    if (sDate !== undefined && eDate !== undefined && limit !== undefined) {
      if (sDate >= eDate) {
        throw new Error(
          `ExchangeInstance getRawCandles: sDate (${sDate}) must be < eDate (${eDate})`
        );
      }
      if (eDate > nowTimestamp) {
        throw new Error(
          `ExchangeInstance getRawCandles: eDate (${eDate}) exceeds current time (${nowTimestamp}). Look-ahead bias protection.`
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
          `ExchangeInstance getRawCandles: sDate (${sDate}) must be < eDate (${eDate})`
        );
      }
      if (eDate > nowTimestamp) {
        throw new Error(
          `ExchangeInstance getRawCandles: eDate (${eDate}) exceeds current time (${nowTimestamp}). Look-ahead bias protection.`
        );
      }
      // Align sDate down to interval boundary
      sinceTimestamp = ALIGN_TO_INTERVAL_FN(sDate, step);
      const alignedEDate = ALIGN_TO_INTERVAL_FN(eDate, step);
      calculatedLimit = Math.ceil((alignedEDate - sinceTimestamp) / stepMs);
      if (calculatedLimit <= 0) {
        throw new Error(
          `ExchangeInstance getRawCandles: calculated limit is ${calculatedLimit}, must be > 0`
        );
      }
    }
    // Case 3: eDate + limit (no sDate) - calculate sDate backward from eDate
    else if (sDate === undefined && eDate !== undefined && limit !== undefined) {
      if (eDate > nowTimestamp) {
        throw new Error(
          `ExchangeInstance getRawCandles: eDate (${eDate}) exceeds current time (${nowTimestamp}). Look-ahead bias protection.`
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
      if (endTimestamp > nowTimestamp) {
        throw new Error(
          `ExchangeInstance getRawCandles: calculated endTimestamp (${endTimestamp}) exceeds current time (${nowTimestamp}). Look-ahead bias protection.`
        );
      }
      calculatedLimit = limit;
    }
    // Case 5: Only limit - use Date.now() as reference (backward)
    else if (sDate === undefined && eDate === undefined && limit !== undefined) {
      sinceTimestamp = alignedNow - limit * stepMs;
      calculatedLimit = limit;
    }
    // Invalid: no parameters or only sDate or only eDate
    else {
      throw new Error(
        `ExchangeInstance getRawCandles: invalid parameter combination. ` +
        `Provide one of: (sDate+eDate+limit), (sDate+eDate), (eDate+limit), (sDate+limit), or (limit only). ` +
        `Got: sDate=${sDate}, eDate=${eDate}, limit=${limit}`
      );
    }

    // Try to read from cache first
    const untilTimestamp = sinceTimestamp + calculatedLimit * stepMs;
    const cachedCandles = await READ_CANDLES_CACHE_FN(
      { symbol, interval, limit: calculatedLimit },
      sinceTimestamp,
      untilTimestamp,
      this.exchangeName
    );

    if (cachedCandles !== null) {
      return cachedCandles;
    }

    // Fetch candles
    const since = new Date(sinceTimestamp);
    let allData: ICandleData[] = [];
    const isBacktest = await GET_BACKTEST_FN();
    const getCandles = this._methods.getCandles;

    if (calculatedLimit > GLOBAL_CONFIG.CC_MAX_CANDLES_PER_REQUEST) {
      let remaining = calculatedLimit;
      let currentSince = new Date(since.getTime());

      while (remaining > 0) {
        const chunkLimit = Math.min(remaining, GLOBAL_CONFIG.CC_MAX_CANDLES_PER_REQUEST);
        const chunkData = await getCandles(
          symbol,
          interval,
          currentSince,
          chunkLimit,
          isBacktest
        );

        allData.push(...chunkData);

        remaining -= chunkLimit;
        if (remaining > 0) {
          currentSince = new Date(
            currentSince.getTime() + chunkLimit * stepMs
          );
        }
      }
    } else {
      allData = await getCandles(symbol, interval, since, calculatedLimit, isBacktest);
    }

    // Apply distinct by timestamp to remove duplicates
    const uniqueData = Array.from(
      new Map(allData.map((candle) => [candle.timestamp, candle])).values()
    );

    if (allData.length !== uniqueData.length) {
      backtest.loggerService.warn(
        `ExchangeInstance getRawCandles: Removed ${allData.length - uniqueData.length} duplicate candles by timestamp`
      );
    }

    // Validate adapter returned data
    if (uniqueData.length === 0) {
      throw new Error(
        `ExchangeInstance getRawCandles: adapter returned empty array. ` +
        `Expected ${calculatedLimit} candles starting from openTime=${sinceTimestamp}.`
      );
    }

    if (uniqueData[0].timestamp !== sinceTimestamp) {
      throw new Error(
        `ExchangeInstance getRawCandles: first candle timestamp mismatch. ` +
        `Expected openTime=${sinceTimestamp}, got=${uniqueData[0].timestamp}. ` +
        `Adapter must return candles with timestamp=openTime, starting from aligned since.`
      );
    }

    if (uniqueData.length !== calculatedLimit) {
      throw new Error(
        `ExchangeInstance getRawCandles: candle count mismatch. ` +
        `Expected ${calculatedLimit} candles, got ${uniqueData.length}. ` +
        `Adapter must return exact number of candles requested.`
      );
    }

    // Write to cache after successful fetch
    await WRITE_CANDLES_CACHE_FN(
      uniqueData,
      { symbol, interval, limit: calculatedLimit },
      this.exchangeName
    );

    return uniqueData;
  };
}

/**
 * Utility class for exchange operations.
 *
 * Provides simplified access to exchange schema methods with validation.
 * Exported as singleton instance for convenient usage.
 *
 * @example
 * ```typescript
 * import { Exchange } from "./classes/Exchange";
 *
 * const candles = await Exchange.getCandles("BTCUSDT", "1m", 100, {
 *   exchangeName: "binance"
 * });
 * const vwap = await Exchange.getAveragePrice("BTCUSDT", {
 *   exchangeName: "binance"
 * });
 * const formatted = await Exchange.formatQuantity("BTCUSDT", 0.001, {
 *   exchangeName: "binance"
 * });
 * ```
 */
export class ExchangeUtils {
  /**
   * Memoized function to get or create ExchangeInstance for an exchange.
   * Each exchange gets its own isolated instance.
   */
  private _getInstance = memoize<(exchangeName: ExchangeName) => ExchangeInstance>(
    ([exchangeName]) => exchangeName,
    (exchangeName: ExchangeName) => new ExchangeInstance(exchangeName)
  );

  /**
   * Fetch candles from data source (API or database).
   *
   * Automatically calculates the start date based on Date.now() and the requested interval/limit.
   * Uses the same logic as ClientExchange to ensure backwards compatibility.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param interval - Candle time interval (e.g., "1m", "1h")
   * @param limit - Maximum number of candles to fetch
   * @param context - Execution context with exchange name
   * @returns Promise resolving to array of OHLCV candle data
   */
  public getCandles = async (
    symbol: string,
    interval: CandleInterval,
    limit: number,
    context: {
      exchangeName: ExchangeName;
    }
  ) => {
    backtest.exchangeValidationService.validate(context.exchangeName, EXCHANGE_METHOD_NAME_GET_CANDLES);

    const instance = this._getInstance(context.exchangeName);
    return await instance.getCandles(symbol, interval, limit);
  };

  /**
   * Calculates VWAP (Volume Weighted Average Price) from last N 1m candles.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with exchange name
   * @returns Promise resolving to VWAP price
   */
  public getAveragePrice = async (
    symbol: string,
    context: {
      exchangeName: ExchangeName;
    }
  ): Promise<number> => {
    backtest.exchangeValidationService.validate(context.exchangeName, EXCHANGE_METHOD_NAME_GET_AVERAGE_PRICE);

    const instance = this._getInstance(context.exchangeName);
    return await instance.getAveragePrice(symbol);
  };

  /**
   * Format quantity according to exchange precision rules.
   *
   * @param symbol - Trading pair symbol
   * @param quantity - Raw quantity value
   * @param context - Execution context with exchange name
   * @returns Promise resolving to formatted quantity string
   */
  public formatQuantity = async (
    symbol: string,
    quantity: number,
    context: {
      exchangeName: ExchangeName;
    }
  ): Promise<string> => {
    backtest.exchangeValidationService.validate(context.exchangeName, EXCHANGE_METHOD_NAME_FORMAT_QUANTITY);

    const instance = this._getInstance(context.exchangeName);
    return await instance.formatQuantity(symbol, quantity);
  };

  /**
   * Format price according to exchange precision rules.
   *
   * @param symbol - Trading pair symbol
   * @param price - Raw price value
   * @param context - Execution context with exchange name
   * @returns Promise resolving to formatted price string
   */
  public formatPrice = async (
    symbol: string,
    price: number,
    context: {
      exchangeName: ExchangeName;
    }
  ): Promise<string> => {
    backtest.exchangeValidationService.validate(context.exchangeName, EXCHANGE_METHOD_NAME_FORMAT_PRICE);

    const instance = this._getInstance(context.exchangeName);
    return await instance.formatPrice(symbol, price);
  };

  /**
   * Fetch order book for a trading pair.
   *
   * Delegates to ExchangeInstance which calculates time range and passes it
   * to the exchange schema implementation. The from/to parameters may be used
   * (backtest) or ignored (live) depending on the implementation.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with exchange name
   * @param depth - Maximum depth levels (default: CC_ORDER_BOOK_MAX_DEPTH_LEVELS)
   * @returns Promise resolving to order book data
   */
  public getOrderBook = async (
    symbol: string,
    context: {
      exchangeName: ExchangeName;
    },
    depth: number = GLOBAL_CONFIG.CC_ORDER_BOOK_MAX_DEPTH_LEVELS
  ): Promise<IOrderBookData> => {
    backtest.exchangeValidationService.validate(context.exchangeName, EXCHANGE_METHOD_NAME_GET_ORDER_BOOK);

    const instance = this._getInstance(context.exchangeName);
    return await instance.getOrderBook(symbol, depth);
  };

  /**
   * Fetches raw candles with flexible date/limit parameters.
   *
   * Uses Date.now() instead of execution context when for look-ahead bias protection.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param interval - Candle interval (e.g., "1m", "1h")
   * @param context - Execution context with exchange name
   * @param limit - Optional number of candles to fetch
   * @param sDate - Optional start date in milliseconds
   * @param eDate - Optional end date in milliseconds
   * @returns Promise resolving to array of candle data
   */
  public getRawCandles = async (
    symbol: string,
    interval: CandleInterval,
    context: {
      exchangeName: ExchangeName;
    },
    limit?: number,
    sDate?: number,
    eDate?: number
  ): Promise<ICandleData[]> => {
    backtest.exchangeValidationService.validate(context.exchangeName, EXCHANGE_METHOD_NAME_GET_RAW_CANDLES);

    const instance = this._getInstance(context.exchangeName);
    return await instance.getRawCandles(symbol, interval, limit, sDate, eDate);
  };
}

/**
 * Singleton instance of ExchangeUtils for convenient exchange operations.
 *
 * @example
 * ```typescript
 * import { Exchange } from "./classes/Exchange";
 *
 * // Using static-like API with context
 * const candles = await Exchange.getCandles("BTCUSDT", "1m", 100, {
 *   exchangeName: "binance"
 * });
 * const vwap = await Exchange.getAveragePrice("BTCUSDT", {
 *   exchangeName: "binance"
 * });
 * const qty = await Exchange.formatQuantity("BTCUSDT", 0.001, {
 *   exchangeName: "binance"
 * });
 * const price = await Exchange.formatPrice("BTCUSDT", 50000.123, {
 *   exchangeName: "binance"
 * });
 *
 * // Using instance API (no context needed, exchange set in constructor)
 * const binance = new ExchangeInstance("binance");
 * const candles2 = await binance.getCandles("BTCUSDT", "1m", 100);
 * const vwap2 = await binance.getAveragePrice("BTCUSDT");
 * ```
 */
export const Exchange = new ExchangeUtils();

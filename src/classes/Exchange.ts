import backtest from "../lib";
import { CandleInterval, ExchangeName, ICandleData, IExchange, IExchangeSchema, IOrderBookData } from "../interfaces/Exchange.interface";
import { memoize } from "functools-kit";
import { GLOBAL_CONFIG } from "../config/params";

const EXCHANGE_METHOD_NAME_GET_CANDLES = "ExchangeUtils.getCandles";
const EXCHANGE_METHOD_NAME_GET_AVERAGE_PRICE = "ExchangeUtils.getAveragePrice";
const EXCHANGE_METHOD_NAME_FORMAT_QUANTITY = "ExchangeUtils.formatQuantity";
const EXCHANGE_METHOD_NAME_FORMAT_PRICE = "ExchangeUtils.formatPrice";
const EXCHANGE_METHOD_NAME_GET_ORDER_BOOK = "ExchangeUtils.getOrderBook";

/**
 * Default implementation for getCandles.
 * Throws an error indicating the method is not implemented.
 */
const DEFAULT_GET_CANDLES_FN = async (_symbol: string, _interval: CandleInterval, _since: Date, _limit: number): Promise<ICandleData[]> => {
  throw new Error(`getCandles is not implemented for this exchange`);
};

/**
 * Default implementation for formatQuantity.
 * Returns Bitcoin precision on Binance (8 decimal places).
 */
const DEFAULT_FORMAT_QUANTITY_FN = async (_symbol: string, quantity: number): Promise<string> => {
  return quantity.toFixed(8);
};

/**
 * Default implementation for formatPrice.
 * Returns Bitcoin precision on Binance (2 decimal places).
 */
const DEFAULT_FORMAT_PRICE_FN = async (_symbol: string, price: number): Promise<string> => {
  return price.toFixed(2);
};

/**
 * Default implementation for getOrderBook.
 * Throws an error indicating the method is not implemented.
 *
 * @param _symbol - Trading pair symbol (unused)
 * @param _from - Start of time range (unused - can be ignored in live implementations)
 * @param _to - End of time range (unused - can be ignored in live implementations)
 */
const DEFAULT_GET_ORDER_BOOK_FN = async (_symbol: string, _from: Date, _to: Date): Promise<IOrderBookData> => {
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
    const adjust = step * limit - step;

    if (!adjust) {
      throw new Error(
        `ExchangeInstance unknown time adjust for interval=${interval}`
      );
    }

    const when = new Date(Date.now());
    const since = new Date(when.getTime() - adjust * 60 * 1_000);

    let allData: ICandleData[] = [];

    // If limit exceeds CC_MAX_CANDLES_PER_REQUEST, fetch data in chunks
    if (limit > GLOBAL_CONFIG.CC_MAX_CANDLES_PER_REQUEST) {
      let remaining = limit;
      let currentSince = new Date(since.getTime());

      while (remaining > 0) {
        const chunkLimit = Math.min(remaining, GLOBAL_CONFIG.CC_MAX_CANDLES_PER_REQUEST);
        const chunkData = await getCandles(
          symbol,
          interval,
          currentSince,
          chunkLimit
        );

        allData.push(...chunkData);

        remaining -= chunkLimit;
        if (remaining > 0) {
          // Move currentSince forward by the number of candles fetched
          currentSince = new Date(
            currentSince.getTime() + chunkLimit * step * 60 * 1_000
          );
        }
      }
    } else {
      allData = await getCandles(symbol, interval, since, limit);
    }

    // Filter candles to strictly match the requested range
    const whenTimestamp = when.getTime();
    const sinceTimestamp = since.getTime();

    const filteredData = allData.filter(
      (candle) =>
        candle.timestamp >= sinceTimestamp && candle.timestamp <= whenTimestamp
    );

    if (filteredData.length < limit) {
      backtest.loggerService.warn(
        `ExchangeInstance Expected ${limit} candles, got ${filteredData.length}`
      );
    }

    return filteredData;
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
    return await this._methods.formatQuantity(symbol, quantity);
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
    return await this._methods.formatPrice(symbol, price);
  };

  /**
   * Fetch order book for a trading pair.
   *
   * Calculates time range using CC_ORDER_BOOK_TIME_OFFSET_MINUTES (default 10 minutes)
   * and passes it to the exchange schema implementation. The implementation may use
   * the time range (backtest) or ignore it (live trading).
   *
   * @param symbol - Trading pair symbol
   * @returns Promise resolving to order book data
   * @throws Error if getOrderBook is not implemented
   *
   * @example
   * ```typescript
   * const instance = new ExchangeInstance("binance");
   * const orderBook = await instance.getOrderBook("BTCUSDT");
   * console.log(orderBook.bids); // [{ price: "50000.00", quantity: "0.5" }, ...]
   * ```
   */
  public getOrderBook = async (symbol: string): Promise<IOrderBookData> => {
    backtest.loggerService.info(EXCHANGE_METHOD_NAME_GET_ORDER_BOOK, {
      exchangeName: this.exchangeName,
      symbol,
    });

    const to = new Date(Date.now());
    const from = new Date(to.getTime() - GLOBAL_CONFIG.CC_ORDER_BOOK_TIME_OFFSET_MINUTES * 60 * 1_000);
    return await this._methods.getOrderBook(symbol, from, to);
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
   * @returns Promise resolving to order book data
   */
  public getOrderBook = async (
    symbol: string,
    context: {
      exchangeName: ExchangeName;
    }
  ): Promise<IOrderBookData> => {
    backtest.exchangeValidationService.validate(context.exchangeName, EXCHANGE_METHOD_NAME_GET_ORDER_BOOK);

    const instance = this._getInstance(context.exchangeName);
    return await instance.getOrderBook(symbol);
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

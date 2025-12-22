import backtest from "../lib";
import { CandleInterval, ExchangeName, IExchangeSchema } from "../interfaces/Exchange.interface";
import { memoize } from "functools-kit";
import { GLOBAL_CONFIG } from "../config/params";

const EXCHANGE_METHOD_NAME_GET_CANDLES = "ExchangeUtils.getCandles";
const EXCHANGE_METHOD_NAME_GET_AVERAGE_PRICE = "ExchangeUtils.getAveragePrice";
const EXCHANGE_METHOD_NAME_FORMAT_QUANTITY = "ExchangeUtils.formatQuantity";
const EXCHANGE_METHOD_NAME_FORMAT_PRICE = "ExchangeUtils.formatPrice";

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
  /** Cached exchange schema retrieved once during construction */
  private _schema: IExchangeSchema;

  /**
   * Creates a new ExchangeInstance for a specific exchange.
   *
   * @param exchangeName - Exchange name (e.g., "binance")
   */
  constructor(readonly exchangeName: ExchangeName) {
    this._schema = backtest.exchangeSchemaService.get(this.exchangeName);
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
  
    const step = INTERVAL_MINUTES[interval];
    const adjust = step * limit - step;

    if (!adjust) {
      throw new Error(
        `ExchangeInstance unknown time adjust for interval=${interval}`
      );
    }

    const when = new Date(Date.now());
    const since = new Date(when.getTime() - adjust * 60 * 1_000);

    const data = await this._schema.getCandles(symbol, interval, since, limit);

    // Filter candles to strictly match the requested range
    const whenTimestamp = when.getTime();
    const sinceTimestamp = since.getTime();

    const filteredData = data.filter(
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
   * console.log(formatted); // "0.001"
   * ```
   */
  public formatQuantity = async (symbol: string, quantity: number): Promise<string> => {
    backtest.loggerService.info(EXCHANGE_METHOD_NAME_FORMAT_QUANTITY, {
      exchangeName: this.exchangeName,
      symbol,
      quantity,
    });
    return await this._schema.formatQuantity(symbol, quantity);
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
    return await this._schema.formatPrice(symbol, price);
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

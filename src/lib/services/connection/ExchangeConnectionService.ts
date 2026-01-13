import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import { TExecutionContextService } from "../context/ExecutionContextService";
import {
  CandleInterval,
  ExchangeName,
  ICandleData,
  IExchange,
  IOrderBookData,
} from "../../../interfaces/Exchange.interface";
import { memoize } from "functools-kit";
import ClientExchange from "../../../client/ClientExchange";
import ExchangeSchemaService from "../schema/ExchangeSchemaService";
import { TMethodContextService } from "../context/MethodContextService";

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
 */
const DEFAULT_GET_ORDER_BOOK_FN = async (_symbol: string, _from: Date, _to: Date): Promise<IOrderBookData> => {
  throw new Error(`getOrderBook is not implemented for this exchange`);
};

/**
 * Connection service routing exchange operations to correct ClientExchange instance.
 *
 * Routes all IExchange method calls to the appropriate exchange implementation
 * based on methodContextService.context.exchangeName. Uses memoization to cache
 * ClientExchange instances for performance.
 *
 * Key features:
 * - Automatic exchange routing via method context
 * - Memoized ClientExchange instances by exchangeName
 * - Implements full IExchange interface
 * - Logging for all operations
 *
 * @example
 * ```typescript
 * // Used internally by framework
 * const candles = await exchangeConnectionService.getCandles(
 *   "BTCUSDT", "1h", 100
 * );
 * // Automatically routes to correct exchange based on methodContext
 * ```
 */
export class ExchangeConnectionService implements IExchange {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly executionContextService = inject<TExecutionContextService>(
    TYPES.executionContextService
  );
  private readonly exchangeSchemaService = inject<ExchangeSchemaService>(
    TYPES.exchangeSchemaService
  );
  private readonly methodContextService = inject<TMethodContextService>(
    TYPES.methodContextService
  );

  /**
   * Retrieves memoized ClientExchange instance for given exchange name.
   *
   * Creates ClientExchange on first call, returns cached instance on subsequent calls.
   * Cache key is exchangeName string.
   *
   * @param exchangeName - Name of registered exchange schema
   * @returns Configured ClientExchange instance
   */
  public getExchange = memoize(
    ([exchangeName]) => `${exchangeName}`,
    (exchangeName: ExchangeName) => {
      const {
        getCandles = DEFAULT_GET_CANDLES_FN,
        formatPrice = DEFAULT_FORMAT_PRICE_FN,
        formatQuantity = DEFAULT_FORMAT_QUANTITY_FN,
        getOrderBook = DEFAULT_GET_ORDER_BOOK_FN,
        callbacks
      } = this.exchangeSchemaService.get(exchangeName);
      return new ClientExchange({
        execution: this.executionContextService,
        logger: this.loggerService,
        exchangeName,
        getCandles,
        formatPrice,
        formatQuantity,
        getOrderBook,
        callbacks,
      });
    }
  );

  /**
   * Fetches historical candles for symbol using configured exchange.
   *
   * Routes to exchange determined by methodContextService.context.exchangeName.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param interval - Candle interval (e.g., "1h", "1d")
   * @param limit - Maximum number of candles to fetch
   * @returns Promise resolving to array of candle data
   */
  public getCandles = async (
    symbol: string,
    interval: CandleInterval,
    limit: number
  ) => {
    this.loggerService.log("exchangeConnectionService getCandles", {
      symbol,
      interval,
      limit,
    });
    return await this.getExchange(
      this.methodContextService.context.exchangeName
    ).getCandles(symbol, interval, limit);
  };

  /**
   * Fetches next batch of candles relative to executionContext.when.
   *
   * Returns candles that come after the current execution timestamp.
   * Used for backtest progression and live trading updates.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param interval - Candle interval (e.g., "1h", "1d")
   * @param limit - Maximum number of candles to fetch
   * @returns Promise resolving to array of candle data
   */
  public getNextCandles = async (
    symbol: string,
    interval: CandleInterval,
    limit: number
  ): Promise<ICandleData[]> => {
    this.loggerService.log("exchangeConnectionService getNextCandles", {
      symbol,
      interval,
      limit,
    });
    return await this.getExchange(
      this.methodContextService.context.exchangeName
    ).getNextCandles(symbol, interval, limit);
  };

  /**
   * Retrieves current average price for symbol.
   *
   * In live mode: fetches real-time average price from exchange API.
   * In backtest mode: calculates VWAP from candles in current timeframe.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @returns Promise resolving to average price
   */
  public getAveragePrice = async (symbol: string) => {
    this.loggerService.log("exchangeConnectionService getAveragePrice", {
      symbol,
    });
    return await this.getExchange(
      this.methodContextService.context.exchangeName
    ).getAveragePrice(symbol);
  };

  /**
   * Formats price according to exchange-specific precision rules.
   *
   * Ensures price meets exchange requirements for decimal places and tick size.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param price - Raw price value to format
   * @returns Promise resolving to formatted price string
   */
  public formatPrice = async (symbol: string, price: number) => {
    this.loggerService.log("exchangeConnectionService getAveragePrice", {
      symbol,
      price,
    });
    return await this.getExchange(
      this.methodContextService.context.exchangeName
    ).formatPrice(symbol, price);
  };

  /**
   * Formats quantity according to exchange-specific precision rules.
   *
   * Ensures quantity meets exchange requirements for decimal places and lot size.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param quantity - Raw quantity value to format
   * @returns Promise resolving to formatted quantity string
   */
  public formatQuantity = async (symbol: string, quantity: number) => {
    this.loggerService.log("exchangeConnectionService getAveragePrice", {
      symbol,
      quantity,
    });
    return await this.getExchange(
      this.methodContextService.context.exchangeName
    ).formatQuantity(symbol, quantity);
  };

  /**
   * Fetches order book for a trading pair using configured exchange.
   *
   * Routes to exchange determined by methodContextService.context.exchangeName.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @returns Promise resolving to order book data
   */
  public getOrderBook = async (symbol: string): Promise<IOrderBookData> => {
    this.loggerService.log("exchangeConnectionService getOrderBook", {
      symbol,
    });
    return await this.getExchange(
      this.methodContextService.context.exchangeName
    ).getOrderBook(symbol);
  };
}

export default ExchangeConnectionService;

import { inject } from "../../core/di";
import { TLoggerService } from "../base/LoggerService";
import TYPES from "../../core/types";
import ExecutionContextService from "../context/ExecutionContextService";
import {
  CandleInterval,
  ExchangeName,
  IAggregatedTradeData,
  ICandleData,
  IExchange,
  IOrderBookData,
} from "../../../interfaces/Exchange.interface";
import ExchangeConnectionService from "../connection/ExchangeConnectionService";
import { TMethodContextService } from "../context/MethodContextService";
import MethodContextService from "../context/MethodContextService";
import ExchangeValidationService from "../validation/ExchangeValidationService";
import { memoize, singleshot } from "functools-kit";

const METHOD_NAME_VALIDATE = "exchangeCoreService validate";

/**
 * Creates a unique key for memoizing validate calls.
 * Key format: "exchangeName"
 * @param exchangeName - Exchange name
 * @returns Unique string key for memoization
 */
const CREATE_KEY_FN = (exchangeName: ExchangeName): string => {
  return exchangeName;
};

/**
 * Type definition for exchange methods.
 * Maps all keys of IExchange to any type.
 * Used for dynamic method routing in ExchangeCoreService.
 */
type TExchange = {
  [key in keyof IExchange]: any;
};

/**
 * Global service for exchange operations with execution context injection.
 *
 * Wraps ExchangeConnectionService with ExecutionContextService to inject
 * symbol, when, and backtest parameters into the execution context.
 *
 * Used internally by BacktestLogicPrivateService and LiveLogicPrivateService.
 */
export class ExchangeCoreService implements TExchange {
  private readonly loggerService = inject<TLoggerService>(TYPES.loggerService);
  private readonly exchangeConnectionService =
    inject<ExchangeConnectionService>(TYPES.exchangeConnectionService);
  private readonly methodContextService = inject<TMethodContextService>(
    TYPES.methodContextService
  );
  private readonly exchangeValidationService =
    inject<ExchangeValidationService>(TYPES.exchangeValidationService);

  /**
   * Validates exchange configuration.
   * Memoized to avoid redundant validations for the same exchange.
   * Logs validation activity.
   * @param exchangeName - Name of the exchange to validate
   * @returns Promise that resolves when validation is complete
   */
  private validate = memoize(
    ([exchangeName]) => CREATE_KEY_FN(exchangeName),
    async (exchangeName: ExchangeName) => {
      this.loggerService.log(METHOD_NAME_VALIDATE, {
        exchangeName,
      });
      this.exchangeValidationService.validate(
        exchangeName,
        METHOD_NAME_VALIDATE
      );
    }
  );

  /**
   * Fetches historical candles with execution context.
   *
   * @param symbol - Trading pair symbol
   * @param interval - Candle interval (e.g., "1m", "1h")
   * @param limit - Maximum number of candles to fetch
   * @param when - Timestamp for context (used in backtest mode)
   * @param backtest - Whether running in backtest mode
   * @returns Promise resolving to array of candles
   */
  public getCandles = async (
    symbol: string,
    interval: CandleInterval,
    limit: number,
    when: Date,
    backtest: boolean
  ) => {
    this.loggerService.log("exchangeCoreService getCandles", {
      symbol,
      interval,
      limit,
      when,
      backtest,
    });
    if (!MethodContextService.hasContext()) {
      throw new Error("exchangeCoreService getCandles requires a method context");
    }
    await this.validate(this.methodContextService.context.exchangeName);
    return await ExecutionContextService.runInContext(
      async () => {
        return await this.exchangeConnectionService.getCandles(
          symbol,
          interval,
          limit
        );
      },
      {
        symbol,
        when,
        backtest,
      }
    );
  };

  /**
   * Fetches future candles (backtest mode only) with execution context.
   *
   * @param symbol - Trading pair symbol
   * @param interval - Candle interval
   * @param limit - Maximum number of candles to fetch
   * @param when - Timestamp for context
   * @param backtest - Whether running in backtest mode (must be true)
   * @returns Promise resolving to array of future candles
   */
  public getNextCandles = async (
    symbol: string,
    interval: CandleInterval,
    limit: number,
    when: Date,
    backtest: boolean
  ) => {
    this.loggerService.log("exchangeCoreService getNextCandles", {
      symbol,
      interval,
      limit,
      when,
      backtest,
    });
    if (!MethodContextService.hasContext()) {
      throw new Error("exchangeCoreService getNextCandles requires a method context");
    }
    await this.validate(this.methodContextService.context.exchangeName);
    return await ExecutionContextService.runInContext(
      async () => {
        return await this.exchangeConnectionService.getNextCandles(
          symbol,
          interval,
          limit
        );
      },
      {
        symbol,
        when,
        backtest,
      }
    );
  };

  /**
   * Calculates VWAP with execution context.
   *
   * @param symbol - Trading pair symbol
   * @param when - Timestamp for context
   * @param backtest - Whether running in backtest mode
   * @returns Promise resolving to VWAP price
   */
  public getAveragePrice = async (
    symbol: string,
    when: Date,
    backtest: boolean
  ) => {
    this.loggerService.log("exchangeCoreService getAveragePrice", {
      symbol,
      when,
      backtest,
    });
    if (!MethodContextService.hasContext()) {
      throw new Error("exchangeCoreService getAveragePrice requires a method context");
    }
    await this.validate(this.methodContextService.context.exchangeName);
    return await ExecutionContextService.runInContext(
      async () => {
        return await this.exchangeConnectionService.getAveragePrice(symbol);
      },
      {
        symbol,
        when,
        backtest,
      }
    );
  };

  /**
   * Formats price with execution context.
   *
   * @param symbol - Trading pair symbol
   * @param price - Price to format
   * @param when - Timestamp for context
   * @param backtest - Whether running in backtest mode
   * @returns Promise resolving to formatted price string
   */
  public formatPrice = async (
    symbol: string,
    price: number,
    when: Date,
    backtest: boolean
  ) => {
    this.loggerService.log("exchangeCoreService formatPrice", {
      symbol,
      price,
      when,
      backtest,
    });
    if (!MethodContextService.hasContext()) {
      throw new Error("exchangeCoreService formatPrice requires a method context");
    }
    await this.validate(this.methodContextService.context.exchangeName);
    return await ExecutionContextService.runInContext(
      async () => {
        return await this.exchangeConnectionService.formatPrice(symbol, price);
      },
      {
        symbol,
        when,
        backtest,
      }
    );
  };

  /**
   * Formats quantity with execution context.
   *
   * @param symbol - Trading pair symbol
   * @param quantity - Quantity to format
   * @param when - Timestamp for context
   * @param backtest - Whether running in backtest mode
   * @returns Promise resolving to formatted quantity string
   */
  public formatQuantity = async (
    symbol: string,
    quantity: number,
    when: Date,
    backtest: boolean
  ) => {
    this.loggerService.log("exchangeCoreService formatQuantity", {
      symbol,
      quantity,
      when,
      backtest,
    });
    if (!MethodContextService.hasContext()) {
      throw new Error("exchangeCoreService formatQuantity requires a method context");
    }
    await this.validate(this.methodContextService.context.exchangeName);
    return await ExecutionContextService.runInContext(
      async () => {
        return await this.exchangeConnectionService.formatQuantity(
          symbol,
          quantity
        );
      },
      {
        symbol,
        when,
        backtest,
      }
    );
  };

  /**
   * Fetches order book with execution context.
   *
   * Sets up execution context with the provided when/backtest parameters.
   * The exchange implementation will receive time range parameters but may
   * choose to use them (backtest) or ignore them (live).
   *
   * @param symbol - Trading pair symbol
   * @param when - Timestamp for context
   * @param backtest - Whether running in backtest mode
   * @param depth - Maximum depth levels (default: CC_ORDER_BOOK_MAX_DEPTH_LEVELS)
   * @returns Promise resolving to order book data
   */
  public getOrderBook = async (
    symbol: string,
    when: Date,
    backtest: boolean,
    depth?: number
  ): Promise<IOrderBookData> => {
    this.loggerService.log("exchangeCoreService getOrderBook", {
      symbol,
      when,
      backtest,
      depth,
    });
    if (!MethodContextService.hasContext()) {
      throw new Error("exchangeCoreService getOrderBook requires a method context");
    }
    await this.validate(this.methodContextService.context.exchangeName);
    return await ExecutionContextService.runInContext(
      async () => {
        return await this.exchangeConnectionService.getOrderBook(symbol, depth);
      },
      {
        symbol,
        when,
        backtest,
      }
    );
  };

  /**
   * Fetches aggregated trades with execution context.
   *
   * @param symbol - Trading pair symbol
   * @param when - Timestamp for context (used in backtest mode)
   * @param backtest - Whether running in backtest mode
   * @param limit - Optional maximum number of trades to fetch
   * @returns Promise resolving to array of aggregated trade data
   */
  public getAggregatedTrades = async (
    symbol: string,
    when: Date,
    backtest: boolean,
    limit?: number
  ): Promise<IAggregatedTradeData[]> => {
    this.loggerService.log("exchangeCoreService getAggregatedTrades", {
      symbol,
      when,
      backtest,
      limit,
    });
    if (!MethodContextService.hasContext()) {
      throw new Error("exchangeCoreService getAggregatedTrades requires a method context");
    }
    await this.validate(this.methodContextService.context.exchangeName);
    return await ExecutionContextService.runInContext(
      async () => {
        return await this.exchangeConnectionService.getAggregatedTrades(symbol, limit);
      },
      {
        symbol,
        when,
        backtest,
      }
    );
  };

  /**
   * Fetches raw candles with flexible date/limit parameters and execution context.
   *
   * @param symbol - Trading pair symbol
   * @param interval - Candle interval (e.g., "1m", "1h")
   * @param when - Timestamp for context (used in backtest mode)
   * @param backtest - Whether running in backtest mode
   * @param limit - Optional number of candles to fetch
   * @param sDate - Optional start date in milliseconds
   * @param eDate - Optional end date in milliseconds
   * @returns Promise resolving to array of candles
   */
  public getRawCandles = async (
    symbol: string,
    interval: CandleInterval,
    when: Date,
    backtest: boolean,
    limit?: number,
    sDate?: number,
    eDate?: number
  ): Promise<ICandleData[]> => {
    this.loggerService.log("exchangeCoreService getRawCandles", {
      symbol,
      interval,
      when,
      backtest,
      limit,
      sDate,
      eDate,
    });
    if (!MethodContextService.hasContext()) {
      throw new Error("exchangeCoreService getRawCandles requires a method context");
    }
    await this.validate(this.methodContextService.context.exchangeName);
    return await ExecutionContextService.runInContext(
      async () => {
        return await this.exchangeConnectionService.getRawCandles(
          symbol,
          interval,
          limit,
          sDate,
          eDate
        );
      },
      {
        symbol,
        when,
        backtest,
      }
    );
  };
}

export default ExchangeCoreService;

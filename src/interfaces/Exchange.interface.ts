import { TExecutionContextService } from "../lib/services/context/ExecutionContextService";
import { ILogger } from "./Logger.interface";

/**
 * Candle time interval for fetching historical data.
 */
export type CandleInterval =
  | "1m"
  | "3m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "2h"
  | "4h"
  | "6h"
  | "8h";

/**
 * Single OHLCV candle data point.
 * Used for VWAP calculation and backtesting.
 */
export interface ICandleData {
  /** Unix timestamp in milliseconds when candle opened */
  timestamp: number;
  /** Opening price at candle start */
  open: number;
  /** Highest price during candle period */
  high: number;
  /** Lowest price during candle period */
  low: number;
  /** Closing price at candle end */
  close: number;
  /** Trading volume during candle period */
  volume: number;
}

/**
 * Single bid or ask in order book.
 */
export interface IBidData {
  /** Price level as string */
  price: string;
  /** Quantity at this price level as string */
  quantity: string;
}

/**
 * Order book data containing bids and asks.
 */
export interface IOrderBookData {
  /** Trading pair symbol */
  symbol: string;
  /** Array of bid orders (buy orders) */
  bids: IBidData[];
  /** Array of ask orders (sell orders) */
  asks: IBidData[];
}

/**
 * Exchange parameters passed to ClientExchange constructor.
 * Combines schema with runtime dependencies.
 * Note: All exchange methods are required in params (defaults are applied during initialization).
 */
export interface IExchangeParams extends IExchangeSchema {
  /** Logger service for debug output */
  logger: ILogger;
  /** Execution context service (symbol, when, backtest flag) */
  execution: TExecutionContextService;
  /** Fetch candles from data source (required, defaults applied) */
  getCandles: (symbol: string, interval: CandleInterval, since: Date, limit: number, backtest: boolean) => Promise<ICandleData[]>;
  /** Format quantity according to exchange precision rules (required, defaults applied) */
  formatQuantity: (symbol: string, quantity: number, backtest: boolean) => Promise<string>;
  /** Format price according to exchange precision rules (required, defaults applied) */
  formatPrice: (symbol: string, price: number, backtest: boolean) => Promise<string>;
  /** Fetch order book for a trading pair (required, defaults applied) */
  getOrderBook: (symbol: string, depth: number, from: Date, to: Date, backtest: boolean) => Promise<IOrderBookData>;
}

/**
 * Optional callbacks for exchange data events.
 */
export interface IExchangeCallbacks {
  /** Called when candle data is fetched */
  onCandleData: (
    symbol: string,
    interval: CandleInterval,
    since: Date,
    limit: number,
    data: ICandleData[]
  ) => void | Promise<void>;
}

/**
 * Exchange schema registered via addExchange().
 * Defines candle data source and formatting logic.
 */
export interface IExchangeSchema {
  /** Unique exchange identifier for registration */
  exchangeName: ExchangeName;
  /** Optional developer note for documentation */
  note?: string;
  /**
   * Fetch candles from data source (API or database).
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param interval - Candle time interval (e.g., "1m", "1h")
   * @param since - Start date for candle fetching
   * @param limit - Maximum number of candles to fetch
   * @param backtest - Whether running in backtest mode
   * @returns Promise resolving to array of OHLCV candle data
   */
  getCandles: (
    symbol: string,
    interval: CandleInterval,
    since: Date,
    limit: number,
    backtest: boolean
  ) => Promise<ICandleData[]>;
  /**
   * Format quantity according to exchange precision rules.
   *
   * Optional. If not provided, defaults to Bitcoin precision on Binance (8 decimal places).
   *
   * @param symbol - Trading pair symbol
   * @param quantity - Raw quantity value
   * @param backtest - Whether running in backtest mode
   * @returns Promise resolving to formatted quantity string
   */
  formatQuantity?: (symbol: string, quantity: number, backtest: boolean) => Promise<string>;
  /**
   * Format price according to exchange precision rules.
   *
   * Optional. If not provided, defaults to Bitcoin precision on Binance (2 decimal places).
   *
   * @param symbol - Trading pair symbol
   * @param price - Raw price value
   * @param backtest - Whether running in backtest mode
   * @returns Promise resolving to formatted price string
   */
  formatPrice?: (symbol: string, price: number, backtest: boolean) => Promise<string>;
  /**
   * Fetch order book for a trading pair.
   *
   * Optional. If not provided, throws an error when called.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param depth - Maximum depth levels for both bids and asks (default: CC_ORDER_BOOK_MAX_DEPTH_LEVELS)
   * @param from - Start of time range (used in backtest for historical data, can be ignored in live)
   * @param to - End of time range (used in backtest for historical data, can be ignored in live)
   * @param backtest - Whether running in backtest mode
   * @returns Promise resolving to order book data
   *
   * @example
   * ```typescript
   * // Backtest implementation: returns historical order book for the time range
   * const backtestOrderBook = async (symbol: string, depth: number, from: Date, to: Date, backtest: boolean) => {
   *   if (backtest) {
   *     return await database.getOrderBookSnapshot(symbol, depth, from, to);
   *   }
   *   return await exchange.fetchOrderBook(symbol, depth);
   * };
   *
   * // Live implementation: ignores from/to when not in backtest mode
   * const liveOrderBook = async (symbol: string, depth: number, _from: Date, _to: Date, backtest: boolean) => {
   *   return await exchange.fetchOrderBook(symbol, depth);
   * };
   * ```
   */
  getOrderBook?: (symbol: string, depth: number, from: Date, to: Date, backtest: boolean) => Promise<IOrderBookData>;
  /** Optional lifecycle event callbacks (onCandleData) */
  callbacks?: Partial<IExchangeCallbacks>;
}

/**
 * Exchange interface implemented by ClientExchange.
 * Provides candle data access and VWAP calculation.
 */
export interface IExchange {
  /**
   * Fetch historical candles backwards from execution context time.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param interval - Candle time interval (e.g., "1m", "1h")
   * @param limit - Maximum number of candles to fetch
   * @returns Promise resolving to array of candle data
   */
  getCandles: (
    symbol: string,
    interval: CandleInterval,
    limit: number
  ) => Promise<ICandleData[]>;

  /**
   * Fetch future candles forward from execution context time (for backtest).
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param interval - Candle time interval (e.g., "1m", "1h")
   * @param limit - Maximum number of candles to fetch
   * @returns Promise resolving to array of candle data
   */
  getNextCandles: (
    symbol: string,
    interval: CandleInterval,
    limit: number
  ) => Promise<ICandleData[]>;

  /**
   * Format quantity for exchange precision.
   *
   * @param symbol - Trading pair symbol
   * @param quantity - Raw quantity value
   * @returns Promise resolving to formatted quantity string
   */
  formatQuantity: (symbol: string, quantity: number) => Promise<string>;

  /**
   * Format price for exchange precision.
   *
   * @param symbol - Trading pair symbol
   * @param price - Raw price value
   * @returns Promise resolving to formatted price string
   */
  formatPrice: (symbol: string, price: number) => Promise<string>;

  /**
   * Calculate VWAP from last 5 1-minute candles.
   *
   * Formula: VWAP = Σ(Typical Price × Volume) / Σ(Volume)
   * where Typical Price = (High + Low + Close) / 3
   *
   * @param symbol - Trading pair symbol
   * @returns Promise resolving to volume-weighted average price
   */
  getAveragePrice: (symbol: string) => Promise<number>;

  /**
   * Fetch order book for a trading pair.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param depth - Maximum depth levels (default: CC_ORDER_BOOK_MAX_DEPTH_LEVELS)
   * @returns Promise resolving to order book data
   */
  getOrderBook: (symbol: string, depth?: number) => Promise<IOrderBookData>;
}

/**
 * Unique exchange identifier.
 */
export type ExchangeName = string;

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
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Exchange parameters passed to ClientExchange constructor.
 * Combines schema with runtime dependencies.
 */
export interface IExchangeParams extends IExchangeSchema {
  logger: ILogger;
  execution: TExecutionContextService;
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
  ) => void;
}

/**
 * Exchange schema registered via addExchange().
 * Defines candle data source and formatting logic.
 */
export interface IExchangeSchema {
  exchangeName: ExchangeName;
  getCandles: (
    symbol: string,
    interval: CandleInterval,
    since: Date,
    limit: number
  ) => Promise<ICandleData[]>;
  formatQuantity: (symbol: string, quantity: number) => Promise<string>;
  formatPrice: (symbol: string, price: number) => Promise<string>;
  callbacks?: Partial<IExchangeCallbacks>;
}

/**
 * Exchange interface implemented by ClientExchange.
 * Provides candle data access and VWAP calculation.
 */
export interface IExchange {
  /** Fetch historical candles backwards from execution context time */
  getCandles: (
    symbol: string,
    interval: CandleInterval,
    limit: number
  ) => Promise<ICandleData[]>;
  /** Fetch future candles forward from execution context time (for backtest) */
  getNextCandles: (
    symbol: string,
    interval: CandleInterval,
    limit: number
  ) => Promise<ICandleData[]>;
  /** Format quantity for exchange precision */
  formatQuantity: (symbol: string, quantity: number) => Promise<string>;
  /** Format price for exchange precision */
  formatPrice: (symbol: string, price: number) => Promise<string>;
  /** Calculate VWAP from last 5 1m candles */
  getAveragePrice: (symbol: string) => Promise<number>;
}

/**
 * Unique exchange identifier.
 */
export type ExchangeName = string;

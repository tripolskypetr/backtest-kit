import { TExecutionContextService } from "../lib/services/context/ExecutionContextService";
import { ILogger } from "./Logger.interface";

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

export interface ICandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IExchangeParams extends IExchangeSchema {
  logger: ILogger;
  execution: TExecutionContextService;
}

export interface IExchangeCallbacks {
  onCandleData: (
    symbol: string,
    interval: CandleInterval,
    since: Date,
    limit: number,
    data: ICandleData[]
  ) => void;
}

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

export interface IExchange {
  getCandles: (
    symbol: string,
    interval: CandleInterval,
    limit: number
  ) => Promise<ICandleData[]>;
  getNextCandles: (
    symbol: string,
    interval: CandleInterval,
    limit: number
  ) => Promise<ICandleData[]>;
  formatQuantity: (symbol: string, quantity: number) => Promise<string>;
  formatPrice: (symbol: string, price: number) => Promise<string>;
  getAveragePrice: (symbol: string) => Promise<number>;
}

export type ExchangeName = string;

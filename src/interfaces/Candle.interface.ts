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

export interface ICandleParams extends ICandleSchema {
  logger: ILogger;
  execution: TExecutionContextService;
}

export interface ICandleCallbacks {
  onCandleData: (
    symbol: string,
    interval: CandleInterval,
    since: Date,
    limit: number,
    data: ICandleData[]
  ) => void;
}

export interface ICandleSchema {
  getCandles: (
    symbol: string,
    interval: CandleInterval,
    since: Date,
    limit: number
  ) => Promise<ICandleData[]>;
  callbacks?: Partial<ICandleCallbacks>;
}

export interface ICandle {
  getCandles: (
    symbol: string,
    interval: CandleInterval,
    limit: number
  ) => Promise<ICandleData[]>;
  getAveragePrice: (symbol: string) => Promise<number>;
}

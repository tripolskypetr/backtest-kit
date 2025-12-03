import { ILogger } from "./Logger.interface";
import { ISignalRow } from "./Strategy.interface";

export type PartialLevel = 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90 | 100;

export interface IPartialState {
  profitLevels: Set<PartialLevel>;
  lossLevels: Set<PartialLevel>;
}

export interface IPartialData {
  profitLevels: PartialLevel[];
  lossLevels: PartialLevel[];
}

export interface IPartialParams {
  logger: ILogger;
  onProfit: (
    symbol: string,
    data: ISignalRow,
    currentPrice: number,
    level: PartialLevel,
    backtest: boolean,
    timestamp: number
  ) => void;
  onLoss: (
    symbol: string,
    data: ISignalRow,
    currentPrice: number,
    level: PartialLevel,
    backtest: boolean,
    timestamp: number
  ) => void;
}

export interface IPartial {
  profit(
    symbol: string,
    data: ISignalRow,
    currentPrice: number,
    revenuePercent: number,
    backtest: boolean,
    when: Date
  ): Promise<void>;
  loss(
    symbol: string,
    data: ISignalRow,
    currentPrice: number,
    lossPercent: number,
    backtest: boolean,
    when: Date
  ): Promise<void>;
  clear(symbol: string, data: ISignalRow, priceClose: number): Promise<void>;
}

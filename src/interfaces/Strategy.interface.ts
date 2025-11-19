import { TExecutionContextService } from "../lib/services/context/ExecutionContextService";
import { ICandle } from "./Candle.interface";
import { ILogger } from "./Logger.interface";

export interface ISignalData {
  id: string;
  position: "long" | "short";
  note: string;
  priceOpen: number;
  priceTakeProfit: number;
  priceStopLoss: number;
  minuteEstimatedTime: number;
  timestamp: number;
}

export interface IStrategyParams extends IStrategySchema {
  symbol: string;
  logger: ILogger;
  candle: ICandle;
  execution: TExecutionContextService;
}

export interface IStrategyCallbacks {
  onOpen: (backtest: boolean, symbol: string, data: ISignalData) => void;
  onClose: (
    backtest: boolean,
    symbol: string,
    priceClose: number,
    data: ISignalData
  ) => void;
}

export interface IStrategySchema {
  getSignal: (symbol: string) => Promise<ISignalData | null>;
  callbacks?: Partial<IStrategyCallbacks>;
}

export type StrategyCloseReason = "time_expired" | "take_profit" | "stop_loss";

export interface IStrategyPnL {
  pnlPercentage: number;
  priceOpen: number;
  priceClose: number;
}

export interface IStrategyTickResultIdle {
  action: "idle";
  signal: null;
}

export interface IStrategyTickResultOpened {
  action: "opened";
  signal: ISignalData;
}

export interface IStrategyTickResultActive {
  action: "active";
  signal: ISignalData;
  currentPrice: number;
}

export interface IStrategyTickResultClosed {
  action: "closed";
  signal: ISignalData;
  currentPrice: number;
  closeReason: StrategyCloseReason;
  pnl: IStrategyPnL;
}

export type IStrategyTickResult =
  | IStrategyTickResultIdle
  | IStrategyTickResultOpened
  | IStrategyTickResultActive
  | IStrategyTickResultClosed;

export interface IStrategy {
  tick: (symbol: string) => Promise<IStrategyTickResult>;
}

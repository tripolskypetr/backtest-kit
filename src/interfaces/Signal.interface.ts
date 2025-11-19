import { TExecutionContextService } from "../lib/services/context/ExecutionContextService";
import { ICandle } from "./Candle.interface";
import { ILogger } from "./Logger.interface";

export interface ISignalData {
  id: string;
  position: "long" | "short";
  priceOpen: number;
  priceTakeProfit: number;
  priceStopLoss: number;
  minuteEstimatedTime: number;
  timestamp: number;
}

export interface ISignalParams extends ISignalSchema {
  logger: ILogger;
  candle: ICandle;
  execution: TExecutionContextService;
}

export interface ISignalCallbacks {
  onOpen: (backtest: boolean, symbol: string, data: ISignalData) => void;
  onClose: (
    backtest: boolean,
    symbol: string,
    priceClose: number,
    data: ISignalData
  ) => void;
}

export interface ISignalSchema {
  symbol: string;
  getSignal: (symbol: string) => Promise<ISignalData | null>;
  callbacks?: Partial<ISignalCallbacks>;
}

export type SignalCloseReason = "time_expired" | "take_profit" | "stop_loss";

export interface ISignalPnL {
  pnlPercentage: number;
  priceOpen: number;
  priceClose: number;
}

export interface ISignalTickResultIdle {
  action: "idle";
  signal: null;
}

export interface ISignalTickResultOpened {
  action: "opened";
  signal: ISignalData;
}

export interface ISignalTickResultActive {
  action: "active";
  signal: ISignalData;
  currentPrice: number;
}

export interface ISignalTickResultClosed {
  action: "closed";
  signal: ISignalData;
  currentPrice: number;
  closeReason: SignalCloseReason;
  pnl: ISignalPnL;
}

export type ISignalTickResult =
  | ISignalTickResultIdle
  | ISignalTickResultOpened
  | ISignalTickResultActive
  | ISignalTickResultClosed;

export interface ISignal {
  tick: (symbol: string) => Promise<ISignalTickResult>;
}

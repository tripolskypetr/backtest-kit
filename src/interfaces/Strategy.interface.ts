import { TExecutionContextService } from "../lib/services/context/ExecutionContextService";
import { ExchangeName, IExchange, ICandleData } from "./Exchange.interface";
import { ILogger } from "./Logger.interface";

export interface ISignalDto {
  position: "long" | "short";
  note: string;
  priceOpen: number;
  priceTakeProfit: number;
  priceStopLoss: number;
  minuteEstimatedTime: number;
  timestamp: number;
}

export interface ISignalRow extends ISignalDto {
  id: string;
}

export interface IStrategyParams extends IStrategySchema {
  logger: ILogger;
  exchange: IExchange;
  execution: TExecutionContextService;
}

export interface IStrategyCallbacks {
  onOpen: (backtest: boolean, symbol: string, data: ISignalRow) => void;
  onClose: (
    backtest: boolean,
    symbol: string,
    priceClose: number,
    data: ISignalRow
  ) => void;
}

export interface IStrategySchema {
  strategyName: StrategyName;
  exchangeName: ExchangeName;
  getSignal: (symbol: string) => Promise<ISignalDto | null>;
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
  signal: ISignalRow;
}

export interface IStrategyTickResultActive {
  action: "active";
  signal: ISignalRow;
  currentPrice: number;
}

export interface IStrategyTickResultClosed {
  action: "closed";
  signal: ISignalRow;
  currentPrice: number;
  closeReason: StrategyCloseReason;
  pnl: IStrategyPnL;
}

export type IStrategyTickResult =
  | IStrategyTickResultIdle
  | IStrategyTickResultOpened
  | IStrategyTickResultActive
  | IStrategyTickResultClosed;

export type IStrategyBacktestResult =
  | IStrategyTickResultActive
  | IStrategyTickResultClosed;

export interface IStrategy {
  tick: (symbol: string) => Promise<IStrategyTickResult>;
  backtest: (candles: ICandleData[]) => Promise<IStrategyBacktestResult>;
}

export type StrategyName = string;

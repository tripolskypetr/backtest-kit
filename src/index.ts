export { setLogger } from "./function/setup";
export { addExchange, addStrategy, addFrame } from "./function/add";
export { runBacktest, runBacktestGUI } from "./function/backtest";
export { reduce } from "./function/reduce";
export { startRun, stopRun, stopAll } from "./function/run";
export {
  getCandles,
  getAveragePrice,
  getDate,
  getMode,
  formatPrice,
  formatQuantity,
} from "./function/exchange";

export {
  CandleInterval,
  ICandleData,
  IExchangeSchema,
} from "./interfaces/Exchange.interface";

export {
  SignalInterval,
  ISignalDto,
  ISignalRow,
  IStrategySchema,
  IStrategyTickResult,
  IStrategyTickResultActive,
  IStrategyTickResultClosed,
  IStrategyTickResultIdle,
  IStrategyTickResultOpened,
  IStrategyPnL,
} from "./interfaces/Strategy.interface";

export { FrameInterval, IFrameSchema } from "./interfaces/Frame.interface";

export { ExecutionContextService } from "./lib/services/context/ExecutionContextService";
export { MethodContextService } from "./lib/services/context/MethodContextService";

export {
  PersistBase,
  TPersistBase,
  IPersistBase,
  TPersistBaseCtor,
  PersistSignalAdaper,
} from "./classes/Persist";

export { Backtest } from "./classes/Backtest";
export { Live } from "./classes/Live";

export { backtest as lib } from "./lib";

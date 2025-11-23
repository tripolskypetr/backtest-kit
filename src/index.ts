export { setLogger } from "./function/setup";
export { addExchange, addStrategy, addFrame } from "./function/add";
export { listExchanges, listStrategies, listFrames } from "./function/list";
export {
  listenSignal,
  listenSignalOnce,
  listenSignalBacktest,
  listenSignalBacktestOnce,
  listenSignalLive,
  listenSignalLiveOnce,
  listenError,
  listenDone,
  listenDoneOnce,
  listenProgress,
  listenPerformance,
} from "./function/event";
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

export { DoneContract } from "./contract/Done.contract";
export { ProgressContract } from "./contract/Progress.contract";
export { PerformanceContract, PerformanceMetricType } from "./contract/Performance.contract";

export type { BacktestStatistics } from "./lib/services/markdown/BacktestMarkdownService";
export type { LiveStatistics } from "./lib/services/markdown/LiveMarkdownService";
export type { PerformanceStatistics } from "./lib/services/markdown/PerformanceMarkdownService";

export { ExecutionContextService } from "./lib/services/context/ExecutionContextService";
export { MethodContextService } from "./lib/services/context/MethodContextService";

export {
  SignalData,
  EntityId,
  PersistBase,
  TPersistBase,
  IPersistBase,
  TPersistBaseCtor,
  PersistSignalAdaper,
} from "./classes/Persist";

export { Backtest } from "./classes/Backtest";
export { Live } from "./classes/Live";
export { Performance } from "./classes/Performance";

export { backtest as lib } from "./lib";

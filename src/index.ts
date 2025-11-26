export { setLogger } from "./function/setup";
export { addExchange, addStrategy, addFrame, addWalker, addSizing, addRisk } from "./function/add";
export { listExchanges, listStrategies, listFrames, listWalkers, listSizings, listRisks } from "./function/list";
export {
  listenSignal,
  listenSignalOnce,
  listenSignalBacktest,
  listenSignalBacktestOnce,
  listenSignalLive,
  listenSignalLiveOnce,
  listenError,
  listenDoneLive,
  listenDoneLiveOnce,
  listenDoneBacktest,
  listenDoneBacktestOnce,
  listenDoneWalker,
  listenDoneWalkerOnce,
  listenProgress,
  listenPerformance,
  listenWalker,
  listenWalkerOnce,
  listenWalkerComplete,
  listenValidation,
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

export {
  ISizingSchema,
  ISizingSchemaFixedPercentage,
  ISizingSchemaKelly,
  ISizingSchemaATR,
  ISizingCalculateParams,
  ISizingCalculateParamsFixedPercentage,
  ISizingCalculateParamsKelly,
  ISizingCalculateParamsATR,
  IPositionSizeFixedPercentageParams,
  IPositionSizeKellyParams,
  IPositionSizeATRParams,
} from "./interfaces/Sizing.interface";

export {
  IRiskSchema,
  IRiskCheckArgs,
  IRiskValidation,
  IRiskValidationFn,
  IRiskActivePosition,
  IRiskValidationPayload,
} from "./interfaces/Risk.interface";

export {
  WalkerMetric,
  IWalkerSchema,
  IWalkerResults,
  IWalkerStrategyResult,
} from "./interfaces/Walker.interface";

export {
  IHeatmapRow,
  IHeatmapStatistics,
} from "./interfaces/Heatmap.interface";

export { DoneContract } from "./contract/Done.contract";
export { ProgressContract } from "./contract/Progress.contract";
export { PerformanceContract, PerformanceMetricType } from "./contract/Performance.contract";

export type { BacktestStatistics } from "./lib/services/markdown/BacktestMarkdownService";
export type { LiveStatistics } from "./lib/services/markdown/LiveMarkdownService";
export type { PerformanceStatistics } from "./lib/services/markdown/PerformanceMarkdownService";
export type { WalkerStatistics } from "./lib/services/markdown/WalkerMarkdownService";

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
export { Walker } from "./classes/Walker";
export { Heat } from "./classes/Heat";
export { PositionSize } from "./classes/PositionSize";

export * as emitters from "./config/emitters";

export { backtest as lib } from "./lib";

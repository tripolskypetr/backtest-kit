export { setLogger, setConfig } from "./function/setup";
export {
  addExchange,
  addStrategy,
  addFrame,
  addWalker,
  addSizing,
  addRisk,
  addOptimizer,
} from "./function/add";
export {
  listExchanges,
  listStrategies,
  listFrames,
  listWalkers,
  listSizings,
  listRisks,
  listOptimizers,
} from "./function/list";
export {
  listenSignal,
  listenSignalOnce,
  listenSignalBacktest,
  listenSignalBacktestOnce,
  listenSignalLive,
  listenSignalLiveOnce,
  listenError,
  listenExit,
  listenDoneLive,
  listenDoneLiveOnce,
  listenDoneBacktest,
  listenDoneBacktestOnce,
  listenDoneWalker,
  listenDoneWalkerOnce,
  listenBacktestProgress,
  listenPerformance,
  listenWalker,
  listenWalkerOnce,
  listenWalkerComplete,
  listenValidation,
  listenPartialLoss,
  listenPartialLossOnce,
  listenPartialProfit,
  listenPartialProfitOnce,
  listenWalkerProgress,
  listenOptimizerProgress,
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
  IScheduledSignalRow,
  IStrategySchema,
  IStrategyTickResult,
  IStrategyTickResultActive,
  IStrategyTickResultClosed,
  IStrategyTickResultIdle,
  IStrategyTickResultOpened,
  IStrategyTickResultScheduled,
  IStrategyTickResultCancelled,
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

export {
  IOptimizerCallbacks,
  IOptimizerData,
  IOptimizerFetchArgs,
  IOptimizerFilterArgs,
  IOptimizerRange,
  IOptimizerSchema,
  IOptimizerSource,
  IOptimizerStrategy,
  IOptimizerTemplate,
} from "./interfaces/Optimizer.interface"

export { MessageModel, MessageRole } from "./model/Message.model";

export { PartialLossContract } from "./contract/PartialLoss.contract";
export { PartialProfitContract } from "./contract/PartialProfit.contract";
export { WalkerContract } from "./contract/Walker.contract";
export { ProgressWalkerContract } from "./contract/ProgressWalker.contract";
export { ProgressOptimizerContract } from "./contract/ProgressOptimizer.contract";
export { DoneContract } from "./contract/Done.contract";
export { ProgressBacktestContract } from "./contract/ProgressBacktest.contract";
export {
  PerformanceContract,
  PerformanceMetricType,
} from "./contract/Performance.contract";

export type { BacktestStatistics } from "./lib/services/markdown/BacktestMarkdownService";
export type { LiveStatistics } from "./lib/services/markdown/LiveMarkdownService";
export type { ScheduleStatistics } from "./lib/services/markdown/ScheduleMarkdownService";
export type { PerformanceStatistics } from "./lib/services/markdown/PerformanceMarkdownService";
export type { WalkerStatistics } from "./lib/services/markdown/WalkerMarkdownService";
export type { PartialStatistics } from "./lib/services/markdown/PartialMarkdownService";

export { ExecutionContextService } from "./lib/services/context/ExecutionContextService";
export { MethodContextService } from "./lib/services/context/MethodContextService";

export {
  SignalData,
  EntityId,
  PersistBase,
  TPersistBase,
  IPersistBase,
  TPersistBaseCtor,
  PersistSignalAdapter,
  RiskData,
  PersistRiskAdapter,
  ScheduleData,
  PersistScheduleAdapter,
  PartialData,
  PersistPartialAdapter,
} from "./classes/Persist";

export { Backtest } from "./classes/Backtest";
export { Live } from "./classes/Live";
export { Schedule } from "./classes/Schedule";
export { Performance } from "./classes/Performance";
export { Walker } from "./classes/Walker";
export { Heat } from "./classes/Heat";
export { PositionSize } from "./classes/PositionSize";
export { Optimizer } from "./classes/Optimizer";
export { Partial } from "./classes/Partial";
export { Constant } from "./classes/Constant";

export * as emitters from "./config/emitters";

export { type GlobalConfig } from "./config/params";

export { backtest as lib } from "./lib";

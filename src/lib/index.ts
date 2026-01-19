import "./core/provide";
import { inject, init } from "./core/di";
import TYPES from "./core/types";
import LoggerService from "./services/base/LoggerService";
import ExchangeConnectionService from "./services/connection/ExchangeConnectionService";
import StrategyConnectionService from "./services/connection/StrategyConnectionService";
import FrameConnectionService from "./services/connection/FrameConnectionService";
import SizingConnectionService from "./services/connection/SizingConnectionService";
import RiskConnectionService from "./services/connection/RiskConnectionService";
import ActionConnectionService from "./services/connection/ActionConnectionService";
import ExecutionContextService, {
  TExecutionContextService,
} from "./services/context/ExecutionContextService";
import MethodContextService, {
  TMethodContextService,
} from "./services/context/MethodContextService";
import ExchangeCoreService from "./services/core/ExchangeCoreService";
import StrategyCoreService from "./services/core/StrategyCoreService";
import FrameCoreService from "./services/core/FrameCoreService";
import SizingGlobalService from "./services/global/SizingGlobalService";
import RiskGlobalService from "./services/global/RiskGlobalService";
import ActionCoreService from "./services/core/ActionCoreService";
import WalkerCommandService from "./services/command/WalkerCommandService";
import ExchangeSchemaService from "./services/schema/ExchangeSchemaService";
import StrategySchemaService from "./services/schema/StrategySchemaService";
import FrameSchemaService from "./services/schema/FrameSchemaService";
import SizingSchemaService from "./services/schema/SizingSchemaService";
import RiskSchemaService from "./services/schema/RiskSchemaService";
import ActionSchemaService from "./services/schema/ActionSchemaService";
import WalkerSchemaService from "./services/schema/WalkerSchemaService";
import BacktestLogicPrivateService from "./services/logic/private/BacktestLogicPrivateService";
import LiveLogicPrivateService from "./services/logic/private/LiveLogicPrivateService";
import WalkerLogicPrivateService from "./services/logic/private/WalkerLogicPrivateService";
import BacktestLogicPublicService from "./services/logic/public/BacktestLogicPublicService";
import LiveLogicPublicService from "./services/logic/public/LiveLogicPublicService";
import WalkerLogicPublicService from "./services/logic/public/WalkerLogicPublicService";
import LiveCommandService from "./services/command/LiveCommandService";
import BacktestCommandService from "./services/command/BacktestCommandService";
import BacktestMarkdownService from "./services/markdown/BacktestMarkdownService";
import LiveMarkdownService from "./services/markdown/LiveMarkdownService";
import ScheduleMarkdownService from "./services/markdown/ScheduleMarkdownService";
import PerformanceMarkdownService from "./services/markdown/PerformanceMarkdownService";
import WalkerMarkdownService from "./services/markdown/WalkerMarkdownService";
import HeatMarkdownService from "./services/markdown/HeatMarkdownService";
import ExchangeValidationService from "./services/validation/ExchangeValidationService";
import StrategyValidationService from "./services/validation/StrategyValidationService";
import FrameValidationService from "./services/validation/FrameValidationService";
import WalkerValidationService from "./services/validation/WalkerValidationService";
import SizingValidationService from "./services/validation/SizingValidationService";
import RiskValidationService from "./services/validation/RiskValidationService";
import ActionValidationService from "./services/validation/ActionValidationService";
import OptimizerTemplateService from "./services/template/OptimizerTemplateService";
import OptimizerSchemaService from "./services/schema/OptimizerSchemaService";
import OptimizerValidationService from "./services/validation/OptimizerValidationService";
import OptimizerConnectionService from "./services/connection/OptimizerConnectionService";
import OptimizerGlobalService from "./services/global/OptimizerGlobalService";
import PartialConnectionService from "./services/connection/PartialConnectionService";
import PartialMarkdownService from "./services/markdown/PartialMarkdownService";
import PartialGlobalService from "./services/global/PartialGlobalService";
import BreakevenConnectionService from "./services/connection/BreakevenConnectionService";
import BreakevenMarkdownService from "./services/markdown/BreakevenMarkdownService";
import BreakevenGlobalService from "./services/global/BreakevenGlobalService";
import OutlineMarkdownService from "./services/markdown/OutlineMarkdownService";
import ConfigValidationService from "./services/validation/ConfigValidationService";
import RiskMarkdownService from "./services/markdown/RiskMarkdownService";
import ColumnValidationService from "./services/validation/ColumnValidationService";
import BacktestReportService from "./services/report/BacktestReportService";
import LiveReportService from "./services/report/LiveReportService";
import ScheduleReportService from "./services/report/ScheduleReportService";
import PerformanceReportService from "./services/report/PerformanceReportService";
import WalkerReportService from "./services/report/WalkerReportService";
import HeatReportService from "./services/report/HeatReportService";
import PartialReportService from "./services/report/PartialReportService";
import BreakevenReportService from "./services/report/BreakevenReportService";
import RiskReportService from "./services/report/RiskReportService";
import SignalPromptService from "./services/prompt/SignalPromptService";

const baseServices = {
  loggerService: inject<LoggerService>(TYPES.loggerService),
};

const contextServices = {
  executionContextService: inject<TExecutionContextService>(
    TYPES.executionContextService
  ),
  methodContextService: inject<TMethodContextService>(
    TYPES.methodContextService
  ),
};

const connectionServices = {
  exchangeConnectionService: inject<ExchangeConnectionService>(
    TYPES.exchangeConnectionService
  ),
  strategyConnectionService: inject<StrategyConnectionService>(
    TYPES.strategyConnectionService
  ),
  frameConnectionService: inject<FrameConnectionService>(
    TYPES.frameConnectionService
  ),
  sizingConnectionService: inject<SizingConnectionService>(
    TYPES.sizingConnectionService
  ),
  riskConnectionService: inject<RiskConnectionService>(
    TYPES.riskConnectionService
  ),
  actionConnectionService: inject<ActionConnectionService>(
    TYPES.actionConnectionService
  ),
  optimizerConnectionService: inject<OptimizerConnectionService>(
    TYPES.optimizerConnectionService
  ),
  partialConnectionService: inject<PartialConnectionService>(
    TYPES.partialConnectionService
  ),
  breakevenConnectionService: inject<BreakevenConnectionService>(
    TYPES.breakevenConnectionService
  ),
};

const schemaServices = {
  exchangeSchemaService: inject<ExchangeSchemaService>(
    TYPES.exchangeSchemaService
  ),
  strategySchemaService: inject<StrategySchemaService>(
    TYPES.strategySchemaService
  ),
  frameSchemaService: inject<FrameSchemaService>(TYPES.frameSchemaService),
  walkerSchemaService: inject<WalkerSchemaService>(TYPES.walkerSchemaService),
  sizingSchemaService: inject<SizingSchemaService>(TYPES.sizingSchemaService),
  riskSchemaService: inject<RiskSchemaService>(TYPES.riskSchemaService),
  actionSchemaService: inject<ActionSchemaService>(TYPES.actionSchemaService),
  optimizerSchemaService: inject<OptimizerSchemaService>(
    TYPES.optimizerSchemaService
  ),
};

const coreServices = {
  exchangeCoreService: inject<ExchangeCoreService>(TYPES.exchangeCoreService),
  strategyCoreService: inject<StrategyCoreService>(TYPES.strategyCoreService),
  actionCoreService: inject<ActionCoreService>(TYPES.actionCoreService),
  frameCoreService: inject<FrameCoreService>(TYPES.frameCoreService),
};

const globalServices = {
  sizingGlobalService: inject<SizingGlobalService>(TYPES.sizingGlobalService),
  riskGlobalService: inject<RiskGlobalService>(TYPES.riskGlobalService),
  optimizerGlobalService: inject<OptimizerGlobalService>(
    TYPES.optimizerGlobalService
  ),
  partialGlobalService: inject<PartialGlobalService>(
    TYPES.partialGlobalService
  ),
  breakevenGlobalService: inject<BreakevenGlobalService>(
    TYPES.breakevenGlobalService
  ),
};

const commandServices = {
  liveCommandService: inject<LiveCommandService>(TYPES.liveCommandService),
  backtestCommandService: inject<BacktestCommandService>(
    TYPES.backtestCommandService
  ),
  walkerCommandService: inject<WalkerCommandService>(
    TYPES.walkerCommandService
  ),
};

const logicPrivateServices = {
  backtestLogicPrivateService: inject<BacktestLogicPrivateService>(
    TYPES.backtestLogicPrivateService
  ),
  liveLogicPrivateService: inject<LiveLogicPrivateService>(
    TYPES.liveLogicPrivateService
  ),
  walkerLogicPrivateService: inject<WalkerLogicPrivateService>(
    TYPES.walkerLogicPrivateService
  ),
};

const logicPublicServices = {
  backtestLogicPublicService: inject<BacktestLogicPublicService>(
    TYPES.backtestLogicPublicService
  ),
  liveLogicPublicService: inject<LiveLogicPublicService>(
    TYPES.liveLogicPublicService
  ),
  walkerLogicPublicService: inject<WalkerLogicPublicService>(
    TYPES.walkerLogicPublicService
  ),
};

const markdownServices = {
  backtestMarkdownService: inject<BacktestMarkdownService>(
    TYPES.backtestMarkdownService
  ),
  liveMarkdownService: inject<LiveMarkdownService>(TYPES.liveMarkdownService),
  scheduleMarkdownService: inject<ScheduleMarkdownService>(
    TYPES.scheduleMarkdownService
  ),
  performanceMarkdownService: inject<PerformanceMarkdownService>(
    TYPES.performanceMarkdownService
  ),
  walkerMarkdownService: inject<WalkerMarkdownService>(
    TYPES.walkerMarkdownService
  ),
  heatMarkdownService: inject<HeatMarkdownService>(TYPES.heatMarkdownService),
  partialMarkdownService: inject<PartialMarkdownService>(
    TYPES.partialMarkdownService
  ),
  breakevenMarkdownService: inject<BreakevenMarkdownService>(
    TYPES.breakevenMarkdownService
  ),
  outlineMarkdownService: inject<OutlineMarkdownService>(
    TYPES.outlineMarkdownService
  ),
  riskMarkdownService: inject<RiskMarkdownService>(TYPES.riskMarkdownService),
};

const reportServices = {
  backtestReportService: inject<BacktestReportService>(
    TYPES.backtestReportService
  ),
  liveReportService: inject<LiveReportService>(TYPES.liveReportService),
  scheduleReportService: inject<ScheduleReportService>(
    TYPES.scheduleReportService
  ),
  performanceReportService: inject<PerformanceReportService>(
    TYPES.performanceReportService
  ),
  walkerReportService: inject<WalkerReportService>(
    TYPES.walkerReportService
  ),
  heatReportService: inject<HeatReportService>(TYPES.heatReportService),
  partialReportService: inject<PartialReportService>(
    TYPES.partialReportService
  ),
  breakevenReportService: inject<BreakevenReportService>(
    TYPES.breakevenReportService
  ),
  riskReportService: inject<RiskReportService>(TYPES.riskReportService),
};

const validationServices = {
  exchangeValidationService: inject<ExchangeValidationService>(
    TYPES.exchangeValidationService
  ),
  strategyValidationService: inject<StrategyValidationService>(
    TYPES.strategyValidationService
  ),
  frameValidationService: inject<FrameValidationService>(
    TYPES.frameValidationService
  ),
  walkerValidationService: inject<WalkerValidationService>(
    TYPES.walkerValidationService
  ),
  sizingValidationService: inject<SizingValidationService>(
    TYPES.sizingValidationService
  ),
  riskValidationService: inject<RiskValidationService>(
    TYPES.riskValidationService
  ),
  actionValidationService: inject<ActionValidationService>(
    TYPES.actionValidationService
  ),
  optimizerValidationService: inject<OptimizerValidationService>(
    TYPES.optimizerValidationService
  ),
  configValidationService: inject<ConfigValidationService>(
    TYPES.configValidationService
  ),
  columnValidationService: inject<ColumnValidationService>(
    TYPES.columnValidationService
  ),
};

const templateServices = {
  optimizerTemplateService: inject<OptimizerTemplateService>(
    TYPES.optimizerTemplateService
  ),
};

const promptServices = {
  signalPromptService: inject<SignalPromptService>(TYPES.signalPromptService),
}

export const backtest = {
  ...baseServices,
  ...contextServices,
  ...connectionServices,
  ...schemaServices,
  ...coreServices,
  ...globalServices,
  ...commandServices,
  ...logicPrivateServices,
  ...logicPublicServices,
  ...markdownServices,
  ...reportServices,
  ...validationServices,
  ...templateServices,
  ...promptServices,
};

init();

export { ExecutionContextService };
export { MethodContextService };

export default backtest;

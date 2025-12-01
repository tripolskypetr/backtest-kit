import "./core/provide";
import { inject, init } from "./core/di";
import TYPES from "./core/types";
import LoggerService from "./services/base/LoggerService";
import ExchangeConnectionService from "./services/connection/ExchangeConnectionService";
import StrategyConnectionService from "./services/connection/StrategyConnectionService";
import FrameConnectionService from "./services/connection/FrameConnectionService";
import SizingConnectionService from "./services/connection/SizingConnectionService";
import RiskConnectionService from "./services/connection/RiskConnectionService";
import ExecutionContextService, {
  TExecutionContextService,
} from "./services/context/ExecutionContextService";
import MethodContextService, {
  TMethodContextService,
} from "./services/context/MethodContextService";
import ExchangeGlobalService from "./services/global/ExchangeGlobalService";
import StrategyGlobalService from "./services/global/StrategyGlobalService";
import FrameGlobalService from "./services/global/FrameGlobalService";
import SizingGlobalService from "./services/global/SizingGlobalService";
import RiskGlobalService from "./services/global/RiskGlobalService";
import WalkerCommandService from "./services/command/WalkerCommandService";
import ExchangeSchemaService from "./services/schema/ExchangeSchemaService";
import StrategySchemaService from "./services/schema/StrategySchemaService";
import FrameSchemaService from "./services/schema/FrameSchemaService";
import SizingSchemaService from "./services/schema/SizingSchemaService";
import RiskSchemaService from "./services/schema/RiskSchemaService";
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
import OptimizerTemplateService from "./services/template/OptimizerTemplateService";
import OptimizerSchemaService from "./services/schema/OptimizerSchemaService";
import OptimizerValidationService from "./services/validation/OptimizerValidationService";
import OptimizerConnectionService from "./services/connection/OptimizerConnectionService";
import OptimizerGlobalService from "./services/global/OptimizerGlobalService";

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
  optimizerConnectionService: inject<OptimizerConnectionService>(
    TYPES.optimizerConnectionService
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
  optimizerSchemaService: inject<OptimizerSchemaService>(
    TYPES.optimizerSchemaService
  ),
};

const globalServices = {
  exchangeGlobalService: inject<ExchangeGlobalService>(
    TYPES.exchangeGlobalService
  ),
  strategyGlobalService: inject<StrategyGlobalService>(
    TYPES.strategyGlobalService
  ),
  frameGlobalService: inject<FrameGlobalService>(TYPES.frameGlobalService),
  sizingGlobalService: inject<SizingGlobalService>(TYPES.sizingGlobalService),
  riskGlobalService: inject<RiskGlobalService>(TYPES.riskGlobalService),
  optimizerGlobalService: inject<OptimizerGlobalService>(
    TYPES.optimizerGlobalService
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
  optimizerValidationService: inject<OptimizerValidationService>(
    TYPES.optimizerValidationService
  ),
};

const templateServices = {
  optimizerTemplateService: inject<OptimizerTemplateService>(
    TYPES.optimizerTemplateService
  ),
};

export const backtest = {
  ...baseServices,
  ...contextServices,
  ...connectionServices,
  ...schemaServices,
  ...globalServices,
  ...commandServices,
  ...logicPrivateServices,
  ...logicPublicServices,
  ...markdownServices,
  ...validationServices,
  ...templateServices,
};

init();

export { ExecutionContextService };
export { MethodContextService };

export default backtest;

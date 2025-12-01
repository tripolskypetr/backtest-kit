import LoggerService from "../services/base/LoggerService";
import ExchangeConnectionService from "../services/connection/ExchangeConnectionService";
import StrategyConnectionService from "../services/connection/StrategyConnectionService";
import FrameConnectionService from "../services/connection/FrameConnectionService";
import SizingConnectionService from "../services/connection/SizingConnectionService";
import RiskConnectionService from "../services/connection/RiskConnectionService";
import ExecutionContextService from "../services/context/ExecutionContextService";
import MethodContextService from "../services/context/MethodContextService";
import ExchangeGlobalService from "../services/global/ExchangeGlobalService";
import StrategyGlobalService from "../services/global/StrategyGlobalService";
import FrameGlobalService from "../services/global/FrameGlobalService";
import SizingGlobalService from "../services/global/SizingGlobalService";
import RiskGlobalService from "../services/global/RiskGlobalService";
import ExchangeSchemaService from "../services/schema/ExchangeSchemaService";
import StrategySchemaService from "../services/schema/StrategySchemaService";
import FrameSchemaService from "../services/schema/FrameSchemaService";
import SizingSchemaService from "../services/schema/SizingSchemaService";
import RiskSchemaService from "../services/schema/RiskSchemaService";
import WalkerSchemaService from "../services/schema/WalkerSchemaService";
import BacktestLogicPrivateService from "../services/logic/private/BacktestLogicPrivateService";
import LiveLogicPrivateService from "../services/logic/private/LiveLogicPrivateService";
import WalkerLogicPrivateService from "../services/logic/private/WalkerLogicPrivateService";
import { provide } from "./di";
import TYPES from "./types";
import BacktestLogicPublicService from "../services/logic/public/BacktestLogicPublicService";
import LiveLogicPublicService from "../services/logic/public/LiveLogicPublicService";
import WalkerLogicPublicService from "../services/logic/public/WalkerLogicPublicService";
import LiveCommandService from "../services/command/LiveCommandService";
import BacktestCommandService from "../services/command/BacktestCommandService";
import WalkerCommandService from "../services/command/WalkerCommandService";
import BacktestMarkdownService from "../services/markdown/BacktestMarkdownService";
import LiveMarkdownService from "../services/markdown/LiveMarkdownService";
import ScheduleMarkdownService from "../services/markdown/ScheduleMarkdownService";
import PerformanceMarkdownService from "../services/markdown/PerformanceMarkdownService";
import WalkerMarkdownService from "../services/markdown/WalkerMarkdownService";
import HeatMarkdownService from "../services/markdown/HeatMarkdownService";
import ExchangeValidationService from "../services/validation/ExchangeValidationService";
import StrategyValidationService from "../services/validation/StrategyValidationService";
import FrameValidationService from "../services/validation/FrameValidationService";
import WalkerValidationService from "../services/validation/WalkerValidationService";
import SizingValidationService from "../services/validation/SizingValidationService";
import RiskValidationService from "../services/validation/RiskValidationService";
import OptimizerTemplateService from "../services/template/OptimizerTemplateService";
import OptimizerSchemaService from "../services/schema/OptimizerSchemaService";
import OptimizerValidationService from "../services/validation/OptimizerValidationService";

{
    provide(TYPES.loggerService, () => new LoggerService());
}

{
    provide(TYPES.executionContextService, () => new ExecutionContextService());
    provide(TYPES.methodContextService, () => new MethodContextService());
}

{
    provide(TYPES.exchangeConnectionService, () => new ExchangeConnectionService());
    provide(TYPES.strategyConnectionService, () => new StrategyConnectionService());
    provide(TYPES.frameConnectionService, () => new FrameConnectionService());
    provide(TYPES.sizingConnectionService, () => new SizingConnectionService());
    provide(TYPES.riskConnectionService, () => new RiskConnectionService());
}

{
    provide(TYPES.exchangeSchemaService, () => new ExchangeSchemaService());
    provide(TYPES.strategySchemaService, () => new StrategySchemaService());
    provide(TYPES.frameSchemaService, () => new FrameSchemaService());
    provide(TYPES.walkerSchemaService, () => new WalkerSchemaService());
    provide(TYPES.sizingSchemaService, () => new SizingSchemaService());
    provide(TYPES.riskSchemaService, () => new RiskSchemaService());
    provide(TYPES.optimizerSchemaService, () => new OptimizerSchemaService());
}

{
    provide(TYPES.exchangeGlobalService, () => new ExchangeGlobalService());
    provide(TYPES.strategyGlobalService, () => new StrategyGlobalService());
    provide(TYPES.frameGlobalService, () => new FrameGlobalService());
    provide(TYPES.sizingGlobalService, () => new SizingGlobalService());
    provide(TYPES.riskGlobalService, () => new RiskGlobalService());
}

{
    provide(TYPES.liveCommandService, () => new LiveCommandService());
    provide(TYPES.backtestCommandService, () => new BacktestCommandService());
    provide(TYPES.walkerCommandService, () => new WalkerCommandService());
}

{
    provide(TYPES.backtestLogicPrivateService, () => new BacktestLogicPrivateService());
    provide(TYPES.liveLogicPrivateService, () => new LiveLogicPrivateService());
    provide(TYPES.walkerLogicPrivateService, () => new WalkerLogicPrivateService());
}

{
    provide(TYPES.backtestLogicPublicService, () => new BacktestLogicPublicService());
    provide(TYPES.liveLogicPublicService, () => new LiveLogicPublicService());
    provide(TYPES.walkerLogicPublicService, () => new WalkerLogicPublicService());
}

{
    provide(TYPES.backtestMarkdownService, () => new BacktestMarkdownService());
    provide(TYPES.liveMarkdownService, () => new LiveMarkdownService());
    provide(TYPES.scheduleMarkdownService, () => new ScheduleMarkdownService());
    provide(TYPES.performanceMarkdownService, () => new PerformanceMarkdownService());
    provide(TYPES.walkerMarkdownService, () => new WalkerMarkdownService());
    provide(TYPES.heatMarkdownService, () => new HeatMarkdownService());
}

{
    provide(TYPES.exchangeValidationService, () => new ExchangeValidationService());
    provide(TYPES.strategyValidationService, () => new StrategyValidationService());
    provide(TYPES.frameValidationService, () => new FrameValidationService());
    provide(TYPES.walkerValidationService, () => new WalkerValidationService());
    provide(TYPES.sizingValidationService, () => new SizingValidationService());
    provide(TYPES.riskValidationService, () => new RiskValidationService());
    provide(TYPES.optimizerValidationService, () => new OptimizerValidationService());
}

{
    provide(TYPES.optimizerTemplateService, () => new OptimizerTemplateService());
}

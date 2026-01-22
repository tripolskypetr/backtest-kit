import LoggerService from "../services/base/LoggerService";
import ExchangeConnectionService from "../services/connection/ExchangeConnectionService";
import StrategyConnectionService from "../services/connection/StrategyConnectionService";
import FrameConnectionService from "../services/connection/FrameConnectionService";
import SizingConnectionService from "../services/connection/SizingConnectionService";
import RiskConnectionService from "../services/connection/RiskConnectionService";
import ActionConnectionService from "../services/connection/ActionConnectionService";
import ExecutionContextService from "../services/context/ExecutionContextService";
import MethodContextService from "../services/context/MethodContextService";
import ExchangeCoreService from "../services/core/ExchangeCoreService";
import StrategyCoreService from "../services/core/StrategyCoreService";
import FrameCoreService from "../services/core/FrameCoreService";
import SizingGlobalService from "../services/global/SizingGlobalService";
import RiskGlobalService from "../services/global/RiskGlobalService";
import ActionCoreService from "../services/core/ActionCoreService";
import ExchangeSchemaService from "../services/schema/ExchangeSchemaService";
import StrategySchemaService from "../services/schema/StrategySchemaService";
import FrameSchemaService from "../services/schema/FrameSchemaService";
import SizingSchemaService from "../services/schema/SizingSchemaService";
import RiskSchemaService from "../services/schema/RiskSchemaService";
import ActionSchemaService from "../services/schema/ActionSchemaService";
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
import ActionValidationService from "../services/validation/ActionValidationService";
import { PartialConnectionService } from "../services/connection/PartialConnectionService";
import PartialMarkdownService from "../services/markdown/PartialMarkdownService";
import PartialGlobalService from "../services/global/PartialGlobalService";
import { BreakevenConnectionService } from "../services/connection/BreakevenConnectionService";
import BreakevenMarkdownService from "../services/markdown/BreakevenMarkdownService";
import BreakevenGlobalService from "../services/global/BreakevenGlobalService";
import ConfigValidationService from "../services/validation/ConfigValidationService";
import RiskMarkdownService from "../services/markdown/RiskMarkdownService";
import ColumnValidationService from "../services/validation/ColumnValidationService";
import BacktestReportService from "../services/report/BacktestReportService";
import LiveReportService from "../services/report/LiveReportService";
import ScheduleReportService from "../services/report/ScheduleReportService";
import PerformanceReportService from "../services/report/PerformanceReportService";
import WalkerReportService from "../services/report/WalkerReportService";
import HeatReportService from "../services/report/HeatReportService";
import PartialReportService from "../services/report/PartialReportService";
import BreakevenReportService from "../services/report/BreakevenReportService";
import RiskReportService from "../services/report/RiskReportService";

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
    provide(TYPES.actionConnectionService, () => new ActionConnectionService());
    provide(TYPES.partialConnectionService, () => new PartialConnectionService());
    provide(TYPES.breakevenConnectionService, () => new BreakevenConnectionService());
}

{
    provide(TYPES.exchangeSchemaService, () => new ExchangeSchemaService());
    provide(TYPES.strategySchemaService, () => new StrategySchemaService());
    provide(TYPES.frameSchemaService, () => new FrameSchemaService());
    provide(TYPES.walkerSchemaService, () => new WalkerSchemaService());
    provide(TYPES.sizingSchemaService, () => new SizingSchemaService());
    provide(TYPES.riskSchemaService, () => new RiskSchemaService());
    provide(TYPES.actionSchemaService, () => new ActionSchemaService());
}

{
    provide(TYPES.exchangeCoreService, () => new ExchangeCoreService());
    provide(TYPES.strategyCoreService, () => new StrategyCoreService());
    provide(TYPES.actionCoreService, () => new ActionCoreService());
    provide(TYPES.frameCoreService, () => new FrameCoreService());
}

{
    provide(TYPES.sizingGlobalService, () => new SizingGlobalService());
    provide(TYPES.riskGlobalService, () => new RiskGlobalService());
    provide(TYPES.partialGlobalService, () => new PartialGlobalService());
    provide(TYPES.breakevenGlobalService, () => new BreakevenGlobalService());
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
    provide(TYPES.partialMarkdownService, () => new PartialMarkdownService());
    provide(TYPES.breakevenMarkdownService, () => new BreakevenMarkdownService());
    provide(TYPES.riskMarkdownService, () => new RiskMarkdownService());
}

{
    provide(TYPES.backtestReportService, () => new BacktestReportService());
    provide(TYPES.liveReportService, () => new LiveReportService());
    provide(TYPES.scheduleReportService, () => new ScheduleReportService());
    provide(TYPES.performanceReportService, () => new PerformanceReportService());
    provide(TYPES.walkerReportService, () => new WalkerReportService());
    provide(TYPES.heatReportService, () => new HeatReportService());
    provide(TYPES.partialReportService, () => new PartialReportService());
    provide(TYPES.breakevenReportService, () => new BreakevenReportService());
    provide(TYPES.riskReportService, () => new RiskReportService());
}

{
    provide(TYPES.exchangeValidationService, () => new ExchangeValidationService());
    provide(TYPES.strategyValidationService, () => new StrategyValidationService());
    provide(TYPES.frameValidationService, () => new FrameValidationService());
    provide(TYPES.walkerValidationService, () => new WalkerValidationService());
    provide(TYPES.sizingValidationService, () => new SizingValidationService());
    provide(TYPES.riskValidationService, () => new RiskValidationService());
    provide(TYPES.actionValidationService, () => new ActionValidationService());
    provide(TYPES.configValidationService, () => new ConfigValidationService());
    provide(TYPES.columnValidationService, () => new ColumnValidationService());
}

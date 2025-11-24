import LoggerService from "../services/base/LoggerService";
import ExchangeConnectionService from "../services/connection/ExchangeConnectionService";
import StrategyConnectionService from "../services/connection/StrategyConnectionService";
import FrameConnectionService from "../services/connection/FrameConnectionService";
import ExecutionContextService from "../services/context/ExecutionContextService";
import MethodContextService from "../services/context/MethodContextService";
import ExchangeGlobalService from "../services/global/ExchangeGlobalService";
import StrategyGlobalService from "../services/global/StrategyGlobalService";
import FrameGlobalService from "../services/global/FrameGlobalService";
import ExchangeSchemaService from "../services/schema/ExchangeSchemaService";
import StrategySchemaService from "../services/schema/StrategySchemaService";
import FrameSchemaService from "../services/schema/FrameSchemaService";
import WalkerSchemaService from "../services/schema/WalkerSchemaService";
import BacktestLogicPrivateService from "../services/logic/private/BacktestLogicPrivateService";
import LiveLogicPrivateService from "../services/logic/private/LiveLogicPrivateService";
import WalkerLogicPrivateService from "../services/logic/private/WalkerLogicPrivateService";
import { provide } from "./di";
import TYPES from "./types";
import BacktestLogicPublicService from "../services/logic/public/BacktestLogicPublicService";
import LiveLogicPublicService from "../services/logic/public/LiveLogicPublicService";
import WalkerLogicPublicService from "../services/logic/public/WalkerLogicPublicService";
import LiveGlobalService from "../services/global/LiveGlobalService";
import BacktestGlobalService from "../services/global/BacktestGlobalService";
import WalkerGlobalService from "../services/global/WalkerGlobalService";
import BacktestMarkdownService from "../services/markdown/BacktestMarkdownService";
import LiveMarkdownService from "../services/markdown/LiveMarkdownService";
import PerformanceMarkdownService from "../services/markdown/PerformanceMarkdownService";
import WalkerMarkdownService from "../services/markdown/WalkerMarkdownService";
import HeatMarkdownService from "../services/markdown/HeatMarkdownService";
import ExchangeValidationService from "../services/validation/ExchangeValidationService";
import StrategyValidationService from "../services/validation/StrategyValidationService";
import FrameValidationService from "../services/validation/FrameValidationService";
import WalkerValidationService from "../services/validation/WalkerValidationService";

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
}

{
    provide(TYPES.exchangeSchemaService, () => new ExchangeSchemaService());
    provide(TYPES.strategySchemaService, () => new StrategySchemaService());
    provide(TYPES.frameSchemaService, () => new FrameSchemaService());
    provide(TYPES.walkerSchemaService, () => new WalkerSchemaService());
}

{
    provide(TYPES.exchangeGlobalService, () => new ExchangeGlobalService());
    provide(TYPES.strategyGlobalService, () => new StrategyGlobalService());
    provide(TYPES.frameGlobalService, () => new FrameGlobalService());
    provide(TYPES.liveGlobalService, () => new LiveGlobalService());
    provide(TYPES.backtestGlobalService, () => new BacktestGlobalService());
    provide(TYPES.walkerGlobalService, () => new WalkerGlobalService());
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
    provide(TYPES.performanceMarkdownService, () => new PerformanceMarkdownService());
    provide(TYPES.walkerMarkdownService, () => new WalkerMarkdownService());
    provide(TYPES.heatMarkdownService, () => new HeatMarkdownService());
}

{
    provide(TYPES.exchangeValidationService, () => new ExchangeValidationService());
    provide(TYPES.strategyValidationService, () => new StrategyValidationService());
    provide(TYPES.frameValidationService, () => new FrameValidationService());
    provide(TYPES.walkerValidationService, () => new WalkerValidationService());
}


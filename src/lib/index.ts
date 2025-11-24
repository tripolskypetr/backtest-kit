import "./core/provide";
import { inject, init } from "./core/di";
import TYPES from "./core/types";
import LoggerService from "./services/base/LoggerService";
import ExchangeConnectionService from "./services/connection/ExchangeConnectionService";
import StrategyConnectionService from "./services/connection/StrategyConnectionService";
import FrameConnectionService from "./services/connection/FrameConnectionService";
import ExecutionContextService, {
  TExecutionContextService,
} from "./services/context/ExecutionContextService";
import MethodContextService, {
  TMethodContextService,
} from "./services/context/MethodContextService";
import ExchangeGlobalService from "./services/global/ExchangeGlobalService";
import StrategyGlobalService from "./services/global/StrategyGlobalService";
import FrameGlobalService from "./services/global/FrameGlobalService";
import WalkerGlobalService from "./services/global/WalkerGlobalService";
import ExchangeSchemaService from "./services/schema/ExchangeSchemaService";
import StrategySchemaService from "./services/schema/StrategySchemaService";
import FrameSchemaService from "./services/schema/FrameSchemaService";
import WalkerSchemaService from "./services/schema/WalkerSchemaService";
import BacktestLogicPrivateService from "./services/logic/private/BacktestLogicPrivateService";
import LiveLogicPrivateService from "./services/logic/private/LiveLogicPrivateService";
import WalkerLogicPrivateService from "./services/logic/private/WalkerLogicPrivateService";
import BacktestLogicPublicService from "./services/logic/public/BacktestLogicPublicService";
import LiveLogicPublicService from "./services/logic/public/LiveLogicPublicService";
import WalkerLogicPublicService from "./services/logic/public/WalkerLogicPublicService";
import LiveGlobalService from "./services/global/LiveGlobalService";
import BacktestGlobalService from "./services/global/BacktestGlobalService";
import BacktestMarkdownService from "./services/markdown/BacktestMarkdownService";
import LiveMarkdownService from "./services/markdown/LiveMarkdownService";
import PerformanceMarkdownService from "./services/markdown/PerformanceMarkdownService";
import WalkerMarkdownService from "./services/markdown/WalkerMarkdownService";
import ExchangeValidationService from "./services/validation/ExchangeValidationService";
import StrategyValidationService from "./services/validation/StrategyValidationService";
import FrameValidationService from "./services/validation/FrameValidationService";

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
};

const globalServices = {
  exchangeGlobalService: inject<ExchangeGlobalService>(
    TYPES.exchangeGlobalService
  ),
  strategyGlobalService: inject<StrategyGlobalService>(
    TYPES.strategyGlobalService
  ),
  frameGlobalService: inject<FrameGlobalService>(TYPES.frameGlobalService),
  liveGlobalService: inject<LiveGlobalService>(TYPES.liveGlobalService),
  backtestGlobalService: inject<BacktestGlobalService>(
    TYPES.backtestGlobalService
  ),
  walkerGlobalService: inject<WalkerGlobalService>(TYPES.walkerGlobalService),
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
  backtestMarkdownService: inject<BacktestMarkdownService>(TYPES.backtestMarkdownService),
  liveMarkdownService: inject<LiveMarkdownService>(TYPES.liveMarkdownService),
  performanceMarkdownService: inject<PerformanceMarkdownService>(TYPES.performanceMarkdownService),
  walkerMarkdownService: inject<WalkerMarkdownService>(TYPES.walkerMarkdownService),
}

const validationServices = {
  exchangeValidationService: inject<ExchangeValidationService>(TYPES.exchangeValidationService),
  strategyValidationService: inject<StrategyValidationService>(TYPES.strategyValidationService),
  frameValidationService: inject<FrameValidationService>(TYPES.frameValidationService),
}

export const backtest = {
  ...baseServices,
  ...contextServices,
  ...connectionServices,
  ...schemaServices,
  ...globalServices,
  ...logicPrivateServices,
  ...logicPublicServices,
  ...markdownServices,
  ...validationServices,
};

init();

export { ExecutionContextService };
export { MethodContextService };

export default backtest;

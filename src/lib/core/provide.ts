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
import BacktestLogicPrivateService from "../services/logic/private/BacktestLogicPrivateService";
import LiveLogicPrivateService from "../services/logic/private/LiveLogicPrivateService";
import { provide } from "./di";
import TYPES from "./types";

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
}

{
    provide(TYPES.exchangeGlobalService, () => new ExchangeGlobalService());
    provide(TYPES.strategyGlobalService, () => new StrategyGlobalService());
    provide(TYPES.frameGlobalService, () => new FrameGlobalService());
}

{
    provide(TYPES.backtestLogicPrivateService, () => new BacktestLogicPrivateService());
    provide(TYPES.liveLogicPrivateService, () => new LiveLogicPrivateService());
}

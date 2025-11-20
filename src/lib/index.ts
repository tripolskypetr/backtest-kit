import "./core/provide";
import { inject, init } from "./core/di";
import TYPES from "./core/types";
import LoggerService from "./services/base/LoggerService";
import ExchangeConnectionService from "./services/connection/ExchangeConnectionService";
import ExecutionContextService, {
  TExecutionContextService,
} from "./services/context/ExecutionContextService";
import ExchangeSchemaService from "./services/schema/ExchangeSchemaService";
import StrategySchemaService from "./services/schema/StrategySchemaService";
import StrategyConnectionService from "./services/connection/StrategyConnectionService";
import ExchangePublicService from "./services/public/ExchangePublicService";
import StrategyPublicService from "./services/public/StrategyPublicService";
import MethodContextService, {
  TMethodContextService,
} from "./services/context/MethodContextService";

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
};

const schemaServices = {
  exchangeSchemaService: inject<ExchangeSchemaService>(
    TYPES.exchangeSchemaService
  ),
  strategySchemaService: inject<StrategySchemaService>(
    TYPES.strategySchemaService
  ),
};

const publicServices = {
  exchangePublicService: inject<ExchangePublicService>(
    TYPES.exchangePublicService
  ),
  strategyPublicService: inject<StrategyPublicService>(
    TYPES.strategyPublicService
  ),
};

export const backtest = {
  ...baseServices,
  ...contextServices,
  ...connectionServices,
  ...schemaServices,
  ...publicServices,
};

init();

export { ExecutionContextService };
export { MethodContextService };

export default backtest;

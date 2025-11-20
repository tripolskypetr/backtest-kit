import LoggerService from "../services/base/LoggerService";
import ExchangeConnectionService from "../services/connection/ExchangeConnectionService";
import StrategyConnectionService from "../services/connection/StrategyConnectionService";
import ExecutionContextService from "../services/context/ExecutionContextService";
import MethodContextService from "../services/context/MethodContextService";
import ExchangePublicService from "../services/public/ExchangePublicService";
import StrategyPublicService from "../services/public/StrategyPublicService";
import ExchangeSchemaService from "../services/schema/ExchangeSchemaService";
import StrategySchemaService from "../services/schema/StrategySchemaService";
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
}

{
    provide(TYPES.exchangeSchemaService, () => new ExchangeSchemaService());
    provide(TYPES.strategySchemaService, () => new StrategySchemaService());
}

{
    provide(TYPES.exchangePublicService, () => new ExchangePublicService());
    provide(TYPES.strategyPublicService, () => new StrategyPublicService());
}

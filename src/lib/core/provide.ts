import LoggerService from "../services/base/LoggerService";
import CandleConnectionService from "../services/connection/CandleConnectionService";
import StrategyConnectionService from "../services/connection/StrategyConnectionService";
import ExecutionContextService from "../services/context/ExecutionContextService";
import CandleSchemaService from "../services/schema/CandleSchemaService";
import StrategySchemaService from "../services/schema/StrategySchemaService";
import { provide } from "./di";
import TYPES from "./types";

{
    provide(TYPES.loggerService, () => new LoggerService());
}

{
    provide(TYPES.executionContextService, () => new ExecutionContextService());
}

{
    provide(TYPES.candleConnectionService, () => new CandleConnectionService());
    provide(TYPES.strategyConnectionService, () => new StrategyConnectionService());
}

{
    provide(TYPES.candleSchemaService, () => new CandleSchemaService());
    provide(TYPES.strategySchemaService, () => new StrategySchemaService());
}


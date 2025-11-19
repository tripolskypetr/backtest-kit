import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import { TExecutionContextService } from "../context/ExecutionContextService";
import { CandleInterval, ICandle } from "../../../interfaces/Candle.interface";
import { memoize } from "functools-kit";
import ClientStrategy from "../../../client/ClientStrategy";
import CandleSchemaService from "../schema/CandleSchemaService";
import {
  IStrategy,
  IStrategyTickResult,
} from "../../../interfaces/Strategy.interface";
import StrategySchemaService from "../schema/StrategySchemaService";
import CandleConnectionService from "./CandleConnectionService";

export class StrategyConnectionService implements IStrategy {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly executionContextService = inject<TExecutionContextService>(
    TYPES.executionContextService
  );
  private readonly strategySchemaService = inject<StrategySchemaService>(
    TYPES.strategySchemaService
  );
  private readonly candleConnectionService = inject<CandleConnectionService>(
    TYPES.candleConnectionService
  );

  private getStrategy = memoize<(symbol: string) => ClientStrategy>(
    (symbol) => `${symbol}`,
    (symbol: string) => {
      const { getSignal, callbacks } = this.strategySchemaService.getSchema();
      return new ClientStrategy({
        symbol,
        execution: this.executionContextService,
        logger: this.loggerService,
        candle: this.candleConnectionService,
        getSignal,
        callbacks,
      });
    }
  );

  public tick = (symbol: string): Promise<IStrategyTickResult> => {
    this.loggerService.log("strategyConnectionService tick", {
      symbol,
    });
    return this.getStrategy(symbol).tick(symbol);
  };
}

export default StrategyConnectionService;

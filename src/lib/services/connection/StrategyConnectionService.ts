import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import { TExecutionContextService } from "../context/ExecutionContextService";
import {
  CandleInterval,
  ICandleData,
  IExchange,
} from "../../../interfaces/Exchange.interface";
import { memoize } from "functools-kit";
import ClientStrategy from "../../../client/ClientStrategy";
import ExchangeSchemaService from "../schema/ExchangeSchemaService";
import {
  IStrategy,
  IStrategyBacktestResult,
  IStrategyTickResult,
  StrategyName,
} from "../../../interfaces/Strategy.interface";
import StrategySchemaService from "../schema/StrategySchemaService";
import ExchangeConnectionService from "./ExchangeConnectionService";
import { TMethodContextService } from "../context/MethodContextService";

export class StrategyConnectionService implements IStrategy {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly executionContextService = inject<TExecutionContextService>(
    TYPES.executionContextService
  );
  private readonly strategySchemaService = inject<StrategySchemaService>(
    TYPES.strategySchemaService
  );
  private readonly exchangeConnectionService =
    inject<ExchangeConnectionService>(TYPES.exchangeConnectionService);
  private readonly methodContextService = inject<TMethodContextService>(
    TYPES.methodContextService
  );

  private getStrategy = memoize(
    (strategyName) => `${strategyName}`,
    (strategyName: StrategyName) => {
      const { exchangeName, getSignal, interval, callbacks } =
        this.strategySchemaService.get(strategyName);
      return new ClientStrategy({
        interval,
        execution: this.executionContextService,
        logger: this.loggerService,
        exchange: this.exchangeConnectionService.getExchange(exchangeName),
        exchangeName,
        strategyName,
        getSignal,
        callbacks,
      });
    }
  );

  public tick = async (): Promise<IStrategyTickResult> => {
    this.loggerService.log("strategyConnectionService tick");
    return await this.getStrategy(
      this.methodContextService.context.strategyName
    ).tick();
  };

  public backtest = async (
    candles: ICandleData[]
  ): Promise<IStrategyBacktestResult> => {
    this.loggerService.log("strategyConnectionService backtest");
    return await this.getStrategy(
      this.methodContextService.context.strategyName
    ).backtest(candles);
  };
}

export default StrategyConnectionService;

import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import ExecutionContextService from "../context/ExecutionContextService";
import {
  ISignalRow,
  IStrategyBacktestResult,
  IStrategyTickResult,
  StrategyName,
} from "../../../interfaces/Strategy.interface";
import StrategyConnectionService from "../connection/StrategyConnectionService";
import { ICandleData } from "../../../interfaces/Exchange.interface";
import { memoize, singleshot } from "functools-kit";
import StrategySchemaService from "../schema/StrategySchemaService";
import RiskValidationService from "../validation/RiskValidationService";
import StrategyValidationService from "../validation/StrategyValidationService";
import { TMethodContextService } from "../context/MethodContextService";

const METHOD_NAME_VALIDATE = "strategyGlobalService validate";

/**
 * Global service for strategy operations with execution context injection.
 *
 * Wraps StrategyConnectionService with ExecutionContextService to inject
 * symbol, when, and backtest parameters into the execution context.
 *
 * Used internally by BacktestLogicPrivateService and LiveLogicPrivateService.
 */
export class StrategyGlobalService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly strategyConnectionService =
    inject<StrategyConnectionService>(TYPES.strategyConnectionService);
  private readonly strategySchemaService = inject<StrategySchemaService>(
    TYPES.strategySchemaService
  );
  private readonly riskValidationService = inject<RiskValidationService>(
    TYPES.riskValidationService
  );
  private readonly strategyValidationService =
    inject<StrategyValidationService>(TYPES.strategyValidationService);
  private readonly methodContextService = inject<TMethodContextService>(
    TYPES.methodContextService
  );

  /**
   * Validates strategy and associated risk configuration.
   *
   * Memoized to avoid redundant validations for the same strategy.
   * Logs validation activity.
   * @param strategyName - Name of the strategy to validate
   * @returns Promise that resolves when validation is complete
   */
  private validate = memoize(
    ([strategyName]) => `${strategyName}`,
    async (strategyName: string) => {
      this.loggerService.log(METHOD_NAME_VALIDATE, {
        strategyName,
      });
      const strategySchema = this.strategySchemaService.get(strategyName);
      this.strategyValidationService.validate(
        strategyName,
        METHOD_NAME_VALIDATE
      );
      const riskName = strategySchema.riskName;
      riskName &&
        this.riskValidationService.validate(riskName, METHOD_NAME_VALIDATE);
    }
  );

  /**
   * Retrieves the currently active pending signal for the symbol.
   * If no active signal exists, returns null.
   * Used internally for monitoring TP/SL and time expiration.
   * 
   * @param symbol - Trading pair symbol
   * @param when - Timestamp for tick evaluation
   * @param backtest - Whether running in backtest mode
   * @returns Promise resolving to pending signal or null
   */
  public getPendingSignal = async (
    symbol: string,
    when: Date,
    backtest: boolean
  ): Promise<ISignalRow | null> => {
    this.loggerService.log("strategyGlobalService getPendingSignal", {
      symbol,
      when,
      backtest,
    });
    await this.validate(this.methodContextService.context.strategyName);
    return await ExecutionContextService.runInContext(
      async () => {
        return await this.strategyConnectionService.getPendingSignal();
      },
      {
        symbol,
        when,
        backtest,
      }
    );
  };


  /**
   * Checks signal status at a specific timestamp.
   *
   * Wraps strategy tick() with execution context containing symbol, timestamp,
   * and backtest mode flag.
   *
   * @param symbol - Trading pair symbol
   * @param when - Timestamp for tick evaluation
   * @param backtest - Whether running in backtest mode
   * @returns Discriminated union of tick result (idle, opened, active, closed)
   */
  public tick = async (
    symbol: string,
    when: Date,
    backtest: boolean
  ): Promise<IStrategyTickResult> => {
    this.loggerService.log("strategyGlobalService tick", {
      symbol,
      when,
      backtest,
    });
    await this.validate(this.methodContextService.context.strategyName);
    return await ExecutionContextService.runInContext(
      async () => {
        return await this.strategyConnectionService.tick();
      },
      {
        symbol,
        when,
        backtest,
      }
    );
  };

  /**
   * Runs fast backtest against candle array.
   *
   * Wraps strategy backtest() with execution context containing symbol,
   * timestamp, and backtest mode flag.
   *
   * @param symbol - Trading pair symbol
   * @param candles - Array of historical candles to test against
   * @param when - Starting timestamp for backtest
   * @param backtest - Whether running in backtest mode (typically true)
   * @returns Closed signal result with PNL
   */
  public backtest = async (
    symbol: string,
    candles: ICandleData[],
    when: Date,
    backtest: boolean
  ): Promise<IStrategyBacktestResult> => {
    this.loggerService.log("strategyGlobalService backtest", {
      symbol,
      candleCount: candles.length,
      when,
      backtest,
    });
    await this.validate(this.methodContextService.context.strategyName);
    return await ExecutionContextService.runInContext(
      async () => {
        return await this.strategyConnectionService.backtest(candles);
      },
      {
        symbol,
        when,
        backtest,
      }
    );
  };

  /**
   * Stops the strategy from generating new signals.
   *
   * Delegates to StrategyConnectionService.stop() to set internal flag.
   * Does not require execution context.
   *
   * @param strategyName - Name of strategy to stop
   * @returns Promise that resolves when stop flag is set
   */
  public stop = async (strategyName: StrategyName): Promise<void> => {
    this.loggerService.log("strategyGlobalService stop", {
      strategyName,
    });
    await this.validate(strategyName);
    return await this.strategyConnectionService.stop(strategyName);
  };

  /**
   * Clears the memoized ClientStrategy instance from cache.
   *
   * Delegates to StrategyConnectionService.clear() to remove strategy from cache.
   * Forces re-initialization of strategy on next operation.
   *
   * @param strategyName - Name of strategy to clear from cache
   */
  public clear = async (strategyName?: StrategyName): Promise<void> => {
    this.loggerService.log("strategyGlobalService clear", {
      strategyName,
    });
    if (strategyName) {
      await this.validate(strategyName);
    }
    return await this.strategyConnectionService.clear(strategyName);
  };
}

export default StrategyGlobalService;

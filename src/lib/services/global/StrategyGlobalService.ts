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
   * Memoized to avoid redundant validations for the same symbol-strategy pair.
   * Logs validation activity.
   * @param symbol - Trading pair symbol
   * @param strategyName - Name of the strategy to validate
   * @returns Promise that resolves when validation is complete
   */
  private validate = memoize(
    ([symbol, strategyName]) => `${symbol}:${strategyName}`,
    async (symbol: string, strategyName: string) => {
      this.loggerService.log(METHOD_NAME_VALIDATE, {
        symbol,
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
   * @param strategyName - Name of the strategy
   * @returns Promise resolving to pending signal or null
   */
  public getPendingSignal = async (
    symbol: string,
    strategyName: StrategyName
  ): Promise<ISignalRow | null> => {
    this.loggerService.log("strategyGlobalService getPendingSignal", {
      symbol,
      strategyName,
    });
    await this.validate(symbol, strategyName);
    return await this.strategyConnectionService.getPendingSignal(symbol, strategyName);
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
    const strategyName = this.methodContextService.context.strategyName;
    await this.validate(symbol, strategyName);
    return await ExecutionContextService.runInContext(
      async () => {
        return await this.strategyConnectionService.tick(symbol, strategyName);
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
    const strategyName = this.methodContextService.context.strategyName;
    await this.validate(symbol, strategyName);
    return await ExecutionContextService.runInContext(
      async () => {
        return await this.strategyConnectionService.backtest(symbol, strategyName, candles);
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
   * @param symbol - Trading pair symbol
   * @param strategyName - Name of strategy to stop
   * @returns Promise that resolves when stop flag is set
   */
  public stop = async (symbol: string, strategyName: StrategyName): Promise<void> => {
    this.loggerService.log("strategyGlobalService stop", {
      symbol,
      strategyName,
    });
    await this.validate(symbol, strategyName);
    return await this.strategyConnectionService.stop(symbol, strategyName);
  };

  /**
   * Clears the memoized ClientStrategy instance from cache.
   *
   * Delegates to StrategyConnectionService.clear() to remove strategy from cache.
   * Forces re-initialization of strategy on next operation.
   *
   * @param ctx - Optional context with symbol and strategyName (clears all if not provided)
   */
  public clear = async (ctx?: { symbol: string; strategyName: StrategyName }): Promise<void> => {
    this.loggerService.log("strategyGlobalService clear", {
      ctx,
    });
    if (ctx) {
      await this.validate(ctx.symbol, ctx.strategyName);
    }
    return await this.strategyConnectionService.clear(ctx);
  };
}

export default StrategyGlobalService;

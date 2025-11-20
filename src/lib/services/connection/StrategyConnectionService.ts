import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import { TExecutionContextService } from "../context/ExecutionContextService";
import { ICandleData } from "../../../interfaces/Exchange.interface";
import { memoize } from "functools-kit";
import ClientStrategy from "../../../client/ClientStrategy";
import {
  IStrategy,
  IStrategyBacktestResult,
  IStrategyTickResult,
  StrategyName,
} from "../../../interfaces/Strategy.interface";
import StrategySchemaService from "../schema/StrategySchemaService";
import ExchangeConnectionService from "./ExchangeConnectionService";
import { TMethodContextService } from "../context/MethodContextService";

/**
 * Connection service routing strategy operations to correct ClientStrategy instance.
 *
 * Routes all IStrategy method calls to the appropriate strategy implementation
 * based on methodContextService.context.strategyName. Uses memoization to cache
 * ClientStrategy instances for performance.
 *
 * Key features:
 * - Automatic strategy routing via method context
 * - Memoized ClientStrategy instances by strategyName
 * - Implements IStrategy interface
 * - Ensures initialization with waitForInit() before operations
 * - Handles both tick() (live) and backtest() operations
 *
 * @example
 * ```typescript
 * // Used internally by framework
 * const result = await strategyConnectionService.tick();
 * // Automatically routes to correct strategy based on methodContext
 * ```
 */
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

  /**
   * Retrieves memoized ClientStrategy instance for given strategy name.
   *
   * Creates ClientStrategy on first call, returns cached instance on subsequent calls.
   * Cache key is strategyName string.
   *
   * @param strategyName - Name of registered strategy schema
   * @returns Configured ClientStrategy instance
   */
  private getStrategy = memoize(
    (strategyName) => `${strategyName}`,
    (strategyName: StrategyName) => {
      const { getSignal, interval, callbacks } =
        this.strategySchemaService.get(strategyName);
      return new ClientStrategy({
        interval,
        execution: this.executionContextService,
        logger: this.loggerService,
        exchange: this.exchangeConnectionService,
        strategyName,
        getSignal,
        callbacks,
      });
    }
  );

  /**
   * Executes live trading tick for current strategy.
   *
   * Waits for strategy initialization before processing tick.
   * Evaluates current market conditions and returns signal state.
   *
   * @returns Promise resolving to tick result (idle, opened, active, closed)
   */
  public tick = async (): Promise<IStrategyTickResult> => {
    this.loggerService.log("strategyConnectionService tick");
    const strategy = await this.getStrategy(
      this.methodContextService.context.strategyName
    );
    await strategy.waitForInit();
    return await strategy.tick();
  };

  /**
   * Executes backtest for current strategy with provided candles.
   *
   * Waits for strategy initialization before processing candles.
   * Evaluates strategy signals against historical data.
   *
   * @param candles - Array of historical candle data to backtest
   * @returns Promise resolving to backtest result (signal or idle)
   */
  public backtest = async (
    candles: ICandleData[]
  ): Promise<IStrategyBacktestResult> => {
    this.loggerService.log("strategyConnectionService backtest");
    const strategy = await this.getStrategy(
      this.methodContextService.context.strategyName
    );
    await strategy.waitForInit();
    return await strategy.backtest(candles);
  };
}

export default StrategyConnectionService;

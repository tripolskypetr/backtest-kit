import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import { TExecutionContextService } from "../context/ExecutionContextService";
import { ICandleData } from "../../../interfaces/Exchange.interface";
import { memoize } from "functools-kit";
import ClientStrategy from "../../../client/ClientStrategy";
import {
  ISignalRow,
  IStrategy,
  IStrategyBacktestResult,
  IStrategyTickResult,
  StrategyName,
} from "../../../interfaces/Strategy.interface";
import StrategySchemaService from "../schema/StrategySchemaService";
import ExchangeConnectionService from "./ExchangeConnectionService";
import { TMethodContextService } from "../context/MethodContextService";
import {
  signalEmitter,
  signalBacktestEmitter,
  signalLiveEmitter,
} from "../../../config/emitters";
import { IRisk } from "../../../interfaces/Risk.interface";
import RiskConnectionService from "./RiskConnectionService";

const NOOP_RISK: IRisk = {
  checkSignal: () => Promise.resolve(true),
  addSignal: () => Promise.resolve(),
  removeSignal: () => Promise.resolve(),
}

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
  private readonly riskConnectionService = inject<RiskConnectionService>(TYPES.riskConnectionService); 
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
    ([strategyName]) => `${strategyName}`,
    (strategyName: StrategyName) => {
      const { riskName, getSignal, interval, callbacks } =
        this.strategySchemaService.get(strategyName);
      return new ClientStrategy({
        interval,
        execution: this.executionContextService,
        method: this.methodContextService,
        logger: this.loggerService,
        exchange: this.exchangeConnectionService,
        risk: riskName ? this.riskConnectionService.getRisk(riskName) : NOOP_RISK,
        riskName,
        strategyName,
        getSignal,
        callbacks,
      });
    }
  );

  /**
   * Retrieves the currently active pending signal for the strategy.
   * If no active signal exists, returns null.
   * Used internally for monitoring TP/SL and time expiration.
   * @returns Promise resolving to pending signal or null
   */
  public getPendingSignal = async (): Promise<ISignalRow | null> => {
    this.loggerService.log("strategyConnectionService getPendingSignal");
    const strategy = await this.getStrategy(
      this.methodContextService.context.strategyName
    );
    return await strategy.getPendingSignal();
  };

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
    const tick = await strategy.tick();
    {
      if (this.executionContextService.context.backtest) {
        await signalBacktestEmitter.next(tick);
      }
      if (!this.executionContextService.context.backtest) {
        await signalLiveEmitter.next(tick);
      }
      await signalEmitter.next(tick);
    }
    return tick;
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
    this.loggerService.log("strategyConnectionService backtest", {
      candleCount: candles.length,
    });
    const strategy = await this.getStrategy(
      this.methodContextService.context.strategyName
    );
    await strategy.waitForInit();
    const tick = await strategy.backtest(candles);
    {
      if (this.executionContextService.context.backtest) {
        await signalBacktestEmitter.next(tick);
      }
      await signalEmitter.next(tick);
    }
    return tick;
  };

  /**
   * Stops the specified strategy from generating new signals.
   *
   * Delegates to ClientStrategy.stop() which sets internal flag to prevent
   * getSignal from being called on subsequent ticks.
   *
   * @param strategyName - Name of strategy to stop
   * @returns Promise that resolves when stop flag is set
   */
  public stop = async (strategyName: StrategyName): Promise<void> => {
    this.loggerService.log("strategyConnectionService stop", {
      strategyName,
    });
    const strategy = this.getStrategy(strategyName);
    await strategy.stop();
  };

  /**
   * Clears the memoized ClientStrategy instance from cache.
   *
   * Forces re-initialization of strategy on next getStrategy call.
   * Useful for resetting strategy state or releasing resources.
   *
   * @param strategyName - Name of strategy to clear from cache
   */
  public clear = async (strategyName: StrategyName): Promise<void> => {
    this.loggerService.log("strategyConnectionService clear", {
      strategyName,
    });
    this.getStrategy.clear(strategyName);
  };
}

export default StrategyConnectionService;

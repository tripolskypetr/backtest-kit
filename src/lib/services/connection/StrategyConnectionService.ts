import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import { TExecutionContextService } from "../context/ExecutionContextService";
import { ICandleData } from "../../../interfaces/Exchange.interface";
import { memoize } from "functools-kit";
import ClientStrategy from "../../../client/ClientStrategy";
import {
  ISignalRow,
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
import { IRisk, RiskName } from "../../../interfaces/Risk.interface";
import RiskConnectionService from "./RiskConnectionService";
import { PartialConnectionService } from "./PartialConnectionService";
import { MergeRisk } from "../../../classes/Risk";

const NOOP_RISK: IRisk = {
  checkSignal: () => Promise.resolve(true),
  addSignal: () => Promise.resolve(),
  removeSignal: () => Promise.resolve(),
};

const GET_RISK_FN = (
  dto: {
    riskName: RiskName;
    riskList: RiskName[];
  },
  self: StrategyConnectionService
) => {
  const hasRiskName = !!dto.riskName;
  const hasRiskList = !!(dto.riskList?.length);
  
  // Нет ни riskName, ни riskList
  if (!hasRiskName && !hasRiskList) {
    return NOOP_RISK;
  }
  
  // Есть только riskName (без riskList)
  if (hasRiskName && !hasRiskList) {
    return self.riskConnectionService.getRisk(dto.riskName);
  }
  
  // Есть только riskList (без riskName)
  if (!hasRiskName && hasRiskList) {
    return new MergeRisk(
      dto.riskList.map((riskName) =>
        self.riskConnectionService.getRisk(riskName)
      )
    );
  }
  
  // Есть и riskName, и riskList - объединяем (riskName в начало)
  return new MergeRisk([
    self.riskConnectionService.getRisk(dto.riskName),
    ...dto.riskList.map((riskName) => self.riskConnectionService.getRisk(riskName))
  ]);
};

/**
 * Connection service routing strategy operations to correct ClientStrategy instance.
 *
 * Routes all IStrategy method calls to the appropriate strategy implementation
 * based on symbol-strategy pairs. Uses memoization to cache
 * ClientStrategy instances for performance.
 *
 * Key features:
 * - Automatic strategy routing via symbol-strategy pairs
 * - Memoized ClientStrategy instances by symbol:strategyName
 * - Ensures initialization with waitForInit() before operations
 * - Handles both tick() (live) and backtest() operations
 *
 * @example
 * ```typescript
 * // Used internally by framework
 * const result = await strategyConnectionService.tick(symbol, strategyName);
 * // Routes to correct strategy instance for symbol-strategy pair
 * ```
 */
export class StrategyConnectionService {
  public readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  public readonly executionContextService = inject<TExecutionContextService>(
    TYPES.executionContextService
  );
  public readonly strategySchemaService = inject<StrategySchemaService>(
    TYPES.strategySchemaService
  );
  public readonly riskConnectionService = inject<RiskConnectionService>(
    TYPES.riskConnectionService
  );
  public readonly exchangeConnectionService = inject<ExchangeConnectionService>(
    TYPES.exchangeConnectionService
  );
  public readonly methodContextService = inject<TMethodContextService>(
    TYPES.methodContextService
  );
  public readonly partialConnectionService = inject<PartialConnectionService>(
    TYPES.partialConnectionService
  );

  /**
   * Retrieves memoized ClientStrategy instance for given symbol-strategy pair.
   *
   * Creates ClientStrategy on first call, returns cached instance on subsequent calls.
   * Cache key is symbol:strategyName string.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Name of registered strategy schema
   * @returns Configured ClientStrategy instance
   */
  private getStrategy = memoize(
    ([symbol, strategyName]) => `${symbol}:${strategyName}`,
    (symbol: string, strategyName: StrategyName) => {
      const {
        riskName = "",
        riskList = [],
        getSignal,
        interval,
        callbacks,
      } = this.strategySchemaService.get(strategyName);
      return new ClientStrategy({
        symbol,
        interval,
        execution: this.executionContextService,
        method: this.methodContextService,
        logger: this.loggerService,
        partial: this.partialConnectionService,
        exchange: this.exchangeConnectionService,
        risk: GET_RISK_FN(
          {
            riskName,
            riskList,
          },
          this
        ),
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
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Name of strategy to get pending signal for
   *
   * @returns Promise resolving to pending signal or null
   */
  public getPendingSignal = async (
    symbol: string,
    strategyName: StrategyName
  ): Promise<ISignalRow | null> => {
    this.loggerService.log("strategyConnectionService getPendingSignal", {
      symbol,
      strategyName,
    });
    const strategy = this.getStrategy(symbol, strategyName);
    return await strategy.getPendingSignal(symbol, strategyName);
  };

  /**
   * Retrieves the stopped state of the strategy.
   *
   * Delegates to the underlying strategy instance to check if it has been
   * marked as stopped and should cease operation.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Name of the strategy
   * @returns Promise resolving to true if strategy is stopped, false otherwise
   */
  public getStopped = async (
    symbol: string,
    strategyName: StrategyName
  ): Promise<boolean> => {
    this.loggerService.log("strategyConnectionService getStopped", {
      symbol,
      strategyName,
    });
    const strategy = this.getStrategy(symbol, strategyName);
    return await strategy.getStopped(symbol, strategyName);
  };

  /**
   * Executes live trading tick for current strategy.
   *
   * Waits for strategy initialization before processing tick.
   * Evaluates current market conditions and returns signal state.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Name of strategy to tick
   * @returns Promise resolving to tick result (idle, opened, active, closed)
   */
  public tick = async (
    symbol: string,
    strategyName: StrategyName
  ): Promise<IStrategyTickResult> => {
    this.loggerService.log("strategyConnectionService tick", {
      symbol,
      strategyName,
    });
    const strategy = this.getStrategy(symbol, strategyName);
    await strategy.waitForInit();
    const tick = await strategy.tick(symbol, strategyName);
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
   * @param symbol - Trading pair symbol
   * @param strategyName - Name of strategy to backtest
   * @param candles - Array of historical candle data to backtest
   * @returns Promise resolving to backtest result (signal or idle)
   */
  public backtest = async (
    symbol: string,
    strategyName: StrategyName,
    candles: ICandleData[]
  ): Promise<IStrategyBacktestResult> => {
    this.loggerService.log("strategyConnectionService backtest", {
      symbol,
      strategyName,
      candleCount: candles.length,
    });
    const strategy = this.getStrategy(symbol, strategyName);
    await strategy.waitForInit();
    const tick = await strategy.backtest(symbol, strategyName, candles);
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
   * @param symbol - Trading pair symbol
   * @param strategyName - Name of strategy to stop
   * @returns Promise that resolves when stop flag is set
   */
  public stop = async (
    ctx: { symbol: string; strategyName: StrategyName },
    backtest: boolean
  ): Promise<void> => {
    this.loggerService.log("strategyConnectionService stop", {
      ctx,
    });
    const strategy = this.getStrategy(ctx.symbol, ctx.strategyName);
    await strategy.stop(ctx.symbol, ctx.strategyName, backtest);
  };

  /**
   * Clears the memoized ClientStrategy instance from cache.
   *
   * Forces re-initialization of strategy on next getStrategy call.
   * Useful for resetting strategy state or releasing resources.
   *
   * @param ctx - Optional context with symbol and strategyName (clears all if not provided)
   */
  public clear = async (ctx?: {
    symbol: string;
    strategyName: StrategyName;
  }): Promise<void> => {
    this.loggerService.log("strategyConnectionService clear", {
      ctx,
    });
    if (ctx) {
      const key = `${ctx.symbol}:${ctx.strategyName}`;
      this.getStrategy.clear(key);
    } else {
      this.getStrategy.clear();
    }
  };
}

export default StrategyConnectionService;

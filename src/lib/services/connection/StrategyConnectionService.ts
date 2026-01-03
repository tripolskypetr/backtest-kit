import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import { TExecutionContextService } from "../context/ExecutionContextService";
import { ICandleData } from "../../../interfaces/Exchange.interface";
import { memoize } from "functools-kit";
import ClientStrategy from "../../../client/ClientStrategy";
import {
  ISignalRow,
  IScheduledSignalRow,
  IStrategyBacktestResult,
  IStrategyTickResult,
  StrategyName,
} from "../../../interfaces/Strategy.interface";
import StrategySchemaService from "../schema/StrategySchemaService";
import ExchangeConnectionService from "./ExchangeConnectionService";
import {
  signalEmitter,
  signalBacktestEmitter,
  signalLiveEmitter,
  pingSubject,
} from "../../../config/emitters";
import { IRisk, RiskName } from "../../../interfaces/Risk.interface";
import RiskConnectionService from "./RiskConnectionService";
import { PartialConnectionService } from "./PartialConnectionService";
import { MergeRisk } from "../../../classes/Risk";

/**
 * No-operation IRisk implementation.
 * Always allows signals and performs no actions.
 */
const NOOP_RISK: IRisk = {
  checkSignal: () => Promise.resolve(true),
  addSignal: () => Promise.resolve(),
  removeSignal: () => Promise.resolve(),
};

/**
 * Determines the appropriate IRisk instance based on provided riskName and riskList.
 * @param dto - Object containing riskName and riskList
 * @param backtest - Whether running in backtest mode
 * @param exchangeName - Exchange name for risk isolation
 * @param frameName - Frame name for risk isolation
 * @param self - Reference to StrategyConnectionService instance
 * @returns Configured IRisk instance (single or merged)
 */
const GET_RISK_FN = (
  dto: {
    riskName: RiskName;
    riskList: RiskName[];
  },
  backtest: boolean,
  exchangeName: string,
  frameName: string,
  self: StrategyConnectionService
) => {
  const hasRiskName = !!dto.riskName;
  const hasRiskList = !!dto.riskList?.length;

  // Нет ни riskName, ни riskList
  if (!hasRiskName && !hasRiskList) {
    return NOOP_RISK;
  }

  // Есть только riskName (без riskList)
  if (hasRiskName && !hasRiskList) {
    return self.riskConnectionService.getRisk(dto.riskName, exchangeName, frameName, backtest);
  }

  // Есть только riskList (без riskName)
  if (!hasRiskName && hasRiskList) {
    return new MergeRisk(
      dto.riskList.map((riskName) =>
        self.riskConnectionService.getRisk(riskName, exchangeName, frameName, backtest)
      )
    );
  }

  // Есть и riskName, и riskList - объединяем (riskName в начало)
  return new MergeRisk([
    self.riskConnectionService.getRisk(dto.riskName, exchangeName, frameName, backtest),
    ...dto.riskList.map((riskName) =>
      self.riskConnectionService.getRisk(riskName, exchangeName, frameName, backtest)
    ),
  ]);
};

/**
 * Creates a unique key for memoizing ClientStrategy instances.
 * Key format: "symbol:strategyName:exchangeName:frameName:backtest" or "symbol:strategyName:exchangeName:live"
 * @param symbol - Trading pair symbol
 * @param strategyName - Name of the strategy
 * @param exchangeName - Exchange name
 * @param frameName - Frame name (empty string for live)
 * @param backtest - Whether running in backtest mode
 * @returns Unique string key for memoization
 */
const CREATE_KEY_FN = (
  symbol: string,
  strategyName: StrategyName,
  exchangeName: string,
  frameName: string,
  backtest: boolean
): string => {
  const parts = [symbol, strategyName, exchangeName];
  if (frameName) parts.push(frameName);
  parts.push(backtest ? "backtest" : "live");
  return parts.join(":");
};

/**
 * Callback function for emitting ping events to pingSubject.
 *
 * Called by ClientStrategy when a scheduled signal is being monitored every minute.
 * Emits PingContract event to all subscribers.
 *
 * @param symbol - Trading pair symbol
 * @param strategyName - Strategy name that is monitoring this scheduled signal
 * @param exchangeName - Exchange name where this scheduled signal is being executed
 * @param data - Scheduled signal row data
 * @param backtest - True if backtest mode
 * @param timestamp - Event timestamp in milliseconds
 */
const COMMIT_PING_FN = async (
  symbol: string,
  strategyName: string,
  exchangeName: string,
  data: IScheduledSignalRow,
  backtest: boolean,
  timestamp: number
) =>
  await pingSubject.next({
    symbol,
    strategyName,
    exchangeName,
    data,
    backtest,
    timestamp,
  });

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
  public readonly partialConnectionService = inject<PartialConnectionService>(
    TYPES.partialConnectionService
  );

  /**
   * Retrieves memoized ClientStrategy instance for given symbol-strategy pair with exchange and frame isolation.
   *
   * Creates ClientStrategy on first call, returns cached instance on subsequent calls.
   * Cache key includes exchangeName and frameName for proper isolation.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Name of registered strategy schema
   * @param exchangeName - Exchange name
   * @param frameName - Frame name (empty string for live)
   * @param backtest - Whether running in backtest mode
   * @returns Configured ClientStrategy instance
   */
  private getStrategy = memoize(
    ([symbol, strategyName, exchangeName, frameName, backtest]) =>
      CREATE_KEY_FN(symbol, strategyName, exchangeName, frameName, backtest),
    (symbol: string, strategyName: StrategyName, exchangeName: string, frameName: string, backtest: boolean) => {
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
        method: { context: { strategyName, exchangeName, frameName } },
        logger: this.loggerService,
        partial: this.partialConnectionService,
        exchange: this.exchangeConnectionService,
        risk: GET_RISK_FN(
          {
            riskName,
            riskList,
          },
          backtest,
          exchangeName,
          frameName,
          this
        ),
        riskName,
        strategyName,
        getSignal,
        callbacks,
        onPing: COMMIT_PING_FN,
      });
    }
  );

  /**
   * Retrieves the currently active pending signal for the strategy.
   * If no active signal exists, returns null.
   * Used internally for monitoring TP/SL and time expiration.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, frameName
   *
   * @returns Promise resolving to pending signal or null
   */
  public getPendingSignal = async (
    backtest: boolean,
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: string; frameName: string }
  ): Promise<ISignalRow | null> => {
    this.loggerService.log("strategyConnectionService getPendingSignal", {
      symbol,
      context,
      backtest,
    });
    const strategy = this.getStrategy(symbol, context.strategyName, context.exchangeName, context.frameName, backtest);
    return await strategy.getPendingSignal(symbol, context.strategyName);
  };

  /**
   * Retrieves the currently active scheduled signal for the strategy.
   * If no scheduled signal exists, returns null.
   * Used internally for monitoring scheduled signal activation.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, frameName
   *
   * @returns Promise resolving to scheduled signal or null
   */
  public getScheduledSignal = async (
    backtest: boolean,
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: string; frameName: string }
  ): Promise<IScheduledSignalRow | null> => {
    this.loggerService.log("strategyConnectionService getScheduledSignal", {
      symbol,
      context,
      backtest,
    });
    const strategy = this.getStrategy(symbol, context.strategyName, context.exchangeName, context.frameName, backtest);
    return await strategy.getScheduledSignal(symbol, context.strategyName);
  };

  /**
   * Retrieves the stopped state of the strategy.
   *
   * Delegates to the underlying strategy instance to check if it has been
   * marked as stopped and should cease operation.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise resolving to true if strategy is stopped, false otherwise
   */
  public getStopped = async (
    backtest: boolean,
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: string; frameName: string }
  ): Promise<boolean> => {
    this.loggerService.log("strategyConnectionService getStopped", {
      symbol,
      context,
      backtest,
    });
    const strategy = this.getStrategy(symbol, context.strategyName, context.exchangeName, context.frameName, backtest);
    return await strategy.getStopped(symbol, context.strategyName);
  };

  /**
   * Executes live trading tick for current strategy.
   *
   * Waits for strategy initialization before processing tick.
   * Evaluates current market conditions and returns signal state.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise resolving to tick result (idle, opened, active, closed)
   */
  public tick = async (
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: string; frameName: string }
  ): Promise<IStrategyTickResult> => {
    const backtest = this.executionContextService.context.backtest;
    this.loggerService.log("strategyConnectionService tick", {
      symbol,
      context,
      backtest,
    });
    const strategy = this.getStrategy(symbol, context.strategyName, context.exchangeName, context.frameName, backtest);
    await strategy.waitForInit();
    const tick = await strategy.tick(symbol, context.strategyName);
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
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @param candles - Array of historical candle data to backtest
   * @returns Promise resolving to backtest result (signal or idle)
   */
  public backtest = async (
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: string; frameName: string },
    candles: ICandleData[]
  ): Promise<IStrategyBacktestResult> => {
    const backtest = this.executionContextService.context.backtest;
    this.loggerService.log("strategyConnectionService backtest", {
      symbol,
      context,
      candleCount: candles.length,
      backtest,
    });
    const strategy = this.getStrategy(symbol, context.strategyName, context.exchangeName, context.frameName, backtest);
    await strategy.waitForInit();
    const tick = await strategy.backtest(symbol, context.strategyName, candles);
    {
      // Wrap tick result with frameName for markdown services
      const tickWithFrame = { ...tick, frameName: context.frameName };
      if (this.executionContextService.context.backtest) {
        await signalBacktestEmitter.next(tickWithFrame);
      }
      await signalEmitter.next(tickWithFrame);
    }
    return tick;
  };

  /**
   * Stops the specified strategy from generating new signals.
   *
   * Delegates to ClientStrategy.stop() which sets internal flag to prevent
   * getSignal from being called on subsequent ticks.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param ctx - Context with strategyName, exchangeName, frameName
   * @returns Promise that resolves when stop flag is set
   */
  public stop = async (
    backtest: boolean,
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: string; frameName: string },
  ): Promise<void> => {
    this.loggerService.log("strategyConnectionService stop", {
      symbol,
      context,
    });
    const strategy = this.getStrategy(symbol, context.strategyName, context.exchangeName, context.frameName, backtest);
    await strategy.stop(symbol, context.strategyName, backtest);
  };

  /**
   * Clears the memoized ClientStrategy instance from cache.
   *
   * Forces re-initialization of strategy on next getStrategy call.
   * Useful for resetting strategy state or releasing resources.
   *
   * @param payload - Optional payload with symbol, context and backtest flag (clears all if not provided)
   */
  public clear = async (
    payload?: {
      symbol: string;
      strategyName: StrategyName;
      exchangeName: string;
      frameName: string;
      backtest: boolean;
    }
  ): Promise<void> => {
    this.loggerService.log("strategyConnectionService clear", {
      payload,
    });
    if (payload) {
      const key = CREATE_KEY_FN(payload.symbol, payload.strategyName, payload.exchangeName, payload.frameName, payload.backtest);
      this.getStrategy.clear(key);
    } else {
      this.getStrategy.clear();
    }
  };

  /**
   * Cancels the scheduled signal for the specified strategy.
   *
   * Delegates to ClientStrategy.cancel() which clears the scheduled signal
   * without stopping the strategy or affecting pending signals.
   *
   * Note: Cancelled event will be emitted on next tick() call when strategy
   * detects the scheduled signal was cancelled.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param ctx - Context with strategyName, exchangeName, frameName
   * @param cancelId - Optional cancellation ID for user-initiated cancellations
   * @returns Promise that resolves when scheduled signal is cancelled
   */
  public cancel = async (
    backtest: boolean,
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: string; frameName: string },
    cancelId?: string
  ): Promise<void> => {
    this.loggerService.log("strategyConnectionService cancel", {
      symbol,
      context,
      cancelId,
    });
    const strategy = this.getStrategy(symbol, context.strategyName, context.exchangeName, context.frameName, backtest);
    await strategy.cancel(symbol, context.strategyName, backtest, cancelId);
  };
}

export default StrategyConnectionService;

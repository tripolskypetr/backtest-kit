import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import { TExecutionContextService } from "../context/ExecutionContextService";
import { ExchangeName, ICandleData } from "../../../interfaces/Exchange.interface";
import { memoize, trycatch, errorData, getErrorMessage } from "functools-kit";
import ClientStrategy from "../../../client/ClientStrategy";
import {
  ISignalRow,
  IScheduledSignalRow,
  IStrategyBacktestResult,
  IStrategyTickResult,
  StrategyName,
  IStrategy,
} from "../../../interfaces/Strategy.interface";
import StrategySchemaService from "../schema/StrategySchemaService";
import ExchangeConnectionService from "./ExchangeConnectionService";
import {
  signalEmitter,
  signalBacktestEmitter,
  signalLiveEmitter,
  schedulePingSubject,
  activePingSubject,
  errorEmitter,
} from "../../../config/emitters";
import { IRisk, RiskName } from "../../../interfaces/Risk.interface";
import RiskConnectionService from "./RiskConnectionService";
import { PartialConnectionService } from "./PartialConnectionService";
import { BreakevenConnectionService } from "./BreakevenConnectionService";
import { MergeRisk } from "../../../classes/Risk";
import { TMethodContextService } from "../context/MethodContextService";
import { FrameName } from "../../../interfaces/Frame.interface";
import ActionCoreService from "../core/ActionCoreService";
import backtest from "../../../lib";

/**
 * Mapping of RiskName to IRisk instances.
 * Used for constructing merged risks.
 */
type RiskMap = Record<RiskName, IRisk>;

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
  exchangeName: ExchangeName,
  frameName: FrameName,
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
      dto.riskList.reduce<RiskMap>((acc, riskName) => {
        acc[riskName] = self.riskConnectionService.getRisk(riskName, exchangeName, frameName, backtest);
        return acc;
      }, {})
    );
  }

  // Есть и riskName, и riskList - объединяем (riskName в начало)
  return new MergeRisk({
    [dto.riskName]: self.riskConnectionService.getRisk(dto.riskName, exchangeName, frameName, backtest),
    ...dto.riskList.reduce<RiskMap>((acc, riskName) => {
      if (riskName === dto.riskName) {
        return acc;
      }
      acc[riskName] = self.riskConnectionService.getRisk(riskName, exchangeName, frameName, backtest);
      return acc;
    }, {})
  });
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
  exchangeName: ExchangeName,
  frameName: FrameName,
  backtest: boolean
): string => {
  const parts = [symbol, strategyName, exchangeName];
  if (frameName) parts.push(frameName);
  parts.push(backtest ? "backtest" : "live");
  return parts.join(":");
};

/**
 * Creates a callback function for emitting schedule ping events to pingSubject.
 *
 * Called by ClientStrategy when a scheduled signal is being monitored every minute.
 * Emits PingContract event to all subscribers and calls ActionCoreService.
 *
 * @param self - Reference to StrategyConnectionService instance
 * @returns Callback function for schedule ping events
 */
const CREATE_COMMIT_SCHEDULE_PING_FN = (self: StrategyConnectionService) => trycatch(
  async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    data: IScheduledSignalRow,
    backtest: boolean,
    timestamp: number
  ): Promise<void> => {
    const event = {
      symbol,
      strategyName,
      exchangeName,
      data,
      backtest,
      timestamp,
    };
    await schedulePingSubject.next(event);
    await self.actionCoreService.pingScheduled(backtest, event, { strategyName, exchangeName, frameName: data.frameName });
  },
  {
    fallback: (error) => {
      const message = "StrategyConnectionService CREATE_COMMIT_SCHEDULE_PING_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
    defaultValue: null,
  }
);

/**
 * Creates a callback function for emitting active ping events.
 *
 * Called by ClientStrategy when an active pending signal is being monitored every minute.
 * Placeholder for future activePingSubject implementation.
 *
 * @param self - Reference to StrategyConnectionService instance
 * @returns Callback function for active ping events
 */
const CREATE_COMMIT_ACTIVE_PING_FN = (self: StrategyConnectionService) => trycatch(
  async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    data: ISignalRow,
    backtest: boolean,
    timestamp: number
  ): Promise<void> => {
    const event = {
      symbol,
      strategyName,
      exchangeName,
      data,
      backtest,
      timestamp,
    };
    await activePingSubject.next(event);
    await self.actionCoreService.pingActive(backtest, event, { strategyName, exchangeName, frameName: data.frameName });
  },
  {
    fallback: (error) => {
      const message = "StrategyConnectionService CREATE_COMMIT_ACTIVE_PING_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
    defaultValue: null,
  }
);

/**
 * Creates a callback function for emitting init events.
 *
 * Called by ClientStrategy when it has finished initialization.
 * Calls ActionCoreService to notify all registered actions.
 *
 * @param self - Reference to StrategyConnectionService instance
 * @returns Callback function for init events
 */
const CREATE_COMMIT_INIT_FN = (self: StrategyConnectionService) => trycatch(
  async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean
  ): Promise<void> => {
    await self.actionCoreService.initFn(backtest, symbol, { strategyName, exchangeName, frameName });
  },
  {
    fallback: (error) => {
      const message = "StrategyConnectionService CREATE_COMMIT_INIT_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
    defaultValue: null,
  }
);

/**
 * Creates a callback function for emitting dispose events.
 *
 * Called by ClientStrategy when it is being disposed.
 * Calls ActionCoreService to notify all registered actions.
 *
 * @param self - Reference to StrategyConnectionService instance
 * @returns Callback function for dispose events
 */
const CREATE_COMMIT_DISPOSE_FN = (self: StrategyConnectionService) => trycatch(
  async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean
  ): Promise<void> => {
    await self.actionCoreService.dispose(backtest, symbol, { strategyName, exchangeName, frameName });
  },
  {
    fallback: (error) => {
      const message = "StrategyConnectionService CREATE_COMMIT_DISPOSE_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      backtest.loggerService.warn(message, payload);
      console.warn(message, payload);
      errorEmitter.next(error);
    },
    defaultValue: null,
  }
);

/**
 * Type definition for strategy methods.
 * Maps all keys of IStrategy to any type.
 * Used for dynamic method routing in StrategyConnectionService.
 */
type TStrategy = {
  [key in keyof IStrategy]: any;
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
export class StrategyConnectionService implements TStrategy {
  public readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  public readonly executionContextService = inject<TExecutionContextService>(
    TYPES.executionContextService
  );
  public readonly methodContextService = inject<TMethodContextService>(TYPES.methodContextService);
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
  public readonly breakevenConnectionService = inject<BreakevenConnectionService>(
    TYPES.breakevenConnectionService
  );
  public readonly actionCoreService = inject<ActionCoreService>(
    TYPES.actionCoreService
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
    (symbol: string, strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean) => {
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
        exchangeName,
        frameName,
        backtest,
        execution: this.executionContextService,
        method: this.methodContextService,
        logger: this.loggerService,
        partial: this.partialConnectionService,
        breakeven: this.breakevenConnectionService,
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
        onInit: CREATE_COMMIT_INIT_FN(this),
        onSchedulePing: CREATE_COMMIT_SCHEDULE_PING_FN(this),
        onActivePing: CREATE_COMMIT_ACTIVE_PING_FN(this),
        onDispose: CREATE_COMMIT_DISPOSE_FN(this),
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
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<ISignalRow | null> => {
    this.loggerService.log("strategyConnectionService getPendingSignal", {
      symbol,
      context,
      backtest,
    });
    const strategy = this.getStrategy(symbol, context.strategyName, context.exchangeName, context.frameName, backtest);
    return await strategy.getPendingSignal(symbol);
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
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<IScheduledSignalRow | null> => {
    this.loggerService.log("strategyConnectionService getScheduledSignal", {
      symbol,
      context,
      backtest,
    });
    const strategy = this.getStrategy(symbol, context.strategyName, context.exchangeName, context.frameName, backtest);
    return await strategy.getScheduledSignal(symbol);
  };

  /**
   * Checks if breakeven threshold has been reached for the current pending signal.
   *
   * Uses the same formula as BREAKEVEN_FN to determine if price has moved far enough
   * to cover transaction costs and allow breakeven to be set.
   *
   * Delegates to ClientStrategy.getBreakeven() with current execution context.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param currentPrice - Current market price to check against threshold
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise<boolean> - true if breakeven threshold reached, false otherwise
   *
   * @example
   * ```typescript
   * // Check if breakeven is available for LONG position (entry=100, threshold=0.4%)
   * const canBreakeven = await strategyConnectionService.getBreakeven(
   *   false,
   *   "BTCUSDT", 
   *   100.5,
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "" }
   * );
   * // Returns true (price >= 100.4)
   *
   * if (canBreakeven) {
   *   await strategyConnectionService.breakeven(false, "BTCUSDT", 100.5, context);
   * }
   * ```
   */
  public getBreakeven = async (
    backtest: boolean,
    symbol: string,
    currentPrice: number,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<boolean> => {
    this.loggerService.log("strategyConnectionService getBreakeven", {
      symbol,
      context,
      currentPrice,
      backtest,
    });
    const strategy = this.getStrategy(symbol, context.strategyName, context.exchangeName, context.frameName, backtest);
    return await strategy.getBreakeven(symbol, currentPrice);
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
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<boolean> => {
    this.loggerService.log("strategyConnectionService getStopped", {
      symbol,
      context,
      backtest,
    });
    const strategy = this.getStrategy(symbol, context.strategyName, context.exchangeName, context.frameName, backtest);
    return await strategy.getStopped(symbol);
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
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
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
        await this.actionCoreService.signalBacktest(backtest, tick, context);
      }
      if (!this.executionContextService.context.backtest) {
        await signalLiveEmitter.next(tick);
        await this.actionCoreService.signalLive(backtest, tick, context);
      }
      await signalEmitter.next(tick);
      await this.actionCoreService.signal(backtest, tick, context);
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
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
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
      if (this.executionContextService.context.backtest) {
        await signalBacktestEmitter.next(tick);
        await this.actionCoreService.signalBacktest(backtest, tick, context);
      }
      if (!this.executionContextService.context.backtest) {
        await signalLiveEmitter.next(tick);
        await this.actionCoreService.signalLive(backtest, tick, context);
      }
      await signalEmitter.next(tick);
      await this.actionCoreService.signal(backtest, tick, context);
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
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
  ): Promise<void> => {
    this.loggerService.log("strategyConnectionService stop", {
      symbol,
      context,
    });
    const strategy = this.getStrategy(symbol, context.strategyName, context.exchangeName, context.frameName, backtest);
    await strategy.stop(symbol, backtest);
  };

  /**
   * Disposes the ClientStrategy instance for the given context.
   *
   * Calls dispose callback, then removes strategy from cache.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, frameName
   */
  public dispose = async (
    backtest: boolean,
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<void> => {
    this.loggerService.log("strategyConnectionService dispose", {
      symbol,
      context,
      backtest,
    });
    await this.clear({ symbol, ...context, backtest });
  };

  /**
   * Clears the memoized ClientStrategy instance from cache.
   *
   * If payload is provided, disposes the specific strategy instance.
   * If no payload is provided, clears all strategy instances.
   *
   * @param payload - Optional payload with symbol, context and backtest flag (clears all if not provided)
   */
  public clear = async (
    payload?: {
      symbol: string;
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
      backtest: boolean;
    }
  ): Promise<void> => {
    this.loggerService.log("strategyConnectionService clear", {
      payload,
    });
    if (!payload) {
      const strategies = this.getStrategy.values();
      this.getStrategy.clear();
      // Dispose all strategies
      for (const strategy of strategies) {
        await strategy.dispose();
      }
      return;
    }
    const key = CREATE_KEY_FN(payload.symbol, payload.strategyName, payload.exchangeName, payload.frameName, payload.backtest);
    if (!this.getStrategy.has(key)) {
      return;
    }
    const strategy = this.getStrategy(payload.symbol, payload.strategyName, payload.exchangeName, payload.frameName, payload.backtest);
    this.getStrategy.clear(key);
    // Call dispose on strategy instance
    await strategy.dispose();
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
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    cancelId?: string
  ): Promise<void> => {
    this.loggerService.log("strategyConnectionService cancel", {
      symbol,
      context,
      cancelId,
    });
    const strategy = this.getStrategy(symbol, context.strategyName, context.exchangeName, context.frameName, backtest);
    await strategy.cancel(symbol, backtest, cancelId);
  };

  /**
   * Executes partial close at profit level (moving toward TP).
   *
   * Closes a percentage of the pending position at the current price, recording it as a "profit" type partial.
   * The partial close is tracked in `_partial` array for weighted PNL calculation when position fully closes.
   *
   * Delegates to ClientStrategy.partialProfit() with current execution context.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @param percentToClose - Percentage of position to close (0-100, absolute value)
   * @param currentPrice - Current market price for this partial close
   * @returns Promise<boolean> - true if partial close executed, false if skipped
   *
   * @example
   * ```typescript
   * // Close 30% of position at profit
   * const success = await strategyConnectionService.partialProfit(
   *   false,
   *   "BTCUSDT",
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "" },
   *   30,
   *   45000
   * );
   * if (success) {
   *   console.log('Partial profit executed');
   * }
   * ```
   */
  public partialProfit = async (
    backtest: boolean,
    symbol: string,
    percentToClose: number,
    currentPrice: number,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
  ): Promise<boolean> => {
    this.loggerService.log("strategyConnectionService partialProfit", {
      symbol,
      context,
      percentToClose,
      currentPrice,
      backtest,
    });
    const strategy = this.getStrategy(symbol, context.strategyName, context.exchangeName, context.frameName, backtest);
    return await strategy.partialProfit(symbol, percentToClose, currentPrice, backtest);
  };

  /**
   * Executes partial close at loss level (moving toward SL).
   *
   * Closes a percentage of the pending position at the current price, recording it as a "loss" type partial.
   * The partial close is tracked in `_partial` array for weighted PNL calculation when position fully closes.
   *
   * Delegates to ClientStrategy.partialLoss() with current execution context.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @param percentToClose - Percentage of position to close (0-100, absolute value)
   * @param currentPrice - Current market price for this partial close
   * @returns Promise<boolean> - true if partial close executed, false if skipped
   *
   * @example
   * ```typescript
   * // Close 40% of position at loss
   * const success = await strategyConnectionService.partialLoss(
   *   false,
   *   "BTCUSDT",
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "" },
   *   40,
   *   38000
   * );
   * if (success) {
   *   console.log('Partial loss executed');
   * }
   * ```
   */
  public partialLoss = async (
    backtest: boolean,
    symbol: string,
    percentToClose: number,
    currentPrice: number,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
  ): Promise<boolean> => {
    this.loggerService.log("strategyConnectionService partialLoss", {
      symbol,
      context,
      percentToClose,
      currentPrice,
      backtest,
    });
    const strategy = this.getStrategy(symbol, context.strategyName, context.exchangeName, context.frameName, backtest);
    return await strategy.partialLoss(symbol, percentToClose, currentPrice, backtest);
  };

  /**
   * Adjusts the trailing stop-loss distance for an active pending signal.
   *
   * Updates the stop-loss distance by a percentage adjustment relative to the original SL distance.
   * Positive percentShift tightens the SL (reduces distance), negative percentShift loosens it.
   *
   * Delegates to ClientStrategy.trailingStop() with current execution context.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param percentShift - Percentage adjustment to SL distance (-100 to 100)
   * @param currentPrice - Current market price to check for intrusion
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise that resolves when trailing SL is updated
   *
   * @example
   * ```typescript
   * // LONG: entry=100, originalSL=90, distance=10%, currentPrice=102
   * // Tighten stop by 50%: newSL = 100 - 5% = 95
   * await strategyConnectionService.trailingStop(
   *   false,
   *   "BTCUSDT",
   *   -50,
   *   102,
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "" }
   * );
   * ```
   */
  public trailingStop = async (
    backtest: boolean,
    symbol: string,
    percentShift: number,
    currentPrice: number,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
  ): Promise<boolean> => {
    this.loggerService.log("strategyConnectionService trailingStop", {
      symbol,
      context,
      percentShift,
      currentPrice,
      backtest,
    });
    const strategy = this.getStrategy(symbol, context.strategyName, context.exchangeName, context.frameName, backtest);
    return await strategy.trailingStop(symbol, percentShift, currentPrice, backtest);
  };

  /**
   * Adjusts the trailing take-profit distance for an active pending signal.
   *
   * Updates the take-profit distance by a percentage adjustment relative to the original TP distance.
   * Negative percentShift brings TP closer to entry, positive percentShift moves it further.
   *
   * Delegates to ClientStrategy.trailingTake() with current execution context.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param percentShift - Percentage adjustment to TP distance (-100 to 100)
   * @param currentPrice - Current market price to check for intrusion
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise that resolves when trailing TP is updated
   *
   * @example
   * ```typescript
   * // LONG: entry=100, originalTP=110, distance=10%, currentPrice=102
   * // Move TP further by 50%: newTP = 100 + 15% = 115
   * await strategyConnectionService.trailingTake(
   *   false,
   *   "BTCUSDT",
   *   50,
   *   102,
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "" }
   * );
   * ```
   */
  public trailingTake = async (
    backtest: boolean,
    symbol: string,
    percentShift: number,
    currentPrice: number,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
  ): Promise<boolean> => {
    this.loggerService.log("strategyConnectionService trailingTake", {
      symbol,
      context,
      percentShift,
      currentPrice,
      backtest,
    });
    const strategy = this.getStrategy(symbol, context.strategyName, context.exchangeName, context.frameName, backtest);
    return await strategy.trailingTake(symbol, percentShift, currentPrice, backtest);
  };

  /**
   * Delegates to ClientStrategy.breakeven() with current execution context.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param currentPrice - Current market price to check threshold
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise<boolean> - true if breakeven was set, false otherwise
   *
   * @example
   * ```typescript
   * // LONG: entry=100, slippage=0.1%, fee=0.1%, threshold=0.4%
   * // Try to move SL to breakeven when price >= 100.4
   * const moved = await strategyConnectionService.breakeven(
   *   false,
   *   "BTCUSDT",
   *   100.5,
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "" }
   * );
   * console.log(moved); // true (SL moved to 100)
   * ```
   */
  public breakeven = async (
    backtest: boolean,
    symbol: string,
    currentPrice: number,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
  ): Promise<boolean> => {
    this.loggerService.log("strategyConnectionService breakeven", {
      symbol,
      context,
      currentPrice,
      backtest,
    });
    const strategy = this.getStrategy(symbol, context.strategyName, context.exchangeName, context.frameName, backtest);
    return await strategy.breakeven(symbol, currentPrice, backtest);
  };
}

export default StrategyConnectionService;

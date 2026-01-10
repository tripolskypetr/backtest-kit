import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import ExecutionContextService from "../context/ExecutionContextService";
import {
  ISignalRow,
  IScheduledSignalRow,
  IStrategyBacktestResult,
  IStrategyTickResult,
  StrategyName,
  IStrategy,
} from "../../../interfaces/Strategy.interface";
import StrategyConnectionService from "../connection/StrategyConnectionService";
import { ExchangeName, ICandleData } from "../../../interfaces/Exchange.interface";
import { memoize } from "functools-kit";
import StrategySchemaService from "../schema/StrategySchemaService";
import RiskValidationService from "../validation/RiskValidationService";
import StrategyValidationService from "../validation/StrategyValidationService";
import { FrameName } from "../../../interfaces/Frame.interface";

const METHOD_NAME_VALIDATE = "strategyCoreService validate";

/**
 * Type definition for strategy methods.
 * Maps all keys of IStrategy to any type.
 * Used for dynamic method routing in StrategyCoreService.
 */
type TStrategy = {
  [key in keyof IStrategy]: any;
};

/**
 * Global service for strategy operations with execution context injection.
 *
 * Wraps StrategyConnectionService with ExecutionContextService to inject
 * symbol, when, and backtest parameters into the execution context.
 *
 * Used internally by BacktestLogicPrivateService and LiveLogicPrivateService.
 */
export class StrategyCoreService implements TStrategy {
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

  /**
   * Validates strategy and associated risk configuration.
   *
   * Memoized to avoid redundant validations for the same symbol-strategy-exchange-frame combination.
   * Logs validation activity.
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise that resolves when validation is complete
   */
  private validate = memoize(
    ([symbol, context]) => `${symbol}:${context.strategyName}:${context.exchangeName}:${context.frameName}`,
    async (symbol: string, context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }) => {
      this.loggerService.log(METHOD_NAME_VALIDATE, {
        symbol,
        context,
      });
      const { riskName, riskList } = this.strategySchemaService.get(context.strategyName);
      this.strategyValidationService.validate(
        context.strategyName,
        METHOD_NAME_VALIDATE
      );
      riskName && this.riskValidationService.validate(riskName, METHOD_NAME_VALIDATE);
      riskList && riskList.forEach((riskName) => this.riskValidationService.validate(riskName, METHOD_NAME_VALIDATE));
    }
  );

  /**
   * Retrieves the currently active pending signal for the symbol.
   * If no active signal exists, returns null.
   * Used internally for monitoring TP/SL and time expiration.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise resolving to pending signal or null
   */
  public getPendingSignal = async (
    backtest: boolean,
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<ISignalRow | null> => {
    this.loggerService.log("strategyCoreService getPendingSignal", {
      symbol,
      context,
    });
    await this.validate(symbol, context);
    return await this.strategyConnectionService.getPendingSignal(backtest, symbol, context);
  };

  /**
   * Retrieves the currently active scheduled signal for the symbol.
   * If no scheduled signal exists, returns null.
   * Used internally for monitoring scheduled signal activation.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise resolving to scheduled signal or null
   */
  public getScheduledSignal = async (
    backtest: boolean,
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<IScheduledSignalRow | null> => {
    this.loggerService.log("strategyCoreService getScheduledSignal", {
      symbol,
      context,
    });
    await this.validate(symbol, context);
    return await this.strategyConnectionService.getScheduledSignal(backtest, symbol, context);
  };

  /**
   * Checks if breakeven threshold has been reached for the current pending signal.
   *
   * Validates strategy existence and delegates to connection service
   * to check if price has moved far enough to cover transaction costs.
   *
   * Does not require execution context as this is a state query operation.
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
   * const canBreakeven = await strategyCoreService.getBreakeven(
   *   false,
   *   "BTCUSDT",
   *   100.5,
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "" }
   * );
   * // Returns true (price >= 100.4)
   *
   * if (canBreakeven) {
   *   await strategyCoreService.breakeven(false, "BTCUSDT", 100.5, context);
   * }
   * ```
   */
  public getBreakeven = async (
    backtest: boolean,
    symbol: string,
    currentPrice: number,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<boolean> => {
    this.loggerService.log("strategyCoreService getBreakeven", {
      symbol,
      currentPrice,
      context,
      backtest,
    });
    await this.validate(symbol, context);
    return await this.strategyConnectionService.getBreakeven(backtest, symbol, currentPrice, context);
  };

  /**
   * Checks if the strategy has been stopped.
   *
   * Validates strategy existence and delegates to connection service
   * to retrieve the stopped state from the strategy instance.
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
    this.loggerService.log("strategyCoreService getStopped", {
      symbol,
      context,
      backtest,
    });
    await this.validate(symbol, context);
    return await this.strategyConnectionService.getStopped(backtest, symbol, context);
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
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Discriminated union of tick result (idle, opened, active, closed)
   */
  public tick = async (
    symbol: string,
    when: Date,
    backtest: boolean,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<IStrategyTickResult> => {
    this.loggerService.log("strategyCoreService tick", {
      symbol,
      when,
      backtest,
      context,
    });
    await this.validate(symbol, context);
    return await ExecutionContextService.runInContext(
      async () => {
        return await this.strategyConnectionService.tick(symbol, context);
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
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Closed signal result with PNL
   */
  public backtest = async (
    symbol: string,
    candles: ICandleData[],
    when: Date,
    backtest: boolean,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<IStrategyBacktestResult> => {
    this.loggerService.log("strategyCoreService backtest", {
      symbol,
      candleCount: candles.length,
      when,
      backtest,
      context,
    });
    await this.validate(symbol, context);
    return await ExecutionContextService.runInContext(
      async () => {
        return await this.strategyConnectionService.backtest(symbol, context, candles);
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
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param ctx - Context with strategyName, exchangeName, frameName
   * @returns Promise that resolves when stop flag is set
   */
  public stop = async (backtest: boolean, symbol: string, context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }): Promise<void> => {
    this.loggerService.log("strategyCoreService stop", {
      symbol,
      context,
      backtest,
    });
    await this.validate(symbol, context);
    return await this.strategyConnectionService.stop(backtest, symbol, context);
  };

  /**
   * Cancels the scheduled signal without stopping the strategy.
   *
   * Delegates to StrategyConnectionService.cancel() to clear scheduled signal
   * and emit cancelled event through emitters.
   * Does not require execution context.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param ctx - Context with strategyName, exchangeName, frameName
   * @param cancelId - Optional cancellation ID for user-initiated cancellations
   * @returns Promise that resolves when scheduled signal is cancelled
   */
  public cancel = async (backtest: boolean, symbol: string, context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }, cancelId?: string): Promise<void> => {
    this.loggerService.log("strategyCoreService cancel", {
      symbol,
      context,
      backtest,
      cancelId,
    });
    await this.validate(symbol, context);
    return await this.strategyConnectionService.cancel(backtest, symbol, context, cancelId);
  };

  /**
   * Clears the memoized ClientStrategy instance from cache.
   *
   * Delegates to StrategyConnectionService.clear() to remove strategy from cache.
   * Forces re-initialization of strategy on next operation.
   *
   * @param payload - Optional payload with symbol, context and backtest flag (clears all if not provided)
   */
  public clear = async (payload?: { symbol: string; strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName; backtest: boolean }): Promise<void> => {
    this.loggerService.log("strategyCoreService clear", {
      payload,
    });
    if (payload) {
      await this.validate(payload.symbol, {
        strategyName: payload.strategyName,
        exchangeName: payload.exchangeName,
        frameName: payload.frameName
      });
    }
    return await this.strategyConnectionService.clear(payload);
  };

  /**
   * Executes partial close at profit level (moving toward TP).
   *
   * Validates strategy existence and delegates to connection service
   * to close a percentage of the pending position at profit.
   *
   * Does not require execution context as this is a direct state mutation.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param percentToClose - Percentage of position to close (0-100, absolute value)
   * @param currentPrice - Current market price for this partial close (must be in profit direction)
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise that resolves when state is updated and persisted
   *
   * @example
   * ```typescript
   * // Close 30% of position at profit
   * await strategyCoreService.partialProfit(
   *   false,
   *   "BTCUSDT",
   *   30,
   *   45000,
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "" }
   * );
   * ```
   */
  public partialProfit = async (
    backtest: boolean,
    symbol: string,
    percentToClose: number,
    currentPrice: number,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<void> => {
    this.loggerService.log("strategyCoreService partialProfit", {
      symbol,
      percentToClose,
      currentPrice,
      context,
      backtest,
    });
    await this.validate(symbol, context);
    return await this.strategyConnectionService.partialProfit(backtest, symbol, percentToClose, currentPrice, context);
  };

  /**
   * Executes partial close at loss level (moving toward SL).
   *
   * Validates strategy existence and delegates to connection service
   * to close a percentage of the pending position at loss.
   *
   * Does not require execution context as this is a direct state mutation.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param percentToClose - Percentage of position to close (0-100, absolute value)
   * @param currentPrice - Current market price for this partial close (must be in loss direction)
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise that resolves when state is updated and persisted
   *
   * @example
   * ```typescript
   * // Close 40% of position at loss
   * await strategyCoreService.partialLoss(
   *   false,
   *   "BTCUSDT",
   *   40,
   *   38000,
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "" }
   * );
   * ```
   */
  public partialLoss = async (
    backtest: boolean,
    symbol: string,
    percentToClose: number,
    currentPrice: number,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<void> => {
    this.loggerService.log("strategyCoreService partialLoss", {
      symbol,
      percentToClose,
      currentPrice,
      context,
      backtest,
    });
    await this.validate(symbol, context);
    return await this.strategyConnectionService.partialLoss(backtest, symbol, percentToClose, currentPrice, context);
  };

  /**
   * Adjusts the trailing stop-loss distance for an active pending signal.
   *
   * Validates strategy existence and delegates to connection service
   * to update the stop-loss distance by a percentage adjustment.
   *
   * Does not require execution context as this is a direct state mutation.
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
   * await strategyCoreService.trailingStop(
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
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<void> => {
    this.loggerService.log("strategyCoreService trailingStop", {
      symbol,
      percentShift,
      currentPrice,
      context,
      backtest,
    });
    await this.validate(symbol, context);
    return await this.strategyConnectionService.trailingStop(backtest, symbol, percentShift, currentPrice, context);
  };

  /**
   * Adjusts the trailing take-profit distance for an active pending signal.
   * Validates context and delegates to StrategyConnectionService.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param percentShift - Percentage adjustment to TP distance (-100 to 100)
   * @param currentPrice - Current market price to check for intrusion
   * @param context - Strategy context with strategyName, exchangeName, frameName
   * @returns Promise that resolves when trailing TP is updated
   *
   * @example
   * ```typescript
   * // LONG: entry=100, originalTP=110, distance=10%, currentPrice=102
   * // Move TP further by 50%: newTP = 100 + 15% = 115
   * await strategyCoreService.trailingTake(
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
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<void> => {
    this.loggerService.log("strategyCoreService trailingTake", {
      symbol,
      percentShift,
      currentPrice,
      context,
      backtest,
    });
    await this.validate(symbol, context);
    return await this.strategyConnectionService.trailingTake(backtest, symbol, percentShift, currentPrice, context);
  };

  /**
   * Moves stop-loss to breakeven when price reaches threshold.
   * Validates context and delegates to StrategyConnectionService.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param currentPrice - Current market price to check threshold
   * @param context - Strategy context with strategyName, exchangeName, frameName
   * @returns Promise<boolean> - true if breakeven was set, false otherwise
   *
   * @example
   * ```typescript
   * const moved = await strategyCoreService.breakeven(
   *   false,
   *   "BTCUSDT",
   *   112,
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "" }
   * );
   * ```
   */
  public breakeven = async (
    backtest: boolean,
    symbol: string,
    currentPrice: number,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<boolean> => {
    this.loggerService.log("strategyCoreService breakeven", {
      symbol,
      currentPrice,
      context,
      backtest,
    });
    await this.validate(symbol, context);
    return await this.strategyConnectionService.breakeven(backtest, symbol, currentPrice, context);
  };
}

export default StrategyCoreService;

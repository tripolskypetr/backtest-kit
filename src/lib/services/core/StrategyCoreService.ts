import { inject } from "../../core/di";
import { TLoggerService } from "../base/LoggerService";
import TYPES from "../../core/types";
import ExecutionContextService from "../context/ExecutionContextService";
import {
  ISignalRow,
  IScheduledSignalRow,
  IStrategyBacktestResult,
  IStrategyTickResult,
  StrategyName,
  IStrategy,
  IStrategyTickResultClosed,
  IStrategyTickResultCancelled,
  IStrategyTickResultActive,
  IPublicSignalRow,
} from "../../../interfaces/Strategy.interface";
import StrategyConnectionService from "../connection/StrategyConnectionService";
import { ExchangeName, ICandleData } from "../../../interfaces/Exchange.interface";
import { memoize } from "functools-kit";
import StrategySchemaService from "../schema/StrategySchemaService";
import RiskValidationService from "../validation/RiskValidationService";
import StrategyValidationService from "../validation/StrategyValidationService";
import ExchangeValidationService from "../validation/ExchangeValidationService";
import FrameValidationService from "../validation/FrameValidationService";
import { FrameName } from "../../../interfaces/Frame.interface";

const METHOD_NAME_VALIDATE = "strategyCoreService validate";

/**
 * Creates a unique key for memoizing validate calls.
 * Key format: "strategyName:exchangeName:frameName"
 * @param context - Execution context with strategyName, exchangeName, frameName
 * @returns Unique string key for memoization
 */
const CREATE_KEY_FN = (context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }): string => {
  const parts = [context.strategyName, context.exchangeName];
  if (context.frameName) parts.push(context.frameName);
  return parts.join(":");
};

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
  private readonly loggerService = inject<TLoggerService>(TYPES.loggerService);
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
  private readonly exchangeValidationService = inject<ExchangeValidationService>(
    TYPES.exchangeValidationService
  );
  private readonly frameValidationService = inject<FrameValidationService>(
    TYPES.frameValidationService
  );

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
    ([context]) => CREATE_KEY_FN(context),
    async (context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }) => {
      this.loggerService.log(METHOD_NAME_VALIDATE, {
        context,
      });
      const { riskName, riskList } = this.strategySchemaService.get(context.strategyName);
      this.strategyValidationService.validate(
        context.strategyName,
        METHOD_NAME_VALIDATE
      );
      this.exchangeValidationService.validate(
        context.exchangeName,
        METHOD_NAME_VALIDATE
      );
      context.frameName && this.frameValidationService.validate(context.frameName, METHOD_NAME_VALIDATE);
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
    currentPrice: number,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<IPublicSignalRow | null> => {
    this.loggerService.log("strategyCoreService getPendingSignal", {
      symbol,
      context,
    });
    await this.validate(context);
    return await this.strategyConnectionService.getPendingSignal(backtest, symbol, currentPrice, context);
  };

  /**
   * Returns the percentage of the position currently held (not closed).
   * 100 = nothing has been closed (full position), 0 = fully closed.
   * Correctly accounts for DCA entries between partial closes.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise<number> - held percentage (0–100)
   */
  public getTotalPercentClosed = async (
    backtest: boolean,
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<number | null> => {
    this.loggerService.log("strategyCoreService getTotalPercentClosed", {
      symbol,
      context,
    });
    await this.validate(context);
    return await this.strategyConnectionService.getTotalPercentClosed(backtest, symbol, context);
  };

  /**
   * Returns the cost basis in dollars of the position currently held (not closed).
   * Correctly accounts for DCA entries between partial closes.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise<number> - held cost basis in dollars
   */
  public getTotalCostClosed = async (
    backtest: boolean,
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<number | null> => {
    this.loggerService.log("strategyCoreService getTotalCostClosed", {
      symbol,
      context,
    });
    await this.validate(context);
    return await this.strategyConnectionService.getTotalCostClosed(backtest, symbol, context);
  };

  /**
   * Returns the effective (DCA-averaged) entry price for the current pending signal.
   *
   * This is the harmonic mean of all _entry prices, which is the correct
   * cost-basis price used in all PNL calculations.
   * With no DCA entries, equals the original priceOpen.
   *
   * Returns null if no pending signal exists.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise resolving to effective entry price or null
   */
  public getPositionEffectivePrice = async (
    backtest: boolean,
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<number | null> => {
    this.loggerService.log("strategyCoreService getPositionEffectivePrice", {
      symbol,
      context,
    });
    await this.validate(context);
    return await this.strategyConnectionService.getPositionEffectivePrice(backtest, symbol, context);
  };

  /**
   * Returns the number of DCA entries made for the current pending signal.
   *
   * 1 = original entry only (no DCA).
   * Increases by 1 with each successful commitAverageBuy().
   *
   * Returns null if no pending signal exists.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise resolving to entry count or null
   */
  public getPositionInvestedCount = async (
    backtest: boolean,
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<number | null> => {
    this.loggerService.log("strategyCoreService getPositionInvestedCount", {
      symbol,
      context,
    });
    await this.validate(context);
    return await this.strategyConnectionService.getPositionInvestedCount(backtest, symbol, context);
  };

  /**
   * Returns the total invested cost basis in dollars for the current pending signal.
   *
   * Equal to entryCount × $100 (COST_BASIS_PER_ENTRY).
   * 1 entry = $100, 2 entries = $200, etc.
   *
   * Returns null if no pending signal exists.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise resolving to total invested cost in dollars or null
   */
  public getPositionInvestedCost = async (
    backtest: boolean,
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<number | null> => {
    this.loggerService.log("strategyCoreService getPositionInvestedCost", {
      symbol,
      context,
    });
    await this.validate(context);
    return await this.strategyConnectionService.getPositionInvestedCost(backtest, symbol, context);
  };

  /**
   * Returns the unrealized PNL percentage for the current pending signal at currentPrice.
   *
   * Accounts for partial closes, DCA entries, slippage and fees
   * (delegates to toProfitLossDto).
   *
   * Returns null if no pending signal exists.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param currentPrice - Current market price
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise resolving to pnlPercentage or null
   */
  public getPositionPnlPercent = async (
    backtest: boolean,
    symbol: string,
    currentPrice: number,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<number | null> => {
    this.loggerService.log("strategyCoreService getPositionPnlPercent", {
      symbol,
      currentPrice,
      context,
    });
    await this.validate(context);
    return await this.strategyConnectionService.getPositionPnlPercent(backtest, symbol, currentPrice, context);
  };

  /**
   * Returns the unrealized PNL in dollars for the current pending signal at currentPrice.
   *
   * Calculated as: pnlPercentage / 100 × totalInvestedCost
   * Accounts for partial closes, DCA entries, slippage and fees.
   *
   * Returns null if no pending signal exists.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param currentPrice - Current market price
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise resolving to pnl in dollars or null
   */
  public getPositionPnlCost = async (
    backtest: boolean,
    symbol: string,
    currentPrice: number,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<number | null> => {
    this.loggerService.log("strategyCoreService getPositionPnlCost", {
      symbol,
      currentPrice,
      context,
    });
    await this.validate(context);
    return await this.strategyConnectionService.getPositionPnlCost(backtest, symbol, currentPrice, context);
  };

  /**
   * Returns the list of DCA entry prices for the current pending signal.
   *
   * The first element is always the original priceOpen (initial entry).
   * Each subsequent element is a price added by commitAverageBuy().
   *
   * Returns null if no pending signal exists.
   * Returns a single-element array [priceOpen] if no DCA entries were made.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise resolving to array of entry prices or null
   *
   * @example
   * ```typescript
   * // No DCA: [43000]
   * // One DCA: [43000, 42000]
   * // Two DCA: [43000, 42000, 41500]
   * ```
   */
  public getPositionLevels = async (
    backtest: boolean,
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<number[] | null> => {
    this.loggerService.log("strategyCoreService getPositionLevels", {
      symbol,
      context,
    });
    await this.validate(context);
    return await this.strategyConnectionService.getPositionLevels(backtest, symbol, context);
  };

  /**
   * Returns the list of partial closes for the current pending signal.
   *
   * Each entry records a partial profit or loss close event with its type,
   * percent closed, price at close, cost basis snapshot, and entry count at close.
   *
   * Returns null if no pending signal exists.
   * Returns an empty array if no partial closes have been executed.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise resolving to array of partial close records or null
   */
  public getPositionPartials = async (
    backtest: boolean,
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ) => {
    this.loggerService.log("strategyCoreService getPositionPartials", {
      symbol,
      context,
    });
    await this.validate(context);
    return await this.strategyConnectionService.getPositionPartials(backtest, symbol, context);
  };

  /**
   * Returns the list of DCA entry prices and costs for the current pending signal.
   *
   * Each entry records the price and cost of a single position entry.
   * The first element is always the original priceOpen (initial entry).
   * Each subsequent element is an entry added by averageBuy().
   *
   * Returns null if no pending signal exists.
   * Returns a single-element array [{ price: priceOpen, cost }] if no DCA entries were made.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise resolving to array of entry records or null
   *
   * @example
   * ```typescript
   * // No DCA: [{ price: 43000, cost: 100 }]
   * // One DCA: [{ price: 43000, cost: 100 }, { price: 42000, cost: 100 }]
   * ```
   */
  public getPositionEntries = async (
    backtest: boolean,
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ) => {
    this.loggerService.log("strategyCoreService getPositionEntries", {
      symbol,
      context,
    });
    await this.validate(context);
    return await this.strategyConnectionService.getPositionEntries(backtest, symbol, context);
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
    currentPrice: number,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<IScheduledSignalRow | null> => {
    this.loggerService.log("strategyCoreService getScheduledSignal", {
      symbol,
      context,
    });
    await this.validate(context);
    return await this.strategyConnectionService.getScheduledSignal(backtest, symbol, currentPrice, context);
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
    await this.validate(context);
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
    await this.validate(context);
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
    await this.validate(context);
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
    frameEndTime: number,
    when: Date,
    backtest: boolean,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<IStrategyTickResultClosed | IStrategyTickResultCancelled | IStrategyTickResultActive> => {
    this.loggerService.log("strategyCoreService backtest", {
      symbol,
      candleCount: candles.length,
      when,
      backtest,
      context,
      frameEndTime,
    });
    await this.validate(context);
    return await ExecutionContextService.runInContext(
      async () => {
        return await this.strategyConnectionService.backtest(symbol, context, candles, frameEndTime);
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
  public stopStrategy = async (backtest: boolean, symbol: string, context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }): Promise<void> => {
    this.loggerService.log("strategyCoreService stopStrategy", {
      symbol,
      context,
      backtest,
    });
    await this.validate(context);
    return await this.strategyConnectionService.stopStrategy(backtest, symbol, context);
  };

  /**
   * Cancels the scheduled signal without stopping the strategy.
   *
   * Delegates to StrategyConnectionService.cancelScheduled() to clear scheduled signal
   * and emit cancelled event through emitters.
   * Does not require execution context.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param ctx - Context with strategyName, exchangeName, frameName
   * @param cancelId - Optional cancellation ID for user-initiated cancellations
   * @returns Promise that resolves when scheduled signal is cancelled
   */
  public cancelScheduled = async (backtest: boolean, symbol: string, context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }, cancelId?: string): Promise<void> => {
    this.loggerService.log("strategyCoreService cancelScheduled", {
      symbol,
      context,
      backtest,
      cancelId,
    });
    await this.validate(context);
    return await this.strategyConnectionService.cancelScheduled(backtest, symbol, context, cancelId);
  };

  /**
   * Closes the pending signal without stopping the strategy.
   *
   * Clears the pending signal (active position).
   * Does NOT affect scheduled signals or strategy operation.
   * Does NOT set stop flag - strategy can continue generating new signals.
   *
   * Delegates to StrategyConnectionService.closePending() to clear pending signal
   * and emit closed event through emitters.
   * Does not require execution context.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param context - Context with strategyName, exchangeName, frameName
   * @param closeId - Optional close ID for user-initiated closes
   * @returns Promise that resolves when pending signal is closed
   */
  public closePending = async (backtest: boolean, symbol: string, context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }, closeId?: string): Promise<void> => {
    this.loggerService.log("strategyCoreService closePending", {
      symbol,
      context,
      backtest,
      closeId,
    });
    await this.validate(context);
    return await this.strategyConnectionService.closePending(backtest, symbol, context, closeId);
  };

  /**
   * Disposes the ClientStrategy instance for the given context.
   *
   * Calls dispose on the strategy instance to clean up resources,
   * then removes it from cache.
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
    this.loggerService.log("strategyCoreService dispose", {
      symbol,
      context,
      backtest,
    });
    await this.validate(context);
    return await this.strategyConnectionService.dispose(backtest, symbol, context);
  };

  /**
   * Clears the memoized ClientStrategy instance from cache.
   *
   * Delegates to StrategyConnectionService.dispose() if payload provided,
   * otherwise clears all strategy instances.
   *
   * @param payload - Optional payload with symbol, context and backtest flag (clears all if not provided)
   */
  public clear = async (payload?: { symbol: string; strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName; backtest: boolean }): Promise<void> => {
    this.loggerService.log("strategyCoreService clear", {
      payload,
    });
    if (payload) {
      await this.validate({
        strategyName: payload.strategyName,
        exchangeName: payload.exchangeName,
        frameName: payload.frameName
      });
    }
    return await this.strategyConnectionService.clear(payload);
  };

  /**
   * Checks whether `partialProfit` would succeed without executing it.
   * Validates context, then delegates to StrategyConnectionService.validatePartialProfit().
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param percentToClose - Percentage of position to check (0-100]
   * @param currentPrice - Current market price to validate against
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise<boolean> - true if `partialProfit` would execute, false otherwise
   */
  public validatePartialProfit = async (
    backtest: boolean,
    symbol: string,
    percentToClose: number,
    currentPrice: number,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<boolean> => {
    this.loggerService.log("strategyCoreService validatePartialProfit", {
      symbol,
      percentToClose,
      currentPrice,
      context,
      backtest,
    });
    await this.validate(context);
    return await this.strategyConnectionService.validatePartialProfit(backtest, symbol, percentToClose, currentPrice, context);
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
   * @returns Promise<boolean> - true if partial close executed, false if skipped
   *
   * @example
   * ```typescript
   * // Close 30% of position at profit
   * const success = await strategyCoreService.partialProfit(
   *   false,
   *   "BTCUSDT",
   *   30,
   *   45000,
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "" }
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
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<boolean> => {
    this.loggerService.log("strategyCoreService partialProfit", {
      symbol,
      percentToClose,
      currentPrice,
      context,
      backtest,
    });
    await this.validate(context);
    return await this.strategyConnectionService.partialProfit(backtest, symbol, percentToClose, currentPrice, context);
  };

  /**
   * Checks whether `partialLoss` would succeed without executing it.
   * Validates context, then delegates to StrategyConnectionService.validatePartialLoss().
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param percentToClose - Percentage of position to check (0-100]
   * @param currentPrice - Current market price to validate against
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise<boolean> - true if `partialLoss` would execute, false otherwise
   */
  public validatePartialLoss = async (
    backtest: boolean,
    symbol: string,
    percentToClose: number,
    currentPrice: number,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<boolean> => {
    this.loggerService.log("strategyCoreService validatePartialLoss", {
      symbol,
      percentToClose,
      currentPrice,
      context,
      backtest,
    });
    await this.validate(context);
    return await this.strategyConnectionService.validatePartialLoss(backtest, symbol, percentToClose, currentPrice, context);
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
   * @returns Promise<boolean> - true if partial close executed, false if skipped
   *
   * @example
   * ```typescript
   * // Close 40% of position at loss
   * const success = await strategyCoreService.partialLoss(
   *   false,
   *   "BTCUSDT",
   *   40,
   *   38000,
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "" }
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
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<boolean> => {
    this.loggerService.log("strategyCoreService partialLoss", {
      symbol,
      percentToClose,
      currentPrice,
      context,
      backtest,
    });
    await this.validate(context);
    return await this.strategyConnectionService.partialLoss(backtest, symbol, percentToClose, currentPrice, context);
  };

  /**
   * Checks whether `trailingStop` would succeed without executing it.
   * Validates context, then delegates to StrategyConnectionService.validateTrailingStop().
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param percentShift - Percentage shift of ORIGINAL SL distance [-100, 100], excluding 0
   * @param currentPrice - Current market price to validate against
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise<boolean> - true if `trailingStop` would execute, false otherwise
   */
  public validateTrailingStop = async (
    backtest: boolean,
    symbol: string,
    percentShift: number,
    currentPrice: number,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<boolean> => {
    this.loggerService.log("strategyCoreService validateTrailingStop", {
      symbol,
      percentShift,
      currentPrice,
      context,
      backtest,
    });
    await this.validate(context);
    return await this.strategyConnectionService.validateTrailingStop(backtest, symbol, percentShift, currentPrice, context);
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
   * @returns Promise<boolean> - true if trailing SL was updated, false otherwise
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
  ): Promise<boolean> => {
    this.loggerService.log("strategyCoreService trailingStop", {
      symbol,
      percentShift,
      currentPrice,
      context,
      backtest,
    });
    await this.validate(context);
    return await this.strategyConnectionService.trailingStop(backtest, symbol, percentShift, currentPrice, context);
  };

  /**
   * Checks whether `trailingTake` would succeed without executing it.
   * Validates context, then delegates to StrategyConnectionService.validateTrailingTake().
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param percentShift - Percentage adjustment to ORIGINAL TP distance [-100, 100], excluding 0
   * @param currentPrice - Current market price to validate against
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise<boolean> - true if `trailingTake` would execute, false otherwise
   */
  public validateTrailingTake = async (
    backtest: boolean,
    symbol: string,
    percentShift: number,
    currentPrice: number,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<boolean> => {
    this.loggerService.log("strategyCoreService validateTrailingTake", {
      symbol,
      percentShift,
      currentPrice,
      context,
      backtest,
    });
    await this.validate(context);
    return await this.strategyConnectionService.validateTrailingTake(backtest, symbol, percentShift, currentPrice, context);
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
   * @returns Promise<boolean> - true if trailing TP was updated, false otherwise
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
  ): Promise<boolean> => {
    this.loggerService.log("strategyCoreService trailingTake", {
      symbol,
      percentShift,
      currentPrice,
      context,
      backtest,
    });
    await this.validate(context);
    return await this.strategyConnectionService.trailingTake(backtest, symbol, percentShift, currentPrice, context);
  };

  /**
   * Checks whether `breakeven` would succeed without executing it.
   * Validates context, then delegates to StrategyConnectionService.validateBreakeven().
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param currentPrice - Current market price to validate against
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise<boolean> - true if `breakeven` would execute, false otherwise
   */
  public validateBreakeven = async (
    backtest: boolean,
    symbol: string,
    currentPrice: number,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<boolean> => {
    this.loggerService.log("strategyCoreService validateBreakeven", {
      symbol,
      currentPrice,
      context,
      backtest,
    });
    await this.validate(context);
    return await this.strategyConnectionService.validateBreakeven(backtest, symbol, currentPrice, context);
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
    await this.validate(context);
    return await this.strategyConnectionService.breakeven(backtest, symbol, currentPrice, context);
  };

  /**
   * Activates a scheduled signal early without waiting for price to reach priceOpen.
   *
   * Validates strategy existence and delegates to connection service
   * to set the activation flag. The actual activation happens on next tick().
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @param activateId - Optional identifier for the activation reason
   * @returns Promise that resolves when activation flag is set
   *
   * @example
   * ```typescript
   * // Activate scheduled signal early
   * await strategyCoreService.activateScheduled(
   *   false,
   *   "BTCUSDT",
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "" },
   *   "manual-activation"
   * );
   * ```
   */
  public activateScheduled = async (
    backtest: boolean,
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    activateId?: string
  ): Promise<void> => {
    this.loggerService.log("strategyCoreService activateScheduled", {
      symbol,
      context,
      backtest,
      activateId,
    });
    await this.validate(context);
    return await this.strategyConnectionService.activateScheduled(backtest, symbol, context, activateId);
  };

  /**
   * Checks whether `averageBuy` would succeed without executing it.
   * Validates context, then delegates to StrategyConnectionService.validateAverageBuy().
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param currentPrice - New entry price to validate
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise<boolean> - true if `averageBuy` would execute, false otherwise
   */
  public validateAverageBuy = async (
    backtest: boolean,
    symbol: string,
    currentPrice: number,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<boolean> => {
    this.loggerService.log("strategyCoreService validateAverageBuy", {
      symbol,
      currentPrice,
      context,
      backtest,
    });
    await this.validate(context);
    return await this.strategyConnectionService.validateAverageBuy(backtest, symbol, currentPrice, context);
  };

  /**
   * Adds a new DCA entry to the active pending signal.
   *
   * Validates strategy existence and delegates to connection service
   * to add a new averaging entry to the position.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param currentPrice - New entry price to add to the averaging history
   * @param cost - Cost basis for this entry in dollars
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise<boolean> - true if entry added, false if rejected
   */
  public averageBuy = async (
    backtest: boolean,
    symbol: string,
    currentPrice: number,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    cost: number,
  ): Promise<boolean> => {
    this.loggerService.log("strategyCoreService averageBuy", {
      symbol,
      currentPrice,
      context,
      backtest,
    });
    await this.validate(context);
    return await this.strategyConnectionService.averageBuy(backtest, symbol, currentPrice, context, cost);
  };

  /**
   * Checks if there is an active pending signal for the symbol.
   * Validates strategy existence and delegates to connection service
   * to check if a pending signal exists for the symbol.
   * Does not require execution context as this is a state query operation.
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise<boolean> - true if pending signal exists, false otherwise
   */
  public hasPendingSignal = async (
    backtest: boolean,
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<boolean> => {
    this.loggerService.log("strategyCoreService hasPendingSignal", {
      symbol,
      context,
    });
    await this.validate(context);
    return await this.strategyConnectionService.hasPendingSignal(backtest, symbol, context);
  }

  /**
   * Checks if there is a waiting scheduled signal for the symbol.
   * Validates strategy existence and delegates to connection service
   * to check if a scheduled signal exists for the symbol.
   * Does not require execution context as this is a state query operation.
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise<boolean> - true if scheduled signal exists, false otherwise
   */
  public hasScheduledSignal = async (
    backtest: boolean,
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<boolean> => {
    this.loggerService.log("strategyCoreService hasScheduledSignal", {
      symbol,
      context,
    });
    await this.validate(context);
    return await this.strategyConnectionService.hasScheduledSignal(backtest, symbol, context);
  }

  /**
   * Returns the original estimated duration for the current pending signal.
   *
   * Validates strategy existence and delegates to connection service.
   * Returns null if no pending signal exists.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise resolving to estimated duration in minutes or null
   */
  public getPositionEstimateMinutes = async (
    backtest: boolean,
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<number | null> => {
    this.loggerService.log("strategyCoreService getPositionEstimateMinutes", {
      symbol,
      context,
    });
    await this.validate(context);
    return await this.strategyConnectionService.getPositionEstimateMinutes(backtest, symbol, context);
  };

  /**
   * Returns the remaining time before the position expires, clamped to zero.
   *
   * Validates strategy existence and delegates to connection service.
   * Returns null if no pending signal exists.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise resolving to remaining minutes (≥ 0) or null
   */
  public getPositionCountdownMinutes = async (
    backtest: boolean,
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<number | null> => {
    this.loggerService.log("strategyCoreService getPositionCountdownMinutes", {
      symbol,
      context,
    });
    await this.validate(context);
    return await this.strategyConnectionService.getPositionCountdownMinutes(backtest, symbol, context);
  };

  /**
   * Returns the best price reached in the profit direction during this position's life.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise resolving to price or null
   */
  public getPositionHighestProfitPrice = async (
    backtest: boolean,
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<number | null> => {
    this.loggerService.log("strategyCoreService getPositionHighestProfitPrice", {
      symbol,
      context,
    });
    await this.validate(context);
    return await this.strategyConnectionService.getPositionHighestProfitPrice(backtest, symbol, context);
  };

  /**
   * Returns the timestamp when the best profit price was recorded during this position's life.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise resolving to timestamp in milliseconds or null
   */
  public getPositionHighestProfitTimestamp = async (
    backtest: boolean,
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<number | null> => {
    this.loggerService.log("strategyCoreService getPositionHighestProfitTimestamp", {
      symbol,
      context,
    });
    await this.validate(context);
    return await this.strategyConnectionService.getPositionHighestProfitTimestamp(backtest, symbol, context);
  };

  /**
   * Returns the PnL percentage at the moment the best profit price was recorded during this position's life.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise resolving to PnL percentage or null
   */
  public getPositionHighestPnlPercentage = async (
    backtest: boolean,
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<number | null> => {
    this.loggerService.log("strategyCoreService getPositionHighestPnlPercentage", {
      symbol,
      context,
    });
    await this.validate(context);
    return await this.strategyConnectionService.getPositionHighestPnlPercentage(backtest, symbol, context);
  };

  /**
   * Returns the PnL cost (in quote currency) at the moment the best profit price was recorded during this position's life.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise resolving to PnL cost or null
   */
  public getPositionHighestPnlCost = async (
    backtest: boolean,
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<number | null> => {
    this.loggerService.log("strategyCoreService getPositionHighestPnlCost", {
      symbol,
      context,
    });
    await this.validate(context);
    return await this.strategyConnectionService.getPositionHighestPnlCost(backtest, symbol, context);
  };

  /**
   * Returns whether breakeven was mathematically reachable at the highest profit price.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise resolving to true if breakeven was reachable at peak, false otherwise, or null
   */
  public getPositionHighestProfitBreakeven = async (
    backtest: boolean,
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<boolean | null> => {
    this.loggerService.log("strategyCoreService getPositionHighestProfitBreakeven", {
      symbol,
      context,
    });
    await this.validate(context);
    return await this.strategyConnectionService.getPositionHighestProfitBreakeven(backtest, symbol, context);
  };

  /**
   * Returns the number of minutes elapsed since the highest profit price was recorded.
   *
   * Validates strategy existence and delegates to connection service.
   * Returns null if no pending signal exists.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise resolving to drawdown duration in minutes or null
   */
  public getPositionDrawdownMinutes = async (
    backtest: boolean,
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<number | null> => {
    this.loggerService.log("strategyCoreService getPositionDrawdownMinutes", {
      symbol,
      context,
    });
    await this.validate(context);
    return await this.strategyConnectionService.getPositionDrawdownMinutes(backtest, symbol, context);
  };

  /**
   * Returns the number of minutes elapsed since the highest profit price was recorded.
   *
   * Alias for getPositionDrawdownMinutes — measures how long the position has been
   * pulling back from its peak profit level.
   *
   * Validates strategy existence and delegates to connection service.
   * Returns null if no pending signal exists.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise resolving to minutes since last profit peak or null
   */
  public getPositionHighestProfitMinutes = async (
    backtest: boolean,
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<number | null> => {
    this.loggerService.log("strategyCoreService getPositionHighestProfitMinutes", {
      symbol,
      context,
    });
    await this.validate(context);
    return await this.strategyConnectionService.getPositionHighestProfitMinutes(backtest, symbol, context);
  };

  /**
   * Returns the number of minutes elapsed since the worst loss price was recorded.
   *
   * Measures how long ago the deepest drawdown point occurred.
   * Zero when called at the exact moment the trough was set.
   *
   * Validates strategy existence and delegates to connection service.
   * Returns null if no pending signal exists.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise resolving to minutes since last drawdown trough or null
   */
  public getPositionMaxDrawdownMinutes = async (
    backtest: boolean,
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<number | null> => {
    this.loggerService.log("strategyCoreService getPositionMaxDrawdownMinutes", {
      symbol,
      context,
    });
    await this.validate(context);
    return await this.strategyConnectionService.getPositionMaxDrawdownMinutes(backtest, symbol, context);
  };

  /**
   * Returns the worst price reached in the loss direction during this position's life.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise resolving to price or null
   */
  public getPositionMaxDrawdownPrice = async (
    backtest: boolean,
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<number | null> => {
    this.loggerService.log("strategyCoreService getPositionMaxDrawdownPrice", {
      symbol,
      context,
    });
    await this.validate(context);
    return await this.strategyConnectionService.getPositionMaxDrawdownPrice(backtest, symbol, context);
  };

  /**
   * Returns the timestamp when the worst loss price was recorded during this position's life.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise resolving to timestamp in milliseconds or null
   */
  public getPositionMaxDrawdownTimestamp = async (
    backtest: boolean,
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<number | null> => {
    this.loggerService.log("strategyCoreService getPositionMaxDrawdownTimestamp", {
      symbol,
      context,
    });
    await this.validate(context);
    return await this.strategyConnectionService.getPositionMaxDrawdownTimestamp(backtest, symbol, context);
  };

  /**
   * Returns the PnL percentage at the moment the worst loss price was recorded during this position's life.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise resolving to PnL percentage or null
   */
  public getPositionMaxDrawdownPnlPercentage = async (
    backtest: boolean,
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<number | null> => {
    this.loggerService.log("strategyCoreService getPositionMaxDrawdownPnlPercentage", {
      symbol,
      context,
    });
    await this.validate(context);
    return await this.strategyConnectionService.getPositionMaxDrawdownPnlPercentage(backtest, symbol, context);
  };

  /**
   * Returns the PnL cost (in quote currency) at the moment the worst loss price was recorded during this position's life.
   *
   * @param backtest - Whether running in backtest mode
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName, frameName
   * @returns Promise resolving to PnL cost or null
   */
  public getPositionMaxDrawdownPnlCost = async (
    backtest: boolean,
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }
  ): Promise<number | null> => {
    this.loggerService.log("strategyCoreService getPositionMaxDrawdownPnlCost", {
      symbol,
      context,
    });
    await this.validate(context);
    return await this.strategyConnectionService.getPositionMaxDrawdownPnlCost(backtest, symbol, context);
  };
}

export default StrategyCoreService;

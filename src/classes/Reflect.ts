import { not } from "functools-kit";
import bt from "../lib";
import { StrategyName } from "../interfaces/Strategy.interface";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";

const REFLECT_METHOD_NAME_GET_POSITION_PNL_PERCENT = "ReflectUtils.getPositionPnlPercent";
const REFLECT_METHOD_NAME_GET_POSITION_PNL_COST = "ReflectUtils.getPositionPnlCost";
const REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_PRICE = "ReflectUtils.getPositionHighestProfitPrice";
const REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_TIMESTAMP = "ReflectUtils.getPositionHighestProfitTimestamp";
const REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PNL_PERCENTAGE = "ReflectUtils.getPositionHighestPnlPercentage";
const REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PNL_COST = "ReflectUtils.getPositionHighestPnlCost";
const REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_BREAKEVEN = "ReflectUtils.getPositionHighestProfitBreakeven";
const REFLECT_METHOD_NAME_GET_POSITION_ACTIVE_MINUTES = "ReflectUtils.getPositionActiveMinutes";
const REFLECT_METHOD_NAME_GET_POSITION_WAITING_MINUTES = "ReflectUtils.getPositionWaitingMinutes";
const REFLECT_METHOD_NAME_GET_POSITION_DRAWDOWN_MINUTES = "ReflectUtils.getPositionDrawdownMinutes";
const REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_MINUTES = "ReflectUtils.getPositionHighestProfitMinutes";
const REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_MINUTES = "ReflectUtils.getPositionMaxDrawdownMinutes";
const REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_PRICE = "ReflectUtils.getPositionMaxDrawdownPrice";
const REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_TIMESTAMP = "ReflectUtils.getPositionMaxDrawdownTimestamp";
const REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_PNL_PERCENTAGE = "ReflectUtils.getPositionMaxDrawdownPnlPercentage";
const REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_PNL_COST = "ReflectUtils.getPositionMaxDrawdownPnlCost";
const REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_DISTANCE_PNL_PERCENTAGE = "ReflectUtils.getPositionHighestProfitDistancePnlPercentage";
const REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_DISTANCE_PNL_COST = "ReflectUtils.getPositionHighestProfitDistancePnlCost";
const REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_MAX_DRAWDOWN_PNL_PERCENTAGE = "ReflectUtils.getPositionHighestMaxDrawdownPnlPercentage";
const REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_MAX_DRAWDOWN_PNL_COST = "ReflectUtils.getPositionHighestMaxDrawdownPnlCost";
const REFLECT_METHOD_NAME_GET_MAX_DRAWDOWN_DISTANCE_PNL_PERCENTAGE = "ReflectUtils.getMaxDrawdownDistancePnlPercentage";
const REFLECT_METHOD_NAME_GET_MAX_DRAWDOWN_DISTANCE_PNL_COST = "ReflectUtils.getMaxDrawdownDistancePnlCost";
const REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_PRICE = "ReflectUtils.getPositionWorstStalePrice";
const REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_TIMESTAMP = "ReflectUtils.getPositionWorstStaleTimestamp";
const REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_PNL_PERCENTAGE = "ReflectUtils.getPositionWorstStalePnlPercentage";
const REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_PNL_COST = "ReflectUtils.getPositionWorstStalePnlCost";
const REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_GIVEBACK_PNL_PERCENTAGE = "ReflectUtils.getPositionWorstStaleGivebackPnlPercentage";
const REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_GIVEBACK_PNL_COST = "ReflectUtils.getPositionWorstStaleGivebackPnlCost";
const REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_MINUTES = "ReflectUtils.getPositionWorstStaleMinutes";
const REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_HOLD_MINUTES = "ReflectUtils.getPositionWorstStaleHoldMinutes";
const REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_PEAK_PNL_PERCENTAGE = "ReflectUtils.getPositionWorstStalePeakPnlPercentage";

/**
 * Utility class for real-time position reflection: PNL, peak profit, and drawdown queries.
 *
 * Provides unified access to strategyCoreService position state methods with logging
 * and full validation (strategy, exchange, frame, risk, actions).
 * Works for both live and backtest modes via the `backtest` parameter.
 * Exported as singleton instance for convenient usage.
 *
 * @example
 * ```typescript
 * import { Reflect } from "backtest-kit";
 *
 * // Get current unrealized PNL percentage
 * const pnl = await Reflect.getPositionPnlPercent(
 *   "BTCUSDT",
 *   45000,
 *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "frame1" }
 * );
 * console.log(`PNL: ${pnl}%`);
 *
 * // Get peak profit reached
 * const peakPnl = await Reflect.getPositionHighestPnlPercentage(
 *   "BTCUSDT",
 *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "frame1" }
 * );
 * console.log(`Peak PNL: ${peakPnl}%`);
 * ```
 */
export class ReflectUtils {
  /**
   * Returns the unrealized PNL percentage for the current pending signal at currentPrice.
   *
   * Accounts for partial closes, DCA entries, slippage and fees.
   * Throws if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param currentPrice - Current market price
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to PNL percentage
   * @throws If no pending signal exists
   *
   * @example
   * ```typescript
   * const pnl = await Reflect.getPositionPnlPercent(
   *   "BTCUSDT",
   *   45000,
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "frame1" }
   * );
   * console.log(`PNL: ${pnl}%`);
   * ```
   */
  public getPositionPnlPercent = async (
    symbol: string,
    currentPrice: number,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    backtest = false
  ): Promise<number> => {
    bt.loggerService.info(REFLECT_METHOD_NAME_GET_POSITION_PNL_PERCENT, { symbol, currentPrice, context });
    bt.strategyValidationService.validate(context.strategyName, REFLECT_METHOD_NAME_GET_POSITION_PNL_PERCENT);
    bt.exchangeValidationService.validate(context.exchangeName, REFLECT_METHOD_NAME_GET_POSITION_PNL_PERCENT);
    context.frameName && bt.frameValidationService.validate(context.frameName, REFLECT_METHOD_NAME_GET_POSITION_PNL_PERCENT);
    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_PNL_PERCENT);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_PNL_PERCENT));
      actions && actions.forEach((actionName) => bt.actionValidationService.validate(actionName, REFLECT_METHOD_NAME_GET_POSITION_PNL_PERCENT));
    }
    if (await not(bt.strategyCoreService.hasPendingSignal(backtest, symbol, context))) {
      throw new Error(
        `Reflect.getPositionPnlPercent no pending signal for symbol=${symbol} strategyName=${context.strategyName} exchangeName=${context.exchangeName} frameName=${context.frameName}`,
      );
    }
    return await bt.strategyCoreService.getPositionPnlPercent(backtest, symbol, currentPrice, context);
  };

  /**
   * Returns the unrealized PNL in dollars for the current pending signal at currentPrice.
   *
   * Calculated as: pnlPercentage / 100 × totalInvestedCost.
   * Accounts for partial closes, DCA entries, slippage and fees.
   * Throws if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param currentPrice - Current market price
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to PNL in dollars
   *
   * @example
   * ```typescript
   * const pnlCost = await Reflect.getPositionPnlCost(
   *   "BTCUSDT",
   *   45000,
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "frame1" }
   * );
   * console.log(`PNL: $${pnlCost}`);
   * ```
   */
  public getPositionPnlCost = async (
    symbol: string,
    currentPrice: number,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    backtest = false
  ): Promise<number> => {
    bt.loggerService.info(REFLECT_METHOD_NAME_GET_POSITION_PNL_COST, { symbol, currentPrice, context });
    bt.strategyValidationService.validate(context.strategyName, REFLECT_METHOD_NAME_GET_POSITION_PNL_COST);
    bt.exchangeValidationService.validate(context.exchangeName, REFLECT_METHOD_NAME_GET_POSITION_PNL_COST);
    context.frameName && bt.frameValidationService.validate(context.frameName, REFLECT_METHOD_NAME_GET_POSITION_PNL_COST);
    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_PNL_COST);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_PNL_COST));
      actions && actions.forEach((actionName) => bt.actionValidationService.validate(actionName, REFLECT_METHOD_NAME_GET_POSITION_PNL_COST));
    }
    if (await not(bt.strategyCoreService.hasPendingSignal(backtest, symbol, context))) {
      throw new Error(
        `Reflect.getPositionPnlCost no pending signal for symbol=${symbol} strategyName=${context.strategyName} exchangeName=${context.exchangeName} frameName=${context.frameName}`,
      );
    }
    return await bt.strategyCoreService.getPositionPnlCost(backtest, symbol, currentPrice, context);
  };

  /**
   * Returns the best price reached in the profit direction during this position's life.
   *
   * Throws if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to price
   *
   * @example
   * ```typescript
   * const peakPrice = await Reflect.getPositionHighestProfitPrice(
   *   "BTCUSDT",
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "frame1" }
   * );
   * console.log(`Peak price: ${peakPrice}`);
   * ```
   */
  public getPositionHighestProfitPrice = async (
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    backtest = false
  ): Promise<number> => {
    bt.loggerService.info(REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_PRICE, { symbol, context });
    bt.strategyValidationService.validate(context.strategyName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_PRICE);
    bt.exchangeValidationService.validate(context.exchangeName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_PRICE);
    context.frameName && bt.frameValidationService.validate(context.frameName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_PRICE);
    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_PRICE);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_PRICE));
      actions && actions.forEach((actionName) => bt.actionValidationService.validate(actionName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_PRICE));
    }
    if (await not(bt.strategyCoreService.hasPendingSignal(backtest, symbol, context))) {
      throw new Error(
        `Reflect.getPositionHighestProfitPrice no pending signal for symbol=${symbol} strategyName=${context.strategyName} exchangeName=${context.exchangeName} frameName=${context.frameName}`,
      );
    }
    return await bt.strategyCoreService.getPositionHighestProfitPrice(backtest, symbol, context);
  };

  /**
   * Returns the timestamp when the best profit price was recorded during this position's life.
   *
   * Throws if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to timestamp in milliseconds
   *
   * @example
   * ```typescript
   * const ts = await Reflect.getPositionHighestProfitTimestamp(
   *   "BTCUSDT",
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "frame1" }
   * );
   * console.log(`Peak at: ${new Date(ts).toISOString()}`);
   * ```
   */
  public getPositionHighestProfitTimestamp = async (
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    backtest = false
  ): Promise<number> => {
    bt.loggerService.info(REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_TIMESTAMP, { symbol, context });
    bt.strategyValidationService.validate(context.strategyName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_TIMESTAMP);
    bt.exchangeValidationService.validate(context.exchangeName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_TIMESTAMP);
    context.frameName && bt.frameValidationService.validate(context.frameName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_TIMESTAMP);
    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_TIMESTAMP);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_TIMESTAMP));
      actions && actions.forEach((actionName) => bt.actionValidationService.validate(actionName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_TIMESTAMP));
    }
    if (await not(bt.strategyCoreService.hasPendingSignal(backtest, symbol, context))) {
      throw new Error(
        `Reflect.getPositionHighestProfitTimestamp no pending signal for symbol=${symbol} strategyName=${context.strategyName} exchangeName=${context.exchangeName} frameName=${context.frameName}`,
      );
    }
    return await bt.strategyCoreService.getPositionHighestProfitTimestamp(backtest, symbol, context);
  };

  /**
   * Returns the PnL percentage at the moment the best profit price was recorded during this position's life.
   *
   * Throws if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to PnL percentage
   *
   * @example
   * ```typescript
   * const peakPnl = await Reflect.getPositionHighestPnlPercentage(
   *   "BTCUSDT",
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "frame1" }
   * );
   * console.log(`Peak PNL: ${peakPnl}%`);
   * ```
   */
  public getPositionHighestPnlPercentage = async (
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    backtest = false
  ): Promise<number> => {
    bt.loggerService.info(REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PNL_PERCENTAGE, { symbol, context });
    bt.strategyValidationService.validate(context.strategyName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PNL_PERCENTAGE);
    bt.exchangeValidationService.validate(context.exchangeName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PNL_PERCENTAGE);
    context.frameName && bt.frameValidationService.validate(context.frameName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PNL_PERCENTAGE);
    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PNL_PERCENTAGE);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PNL_PERCENTAGE));
      actions && actions.forEach((actionName) => bt.actionValidationService.validate(actionName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PNL_PERCENTAGE));
    }
    if (await not(bt.strategyCoreService.hasPendingSignal(backtest, symbol, context))) {
      throw new Error(
        `Reflect.getPositionHighestPnlPercentage no pending signal for symbol=${symbol} strategyName=${context.strategyName} exchangeName=${context.exchangeName} frameName=${context.frameName}`,
      );
    }
    return await bt.strategyCoreService.getPositionHighestPnlPercentage(backtest, symbol, context);
  };

  /**
   * Returns the PnL cost (in quote currency) at the moment the best profit price was recorded during this position's life.
   *
   * Throws if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to PnL cost in quote currency
   *
   * @example
   * ```typescript
   * const peakCost = await Reflect.getPositionHighestPnlCost(
   *   "BTCUSDT",
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "frame1" }
   * );
   * console.log(`Peak PNL: $${peakCost}`);
   * ```
   */
  public getPositionHighestPnlCost = async (
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    backtest = false
  ): Promise<number> => {
    bt.loggerService.info(REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PNL_COST, { symbol, context });
    bt.strategyValidationService.validate(context.strategyName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PNL_COST);
    bt.exchangeValidationService.validate(context.exchangeName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PNL_COST);
    context.frameName && bt.frameValidationService.validate(context.frameName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PNL_COST);
    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PNL_COST);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PNL_COST));
      actions && actions.forEach((actionName) => bt.actionValidationService.validate(actionName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PNL_COST));
    }
    if (await not(bt.strategyCoreService.hasPendingSignal(backtest, symbol, context))) {
      throw new Error(
        `Reflect.getPositionHighestPnlCost no pending signal for symbol=${symbol} strategyName=${context.strategyName} exchangeName=${context.exchangeName} frameName=${context.frameName}`,
      );
    }
    return await bt.strategyCoreService.getPositionHighestPnlCost(backtest, symbol, context);
  };

  /**
   * Returns whether breakeven was mathematically reachable at the highest profit price.
   *
   * Throws if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to true if breakeven was reachable at peak, false otherwise
   *
   * @example
   * ```typescript
   * const wasReachable = await Reflect.getPositionHighestProfitBreakeven(
   *   "BTCUSDT",
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "frame1" }
   * );
   * console.log(`Breakeven reachable at peak: ${wasReachable}`);
   * ```
   */
  public getPositionHighestProfitBreakeven = async (
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    backtest = false
  ): Promise<boolean> => {
    bt.loggerService.info(REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_BREAKEVEN, { symbol, context });
    bt.strategyValidationService.validate(context.strategyName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_BREAKEVEN);
    bt.exchangeValidationService.validate(context.exchangeName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_BREAKEVEN);
    context.frameName && bt.frameValidationService.validate(context.frameName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_BREAKEVEN);
    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_BREAKEVEN);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_BREAKEVEN));
      actions && actions.forEach((actionName) => bt.actionValidationService.validate(actionName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_BREAKEVEN));
    }
    if (await not(bt.strategyCoreService.hasPendingSignal(backtest, symbol, context))) {
      throw new Error(
        `Reflect.getPositionHighestProfitBreakeven no pending signal for symbol=${symbol} strategyName=${context.strategyName} exchangeName=${context.exchangeName} frameName=${context.frameName}`,
      );
    }
    return await bt.strategyCoreService.getPositionHighestProfitBreakeven(backtest, symbol, context);
  };

  /**
   * Returns the number of minutes the position has been active since it opened.
   *
   * Throws if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to active minutes (≥ 0) or null
   */
  public getPositionActiveMinutes = async (
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    backtest = false
  ): Promise<number> => {
    bt.loggerService.info(REFLECT_METHOD_NAME_GET_POSITION_ACTIVE_MINUTES, { symbol, context });
    bt.strategyValidationService.validate(context.strategyName, REFLECT_METHOD_NAME_GET_POSITION_ACTIVE_MINUTES);
    bt.exchangeValidationService.validate(context.exchangeName, REFLECT_METHOD_NAME_GET_POSITION_ACTIVE_MINUTES);
    context.frameName && bt.frameValidationService.validate(context.frameName, REFLECT_METHOD_NAME_GET_POSITION_ACTIVE_MINUTES);
    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_ACTIVE_MINUTES);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_ACTIVE_MINUTES));
      actions && actions.forEach((actionName) => bt.actionValidationService.validate(actionName, REFLECT_METHOD_NAME_GET_POSITION_ACTIVE_MINUTES));
    }
    if (await not(bt.strategyCoreService.hasPendingSignal(backtest, symbol, context))) {
      throw new Error(
        `Reflect.getPositionActiveMinutes no pending signal for symbol=${symbol} strategyName=${context.strategyName} exchangeName=${context.exchangeName} frameName=${context.frameName}`,
      );
    }
    return await bt.strategyCoreService.getPositionActiveMinutes(backtest, symbol, context);
  };

  /**
   * Returns the number of minutes the scheduled signal has been waiting for activation.
   *
   * Returns null if no scheduled signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to waiting minutes (≥ 0) or null
   */
  public getPositionWaitingMinutes = async (
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    backtest = false
  ): Promise<number> => {
    bt.loggerService.info(REFLECT_METHOD_NAME_GET_POSITION_WAITING_MINUTES, { symbol, context });
    bt.strategyValidationService.validate(context.strategyName, REFLECT_METHOD_NAME_GET_POSITION_WAITING_MINUTES);
    bt.exchangeValidationService.validate(context.exchangeName, REFLECT_METHOD_NAME_GET_POSITION_WAITING_MINUTES);
    context.frameName && bt.frameValidationService.validate(context.frameName, REFLECT_METHOD_NAME_GET_POSITION_WAITING_MINUTES);
    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_WAITING_MINUTES);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_WAITING_MINUTES));
      actions && actions.forEach((actionName) => bt.actionValidationService.validate(actionName, REFLECT_METHOD_NAME_GET_POSITION_WAITING_MINUTES));
    }
    if (await not(bt.strategyCoreService.hasPendingSignal(backtest, symbol, context))) {
      throw new Error(
        `Reflect.getPositionWaitingMinutes no pending signal for symbol=${symbol} strategyName=${context.strategyName} exchangeName=${context.exchangeName} frameName=${context.frameName}`,
      );
    }
    return await bt.strategyCoreService.getPositionWaitingMinutes(backtest, symbol, context);
  };

  /**
   * Returns the number of minutes elapsed since the highest profit price was recorded.
   *
   * Throws if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to minutes since highest profit price was recorded, or null
   *
   * @example
   * ```typescript
   * const minutes = await Reflect.getPositionDrawdownMinutes(
   *   "BTCUSDT",
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "frame1" }
   * );
   * console.log(`Pulling back from peak for ${minutes} minutes`);
   * ```
   */
  public getPositionDrawdownMinutes = async (
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    backtest = false
  ): Promise<number> => {
    bt.loggerService.info(REFLECT_METHOD_NAME_GET_POSITION_DRAWDOWN_MINUTES, { symbol, context });
    bt.strategyValidationService.validate(context.strategyName, REFLECT_METHOD_NAME_GET_POSITION_DRAWDOWN_MINUTES);
    bt.exchangeValidationService.validate(context.exchangeName, REFLECT_METHOD_NAME_GET_POSITION_DRAWDOWN_MINUTES);
    context.frameName && bt.frameValidationService.validate(context.frameName, REFLECT_METHOD_NAME_GET_POSITION_DRAWDOWN_MINUTES);
    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_DRAWDOWN_MINUTES);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_DRAWDOWN_MINUTES));
      actions && actions.forEach((actionName) => bt.actionValidationService.validate(actionName, REFLECT_METHOD_NAME_GET_POSITION_DRAWDOWN_MINUTES));
    }
    if (await not(bt.strategyCoreService.hasPendingSignal(backtest, symbol, context))) {
      throw new Error(
        `Reflect.getPositionDrawdownMinutes no pending signal for symbol=${symbol} strategyName=${context.strategyName} exchangeName=${context.exchangeName} frameName=${context.frameName}`,
      );
    }
    return await bt.strategyCoreService.getPositionDrawdownMinutes(backtest, symbol, context);
  };

  /**
   * Returns the number of minutes elapsed since the highest profit price was recorded.
   *
   * Alias for getPositionDrawdownMinutes — measures how long the position has been
   * pulling back from its peak profit level.
   * Throws if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to minutes since last profit peak
   *
   * @example
   * ```typescript
   * const minutes = await Reflect.getPositionHighestProfitMinutes(
   *   "BTCUSDT",
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "frame1" }
   * );
   * console.log(`Pulling back from peak for ${minutes} minutes`);
   * ```
   */
  public getPositionHighestProfitMinutes = async (
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    backtest = false
  ): Promise<number> => {
    bt.loggerService.info(REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_MINUTES, { symbol, context });
    bt.strategyValidationService.validate(context.strategyName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_MINUTES);
    bt.exchangeValidationService.validate(context.exchangeName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_MINUTES);
    context.frameName && bt.frameValidationService.validate(context.frameName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_MINUTES);
    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_MINUTES);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_MINUTES));
      actions && actions.forEach((actionName) => bt.actionValidationService.validate(actionName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_MINUTES));
    }
    if (await not(bt.strategyCoreService.hasPendingSignal(backtest, symbol, context))) {
      throw new Error(
        `Reflect.getPositionHighestProfitMinutes no pending signal for symbol=${symbol} strategyName=${context.strategyName} exchangeName=${context.exchangeName} frameName=${context.frameName}`,
      );
    }
    return await bt.strategyCoreService.getPositionHighestProfitMinutes(backtest, symbol, context);
  };

  /**
   * Returns the number of minutes elapsed since the worst loss price was recorded.
   *
   * Measures how long ago the deepest drawdown point occurred.
   * Zero when called at the exact moment the trough was set.
   * Throws if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to minutes since last drawdown trough
   *
   * @example
   * ```typescript
   * const minutes = await Reflect.getPositionMaxDrawdownMinutes(
   *   "BTCUSDT",
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "frame1" }
   * );
   * console.log(`Drawdown trough was ${minutes} minutes ago`);
   * ```
   */
  public getPositionMaxDrawdownMinutes = async (
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    backtest = false
  ): Promise<number> => {
    bt.loggerService.info(REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_MINUTES, { symbol, context });
    bt.strategyValidationService.validate(context.strategyName, REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_MINUTES);
    bt.exchangeValidationService.validate(context.exchangeName, REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_MINUTES);
    context.frameName && bt.frameValidationService.validate(context.frameName, REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_MINUTES);
    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_MINUTES);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_MINUTES));
      actions && actions.forEach((actionName) => bt.actionValidationService.validate(actionName, REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_MINUTES));
    }
    if (await not(bt.strategyCoreService.hasPendingSignal(backtest, symbol, context))) {
      throw new Error(
        `Reflect.getPositionMaxDrawdownMinutes no pending signal for symbol=${symbol} strategyName=${context.strategyName} exchangeName=${context.exchangeName} frameName=${context.frameName}`,
      );
    }
    return await bt.strategyCoreService.getPositionMaxDrawdownMinutes(backtest, symbol, context);
  };

  /**
   * Returns the worst price reached in the loss direction during this position's life.
   *
   * Throws if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to price
   *
   * @example
   * ```typescript
   * const troughPrice = await Reflect.getPositionMaxDrawdownPrice(
   *   "BTCUSDT",
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "frame1" }
   * );
   * console.log(`Worst price: ${troughPrice}`);
   * ```
   */
  public getPositionMaxDrawdownPrice = async (
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    backtest = false
  ): Promise<number> => {
    bt.loggerService.info(REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_PRICE, { symbol, context });
    bt.strategyValidationService.validate(context.strategyName, REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_PRICE);
    bt.exchangeValidationService.validate(context.exchangeName, REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_PRICE);
    context.frameName && bt.frameValidationService.validate(context.frameName, REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_PRICE);
    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_PRICE);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_PRICE));
      actions && actions.forEach((actionName) => bt.actionValidationService.validate(actionName, REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_PRICE));
    }
    if (await not(bt.strategyCoreService.hasPendingSignal(backtest, symbol, context))) {
      throw new Error(
        `Reflect.getPositionMaxDrawdownPrice no pending signal for symbol=${symbol} strategyName=${context.strategyName} exchangeName=${context.exchangeName} frameName=${context.frameName}`,
      );
    }
    return await bt.strategyCoreService.getPositionMaxDrawdownPrice(backtest, symbol, context);
  };

  /**
   * Returns the timestamp when the worst loss price was recorded during this position's life.
   *
   * Throws if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to timestamp in milliseconds
   *
   * @example
   * ```typescript
   * const ts = await Reflect.getPositionMaxDrawdownTimestamp(
   *   "BTCUSDT",
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "frame1" }
   * );
   * console.log(`Worst drawdown at: ${new Date(ts).toISOString()}`);
   * ```
   */
  public getPositionMaxDrawdownTimestamp = async (
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    backtest = false
  ): Promise<number> => {
    bt.loggerService.info(REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_TIMESTAMP, { symbol, context });
    bt.strategyValidationService.validate(context.strategyName, REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_TIMESTAMP);
    bt.exchangeValidationService.validate(context.exchangeName, REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_TIMESTAMP);
    context.frameName && bt.frameValidationService.validate(context.frameName, REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_TIMESTAMP);
    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_TIMESTAMP);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_TIMESTAMP));
      actions && actions.forEach((actionName) => bt.actionValidationService.validate(actionName, REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_TIMESTAMP));
    }
    if (await not(bt.strategyCoreService.hasPendingSignal(backtest, symbol, context))) {
      throw new Error(
        `Reflect.getPositionMaxDrawdownTimestamp no pending signal for symbol=${symbol} strategyName=${context.strategyName} exchangeName=${context.exchangeName} frameName=${context.frameName}`,
      );
    }
    return await bt.strategyCoreService.getPositionMaxDrawdownTimestamp(backtest, symbol, context);
  };

  /**
   * Returns the PnL percentage at the moment the worst loss price was recorded during this position's life.
   *
   * Throws if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to PnL percentage
   *
   * @example
   * ```typescript
   * const worstPnl = await Reflect.getPositionMaxDrawdownPnlPercentage(
   *   "BTCUSDT",
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "frame1" }
   * );
   * console.log(`Worst PNL: ${worstPnl}%`);
   * ```
   */
  public getPositionMaxDrawdownPnlPercentage = async (
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    backtest = false
  ): Promise<number> => {
    bt.loggerService.info(REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_PNL_PERCENTAGE, { symbol, context });
    bt.strategyValidationService.validate(context.strategyName, REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_PNL_PERCENTAGE);
    bt.exchangeValidationService.validate(context.exchangeName, REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_PNL_PERCENTAGE);
    context.frameName && bt.frameValidationService.validate(context.frameName, REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_PNL_PERCENTAGE);
    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_PNL_PERCENTAGE);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_PNL_PERCENTAGE));
      actions && actions.forEach((actionName) => bt.actionValidationService.validate(actionName, REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_PNL_PERCENTAGE));
    }
    if (await not(bt.strategyCoreService.hasPendingSignal(backtest, symbol, context))) {
      throw new Error(
        `Reflect.getPositionMaxDrawdownPnlPercentage no pending signal for symbol=${symbol} strategyName=${context.strategyName} exchangeName=${context.exchangeName} frameName=${context.frameName}`,
      );
    }
    return await bt.strategyCoreService.getPositionMaxDrawdownPnlPercentage(backtest, symbol, context);
  };

  /**
   * Returns the PnL cost (in quote currency) at the moment the worst loss price was recorded during this position's life.
   *
   * Throws if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to PnL cost in quote currency
   *
   * @example
   * ```typescript
   * const worstCost = await Reflect.getPositionMaxDrawdownPnlCost(
   *   "BTCUSDT",
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "frame1" }
   * );
   * console.log(`Worst PNL: $${worstCost}`);
   * ```
   */
  public getPositionMaxDrawdownPnlCost = async (
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    backtest = false
  ): Promise<number> => {
    bt.loggerService.info(REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_PNL_COST, { symbol, context });
    bt.strategyValidationService.validate(context.strategyName, REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_PNL_COST);
    bt.exchangeValidationService.validate(context.exchangeName, REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_PNL_COST);
    context.frameName && bt.frameValidationService.validate(context.frameName, REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_PNL_COST);
    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_PNL_COST);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_PNL_COST));
      actions && actions.forEach((actionName) => bt.actionValidationService.validate(actionName, REFLECT_METHOD_NAME_GET_POSITION_MAX_DRAWDOWN_PNL_COST));
    }
    if (await not(bt.strategyCoreService.hasPendingSignal(backtest, symbol, context))) {
      throw new Error(
        `Reflect.getPositionMaxDrawdownPnlCost no pending signal for symbol=${symbol} strategyName=${context.strategyName} exchangeName=${context.exchangeName} frameName=${context.frameName}`,
      );
    }
    return await bt.strategyCoreService.getPositionMaxDrawdownPnlCost(backtest, symbol, context);
  };

  /**
   * Returns the distance in PnL percentage between the current price and the highest profit peak.
   *
   * Result is ≥ 0. Throws if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to drawdown distance in PnL% (≥ 0) or null
   *
   * @example
   * ```typescript
   * const distance = await Reflect.getPositionHighestProfitDistancePnlPercentage(
   *   "BTCUSDT",
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "frame1" }
   * );
   * console.log(`Dropped ${distance}% from peak`);
   * ```
   */
  public getPositionHighestProfitDistancePnlPercentage = async (
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    backtest = false
  ): Promise<number> => {
    bt.loggerService.info(REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_DISTANCE_PNL_PERCENTAGE, { symbol, context });
    bt.strategyValidationService.validate(context.strategyName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_DISTANCE_PNL_PERCENTAGE);
    bt.exchangeValidationService.validate(context.exchangeName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_DISTANCE_PNL_PERCENTAGE);
    context.frameName && bt.frameValidationService.validate(context.frameName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_DISTANCE_PNL_PERCENTAGE);
    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_DISTANCE_PNL_PERCENTAGE);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_DISTANCE_PNL_PERCENTAGE));
      actions && actions.forEach((actionName) => bt.actionValidationService.validate(actionName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_DISTANCE_PNL_PERCENTAGE));
    }
    if (await not(bt.strategyCoreService.hasPendingSignal(backtest, symbol, context))) {
      throw new Error(
        `Reflect.getPositionHighestProfitDistancePnlPercentage no pending signal for symbol=${symbol} strategyName=${context.strategyName} exchangeName=${context.exchangeName} frameName=${context.frameName}`,
      );
    }
    return await bt.strategyCoreService.getPositionHighestProfitDistancePnlPercentage(backtest, symbol, context);
  };

  /**
   * Returns the distance in PnL cost between the current price and the highest profit peak.
   *
   * Result is ≥ 0. Throws if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to drawdown distance in PnL cost (≥ 0) or null
   *
   * @example
   * ```typescript
   * const distance = await Reflect.getPositionHighestProfitDistancePnlCost(
   *   "BTCUSDT",
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "frame1" }
   * );
   * console.log(`Dropped $${distance} from peak`);
   * ```
   */
  public getPositionHighestProfitDistancePnlCost = async (
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    backtest = false
  ): Promise<number> => {
    bt.loggerService.info(REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_DISTANCE_PNL_COST, { symbol, context });
    bt.strategyValidationService.validate(context.strategyName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_DISTANCE_PNL_COST);
    bt.exchangeValidationService.validate(context.exchangeName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_DISTANCE_PNL_COST);
    context.frameName && bt.frameValidationService.validate(context.frameName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_DISTANCE_PNL_COST);
    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_DISTANCE_PNL_COST);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_DISTANCE_PNL_COST));
      actions && actions.forEach((actionName) => bt.actionValidationService.validate(actionName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_PROFIT_DISTANCE_PNL_COST));
    }
    if (await not(bt.strategyCoreService.hasPendingSignal(backtest, symbol, context))) {
      throw new Error(
        `Reflect.getPositionHighestProfitDistancePnlCost no pending signal for symbol=${symbol} strategyName=${context.strategyName} exchangeName=${context.exchangeName} frameName=${context.frameName}`,
      );
    }
    return await bt.strategyCoreService.getPositionHighestProfitDistancePnlCost(backtest, symbol, context);
  };

  /**
   * Returns the distance in PnL percentage between the current price and the worst drawdown trough.
   *
   * Result is ≥ 0. Throws if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to recovery distance from worst drawdown trough in PnL% (≥ 0) or null
   *
   * @example
   * ```typescript
   * const distance = await Reflect.getPositionHighestMaxDrawdownPnlPercentage(
   *   "BTCUSDT",
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "frame1" }
   * );
   * console.log(`${distance}% above worst trough`);
   * ```
   */
  public getPositionHighestMaxDrawdownPnlPercentage = async (
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    backtest = false
  ): Promise<number> => {
    bt.loggerService.info(REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_MAX_DRAWDOWN_PNL_PERCENTAGE, { symbol, context });
    bt.strategyValidationService.validate(context.strategyName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_MAX_DRAWDOWN_PNL_PERCENTAGE);
    bt.exchangeValidationService.validate(context.exchangeName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_MAX_DRAWDOWN_PNL_PERCENTAGE);
    context.frameName && bt.frameValidationService.validate(context.frameName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_MAX_DRAWDOWN_PNL_PERCENTAGE);
    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_MAX_DRAWDOWN_PNL_PERCENTAGE);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_MAX_DRAWDOWN_PNL_PERCENTAGE));
      actions && actions.forEach((actionName) => bt.actionValidationService.validate(actionName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_MAX_DRAWDOWN_PNL_PERCENTAGE));
    }
    if (await not(bt.strategyCoreService.hasPendingSignal(backtest, symbol, context))) {
      throw new Error(
        `Reflect.getPositionHighestMaxDrawdownPnlPercentage no pending signal for symbol=${symbol} strategyName=${context.strategyName} exchangeName=${context.exchangeName} frameName=${context.frameName}`,
      );
    }
    return await bt.strategyCoreService.getPositionHighestMaxDrawdownPnlPercentage(backtest, symbol, context);
  };

  /**
   * Returns the distance in PnL cost between the current price and the worst drawdown trough.
   *
   * Result is ≥ 0. Throws if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to recovery distance from worst drawdown trough in PnL cost (≥ 0) or null
   *
   * @example
   * ```typescript
   * const distance = await Reflect.getPositionHighestMaxDrawdownPnlCost(
   *   "BTCUSDT",
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "frame1" }
   * );
   * console.log(`$${distance} above worst trough`);
   * ```
   */
  public getPositionHighestMaxDrawdownPnlCost = async (
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    backtest = false
  ): Promise<number> => {
    bt.loggerService.info(REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_MAX_DRAWDOWN_PNL_COST, { symbol, context });
    bt.strategyValidationService.validate(context.strategyName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_MAX_DRAWDOWN_PNL_COST);
    bt.exchangeValidationService.validate(context.exchangeName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_MAX_DRAWDOWN_PNL_COST);
    context.frameName && bt.frameValidationService.validate(context.frameName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_MAX_DRAWDOWN_PNL_COST);
    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_MAX_DRAWDOWN_PNL_COST);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_MAX_DRAWDOWN_PNL_COST));
      actions && actions.forEach((actionName) => bt.actionValidationService.validate(actionName, REFLECT_METHOD_NAME_GET_POSITION_HIGHEST_MAX_DRAWDOWN_PNL_COST));
    }
    if (await not(bt.strategyCoreService.hasPendingSignal(backtest, symbol, context))) {
      throw new Error(
        `Reflect.getPositionHighestMaxDrawdownPnlCost no pending signal for symbol=${symbol} strategyName=${context.strategyName} exchangeName=${context.exchangeName} frameName=${context.frameName}`,
      );
    }
    return await bt.strategyCoreService.getPositionHighestMaxDrawdownPnlCost(backtest, symbol, context);
  };

  /**
   * Returns the peak-to-trough PnL percentage distance between the position's highest profit and deepest drawdown.
   *
   * Result is ≥ 0. Throws if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to peak-to-trough PnL percentage distance (≥ 0) or null
   *
   * @example
   * ```typescript
   * const distance = await Reflect.getMaxDrawdownDistancePnlPercentage(
   *   "BTCUSDT",
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "frame1" }
   * );
   * console.log(`Peak-to-trough: ${distance}%`);
   * ```
   */
  public getMaxDrawdownDistancePnlPercentage = async (
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    backtest = false
  ): Promise<number> => {
    bt.loggerService.info(REFLECT_METHOD_NAME_GET_MAX_DRAWDOWN_DISTANCE_PNL_PERCENTAGE, { symbol, context });
    bt.strategyValidationService.validate(context.strategyName, REFLECT_METHOD_NAME_GET_MAX_DRAWDOWN_DISTANCE_PNL_PERCENTAGE);
    bt.exchangeValidationService.validate(context.exchangeName, REFLECT_METHOD_NAME_GET_MAX_DRAWDOWN_DISTANCE_PNL_PERCENTAGE);
    context.frameName && bt.frameValidationService.validate(context.frameName, REFLECT_METHOD_NAME_GET_MAX_DRAWDOWN_DISTANCE_PNL_PERCENTAGE);
    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_MAX_DRAWDOWN_DISTANCE_PNL_PERCENTAGE);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_MAX_DRAWDOWN_DISTANCE_PNL_PERCENTAGE));
      actions && actions.forEach((actionName) => bt.actionValidationService.validate(actionName, REFLECT_METHOD_NAME_GET_MAX_DRAWDOWN_DISTANCE_PNL_PERCENTAGE));
    }
    if (await not(bt.strategyCoreService.hasPendingSignal(backtest, symbol, context))) {
      throw new Error(
        `Reflect.getMaxDrawdownDistancePnlPercentage no pending signal for symbol=${symbol} strategyName=${context.strategyName} exchangeName=${context.exchangeName} frameName=${context.frameName}`,
      );
    }
    return await bt.strategyCoreService.getMaxDrawdownDistancePnlPercentage(backtest, symbol, context);
  };

  /**
   * Returns the peak-to-trough PnL cost distance between the position's highest profit and deepest drawdown.
   *
   * Result is ≥ 0. Throws if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to peak-to-trough PnL cost distance (≥ 0) or null
   *
   * @example
   * ```typescript
   * const distance = await Reflect.getMaxDrawdownDistancePnlCost(
   *   "BTCUSDT",
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "frame1" }
   * );
   * console.log(`Peak-to-trough: $${distance}`);
   * ```
   */
  public getMaxDrawdownDistancePnlCost = async (
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    backtest = false
  ): Promise<number> => {
    bt.loggerService.info(REFLECT_METHOD_NAME_GET_MAX_DRAWDOWN_DISTANCE_PNL_COST, { symbol, context });
    bt.strategyValidationService.validate(context.strategyName, REFLECT_METHOD_NAME_GET_MAX_DRAWDOWN_DISTANCE_PNL_COST);
    bt.exchangeValidationService.validate(context.exchangeName, REFLECT_METHOD_NAME_GET_MAX_DRAWDOWN_DISTANCE_PNL_COST);
    context.frameName && bt.frameValidationService.validate(context.frameName, REFLECT_METHOD_NAME_GET_MAX_DRAWDOWN_DISTANCE_PNL_COST);
    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_MAX_DRAWDOWN_DISTANCE_PNL_COST);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_MAX_DRAWDOWN_DISTANCE_PNL_COST));
      actions && actions.forEach((actionName) => bt.actionValidationService.validate(actionName, REFLECT_METHOD_NAME_GET_MAX_DRAWDOWN_DISTANCE_PNL_COST));
    }
    if (await not(bt.strategyCoreService.hasPendingSignal(backtest, symbol, context))) {
      throw new Error(
        `Reflect.getMaxDrawdownDistancePnlCost no pending signal for symbol=${symbol} strategyName=${context.strategyName} exchangeName=${context.exchangeName} frameName=${context.frameName}`,
      );
    }
    return await bt.strategyCoreService.getMaxDrawdownDistancePnlCost(backtest, symbol, context);
  };

  /**
   * Returns the VWAP price at the trough of the worst peak-rollback episode (`_stale`).
   *
   * Throws if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to price
   *
   * @example
   * ```typescript
   * const troughPrice = await Reflect.getPositionWorstStalePrice(
   *   "BTCUSDT",
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "frame1" }
   * );
   * console.log(`Stale trough price: ${troughPrice}`);
   * ```
   */
  public getPositionWorstStalePrice = async (
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    backtest = false
  ): Promise<number> => {
    bt.loggerService.info(REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_PRICE, { symbol, context });
    bt.strategyValidationService.validate(context.strategyName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_PRICE);
    bt.exchangeValidationService.validate(context.exchangeName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_PRICE);
    context.frameName && bt.frameValidationService.validate(context.frameName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_PRICE);
    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_PRICE);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_PRICE));
      actions && actions.forEach((actionName) => bt.actionValidationService.validate(actionName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_PRICE));
    }
    if (await not(bt.strategyCoreService.hasPendingSignal(backtest, symbol, context))) {
      throw new Error(
        `Reflect.getPositionWorstStalePrice no pending signal for symbol=${symbol} strategyName=${context.strategyName} exchangeName=${context.exchangeName} frameName=${context.frameName}`,
      );
    }
    return await bt.strategyCoreService.getPositionWorstStalePrice(backtest, symbol, context);
  };

  /**
   * Returns the timestamp when the trough of the worst peak-rollback episode was recorded.
   *
   * Throws if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to timestamp in milliseconds
   *
   * @example
   * ```typescript
   * const ts = await Reflect.getPositionWorstStaleTimestamp(
   *   "BTCUSDT",
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "frame1" }
   * );
   * console.log(`Stale trough at: ${new Date(ts).toISOString()}`);
   * ```
   */
  public getPositionWorstStaleTimestamp = async (
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    backtest = false
  ): Promise<number> => {
    bt.loggerService.info(REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_TIMESTAMP, { symbol, context });
    bt.strategyValidationService.validate(context.strategyName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_TIMESTAMP);
    bt.exchangeValidationService.validate(context.exchangeName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_TIMESTAMP);
    context.frameName && bt.frameValidationService.validate(context.frameName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_TIMESTAMP);
    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_TIMESTAMP);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_TIMESTAMP));
      actions && actions.forEach((actionName) => bt.actionValidationService.validate(actionName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_TIMESTAMP));
    }
    if (await not(bt.strategyCoreService.hasPendingSignal(backtest, symbol, context))) {
      throw new Error(
        `Reflect.getPositionWorstStaleTimestamp no pending signal for symbol=${symbol} strategyName=${context.strategyName} exchangeName=${context.exchangeName} frameName=${context.frameName}`,
      );
    }
    return await bt.strategyCoreService.getPositionWorstStaleTimestamp(backtest, symbol, context);
  };

  /**
   * Returns the realizable PnL percentage at the trough of the worst peak-rollback episode (effective profitLock; ≥ 0 means a breakeven-or-better exit stayed reachable).
   *
   * Throws if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to PnL percentage
   *
   * @example
   * ```typescript
   * const profitLock = await Reflect.getPositionWorstStalePnlPercentage(
   *   "BTCUSDT",
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "frame1" }
   * );
   * console.log(`Effective profitLock: ${profitLock}%`);
   * ```
   */
  public getPositionWorstStalePnlPercentage = async (
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    backtest = false
  ): Promise<number> => {
    bt.loggerService.info(REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_PNL_PERCENTAGE, { symbol, context });
    bt.strategyValidationService.validate(context.strategyName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_PNL_PERCENTAGE);
    bt.exchangeValidationService.validate(context.exchangeName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_PNL_PERCENTAGE);
    context.frameName && bt.frameValidationService.validate(context.frameName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_PNL_PERCENTAGE);
    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_PNL_PERCENTAGE);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_PNL_PERCENTAGE));
      actions && actions.forEach((actionName) => bt.actionValidationService.validate(actionName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_PNL_PERCENTAGE));
    }
    if (await not(bt.strategyCoreService.hasPendingSignal(backtest, symbol, context))) {
      throw new Error(
        `Reflect.getPositionWorstStalePnlPercentage no pending signal for symbol=${symbol} strategyName=${context.strategyName} exchangeName=${context.exchangeName} frameName=${context.frameName}`,
      );
    }
    return await bt.strategyCoreService.getPositionWorstStalePnlPercentage(backtest, symbol, context);
  };

  /**
   * Returns the realizable PnL cost (in quote currency) at the trough of the worst peak-rollback episode.
   *
   * Throws if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to PnL cost
   *
   * @example
   * ```typescript
   * const troughCost = await Reflect.getPositionWorstStalePnlCost(
   *   "BTCUSDT",
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "frame1" }
   * );
   * console.log(`Stale trough PnL: $${troughCost}`);
   * ```
   */
  public getPositionWorstStalePnlCost = async (
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    backtest = false
  ): Promise<number> => {
    bt.loggerService.info(REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_PNL_COST, { symbol, context });
    bt.strategyValidationService.validate(context.strategyName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_PNL_COST);
    bt.exchangeValidationService.validate(context.exchangeName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_PNL_COST);
    context.frameName && bt.frameValidationService.validate(context.frameName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_PNL_COST);
    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_PNL_COST);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_PNL_COST));
      actions && actions.forEach((actionName) => bt.actionValidationService.validate(actionName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_PNL_COST));
    }
    if (await not(bt.strategyCoreService.hasPendingSignal(backtest, symbol, context))) {
      throw new Error(
        `Reflect.getPositionWorstStalePnlCost no pending signal for symbol=${symbol} strategyName=${context.strategyName} exchangeName=${context.exchangeName} frameName=${context.frameName}`,
      );
    }
    return await bt.strategyCoreService.getPositionWorstStalePnlCost(backtest, symbol, context);
  };

  /**
   * Returns the giveback of the worst peak-rollback episode in PnL percentage (effective trailingTake distance).
   *
   * Throws if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to giveback PnL% (≥ 0)
   *
   * @example
   * ```typescript
   * const giveback = await Reflect.getPositionWorstStaleGivebackPnlPercentage(
   *   "BTCUSDT",
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "frame1" }
   * );
   * console.log(`Effective trailingTake: ${giveback}%`);
   * ```
   */
  public getPositionWorstStaleGivebackPnlPercentage = async (
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    backtest = false
  ): Promise<number> => {
    bt.loggerService.info(REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_GIVEBACK_PNL_PERCENTAGE, { symbol, context });
    bt.strategyValidationService.validate(context.strategyName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_GIVEBACK_PNL_PERCENTAGE);
    bt.exchangeValidationService.validate(context.exchangeName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_GIVEBACK_PNL_PERCENTAGE);
    context.frameName && bt.frameValidationService.validate(context.frameName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_GIVEBACK_PNL_PERCENTAGE);
    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_GIVEBACK_PNL_PERCENTAGE);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_GIVEBACK_PNL_PERCENTAGE));
      actions && actions.forEach((actionName) => bt.actionValidationService.validate(actionName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_GIVEBACK_PNL_PERCENTAGE));
    }
    if (await not(bt.strategyCoreService.hasPendingSignal(backtest, symbol, context))) {
      throw new Error(
        `Reflect.getPositionWorstStaleGivebackPnlPercentage no pending signal for symbol=${symbol} strategyName=${context.strategyName} exchangeName=${context.exchangeName} frameName=${context.frameName}`,
      );
    }
    return await bt.strategyCoreService.getPositionWorstStaleGivebackPnlPercentage(backtest, symbol, context);
  };

  /**
   * Returns the giveback of the worst peak-rollback episode in PnL cost (quote currency).
   *
   * Throws if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to giveback PnL cost (≥ 0)
   *
   * @example
   * ```typescript
   * const giveback = await Reflect.getPositionWorstStaleGivebackPnlCost(
   *   "BTCUSDT",
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "frame1" }
   * );
   * console.log(`Gave back $${giveback} from peak`);
   * ```
   */
  public getPositionWorstStaleGivebackPnlCost = async (
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    backtest = false
  ): Promise<number> => {
    bt.loggerService.info(REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_GIVEBACK_PNL_COST, { symbol, context });
    bt.strategyValidationService.validate(context.strategyName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_GIVEBACK_PNL_COST);
    bt.exchangeValidationService.validate(context.exchangeName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_GIVEBACK_PNL_COST);
    context.frameName && bt.frameValidationService.validate(context.frameName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_GIVEBACK_PNL_COST);
    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_GIVEBACK_PNL_COST);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_GIVEBACK_PNL_COST));
      actions && actions.forEach((actionName) => bt.actionValidationService.validate(actionName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_GIVEBACK_PNL_COST));
    }
    if (await not(bt.strategyCoreService.hasPendingSignal(backtest, symbol, context))) {
      throw new Error(
        `Reflect.getPositionWorstStaleGivebackPnlCost no pending signal for symbol=${symbol} strategyName=${context.strategyName} exchangeName=${context.exchangeName} frameName=${context.frameName}`,
      );
    }
    return await bt.strategyCoreService.getPositionWorstStaleGivebackPnlCost(backtest, symbol, context);
  };

  /**
   * Returns the duration of the worst peak-rollback episode in minutes (peak -> trough, effective staleness duration).
   *
   * Throws if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to minutes (≥ 0)
   *
   * @example
   * ```typescript
   * const minutes = await Reflect.getPositionWorstStaleMinutes(
   *   "BTCUSDT",
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "frame1" }
   * );
   * console.log(`Rollback ran ${minutes} minutes`);
   * ```
   */
  public getPositionWorstStaleMinutes = async (
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    backtest = false
  ): Promise<number> => {
    bt.loggerService.info(REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_MINUTES, { symbol, context });
    bt.strategyValidationService.validate(context.strategyName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_MINUTES);
    bt.exchangeValidationService.validate(context.exchangeName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_MINUTES);
    context.frameName && bt.frameValidationService.validate(context.frameName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_MINUTES);
    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_MINUTES);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_MINUTES));
      actions && actions.forEach((actionName) => bt.actionValidationService.validate(actionName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_MINUTES));
    }
    if (await not(bt.strategyCoreService.hasPendingSignal(backtest, symbol, context))) {
      throw new Error(
        `Reflect.getPositionWorstStaleMinutes no pending signal for symbol=${symbol} strategyName=${context.strategyName} exchangeName=${context.exchangeName} frameName=${context.frameName}`,
      );
    }
    return await bt.strategyCoreService.getPositionWorstStaleMinutes(backtest, symbol, context);
  };

  /**
   * Returns the minutes from position open to the peak the worst rollback fell from (effective holdMinutes).
   *
   * Throws if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to minutes (≥ 0)
   *
   * @example
   * ```typescript
   * const minutes = await Reflect.getPositionWorstStaleHoldMinutes(
   *   "BTCUSDT",
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "frame1" }
   * );
   * console.log(`Effective holdMinutes: ${minutes}`);
   * ```
   */
  public getPositionWorstStaleHoldMinutes = async (
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    backtest = false
  ): Promise<number> => {
    bt.loggerService.info(REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_HOLD_MINUTES, { symbol, context });
    bt.strategyValidationService.validate(context.strategyName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_HOLD_MINUTES);
    bt.exchangeValidationService.validate(context.exchangeName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_HOLD_MINUTES);
    context.frameName && bt.frameValidationService.validate(context.frameName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_HOLD_MINUTES);
    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_HOLD_MINUTES);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_HOLD_MINUTES));
      actions && actions.forEach((actionName) => bt.actionValidationService.validate(actionName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_HOLD_MINUTES));
    }
    if (await not(bt.strategyCoreService.hasPendingSignal(backtest, symbol, context))) {
      throw new Error(
        `Reflect.getPositionWorstStaleHoldMinutes no pending signal for symbol=${symbol} strategyName=${context.strategyName} exchangeName=${context.exchangeName} frameName=${context.frameName}`,
      );
    }
    return await bt.strategyCoreService.getPositionWorstStaleHoldMinutes(backtest, symbol, context);
  };

  /**
   * Returns the realizable PnL percentage at the peak the worst rollback fell from (effective staleness profit threshold).
   *
   * Throws if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to PnL percentage (≥ 0)
   *
   * @example
   * ```typescript
   * const peakPnl = await Reflect.getPositionWorstStalePeakPnlPercentage(
   *   "BTCUSDT",
   *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "frame1" }
   * );
   * console.log(`Rollback started from +${peakPnl}%`);
   * ```
   */
  public getPositionWorstStalePeakPnlPercentage = async (
    symbol: string,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    backtest = false
  ): Promise<number> => {
    bt.loggerService.info(REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_PEAK_PNL_PERCENTAGE, { symbol, context });
    bt.strategyValidationService.validate(context.strategyName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_PEAK_PNL_PERCENTAGE);
    bt.exchangeValidationService.validate(context.exchangeName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_PEAK_PNL_PERCENTAGE);
    context.frameName && bt.frameValidationService.validate(context.frameName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_PEAK_PNL_PERCENTAGE);
    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_PEAK_PNL_PERCENTAGE);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_PEAK_PNL_PERCENTAGE));
      actions && actions.forEach((actionName) => bt.actionValidationService.validate(actionName, REFLECT_METHOD_NAME_GET_POSITION_WORST_STALE_PEAK_PNL_PERCENTAGE));
    }
    if (await not(bt.strategyCoreService.hasPendingSignal(backtest, symbol, context))) {
      throw new Error(
        `Reflect.getPositionWorstStalePeakPnlPercentage no pending signal for symbol=${symbol} strategyName=${context.strategyName} exchangeName=${context.exchangeName} frameName=${context.frameName}`,
      );
    }
    return await bt.strategyCoreService.getPositionWorstStalePeakPnlPercentage(backtest, symbol, context);
  };
}

/**
 * Singleton instance of ReflectUtils for convenient position state queries.
 *
 * @example
 * ```typescript
 * import { Reflect } from "backtest-kit";
 *
 * // Real-time PNL
 * const pnl = await Reflect.getPositionPnlPercent(
 *   "BTCUSDT",
 *   45000,
 *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "frame1" }
 * );
 * console.log(`PNL: ${pnl}%`);
 *
 * // Peak profit
 * const peakPnl = await Reflect.getPositionHighestPnlPercentage(
 *   "BTCUSDT",
 *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "frame1" }
 * );
 * console.log(`Peak PNL: ${peakPnl}%`);
 *
 * // Drawdown from peak
 * const drawdown = await Reflect.getPositionHighestProfitDistancePnlPercentage(
 *   "BTCUSDT",
 *   { strategyName: "my-strategy", exchangeName: "binance", frameName: "frame1" }
 * );
 * console.log(`Dropped ${drawdown}% from peak`);
 * ```
 */
export const Reflect = new ReflectUtils();

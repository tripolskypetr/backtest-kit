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
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param currentPrice - Current market price
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to PNL percentage or null
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
  ): Promise<number | null> => {
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
    return await bt.strategyCoreService.getPositionPnlPercent(backtest, symbol, currentPrice, context);
  };

  /**
   * Returns the unrealized PNL in dollars for the current pending signal at currentPrice.
   *
   * Calculated as: pnlPercentage / 100 × totalInvestedCost.
   * Accounts for partial closes, DCA entries, slippage and fees.
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param currentPrice - Current market price
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to PNL in dollars or null
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
  ): Promise<number | null> => {
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
    return await bt.strategyCoreService.getPositionPnlCost(backtest, symbol, currentPrice, context);
  };

  /**
   * Returns the best price reached in the profit direction during this position's life.
   *
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to price or null
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
  ): Promise<number | null> => {
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
    return await bt.strategyCoreService.getPositionHighestProfitPrice(backtest, symbol, context);
  };

  /**
   * Returns the timestamp when the best profit price was recorded during this position's life.
   *
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to timestamp in milliseconds or null
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
  ): Promise<number | null> => {
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
    return await bt.strategyCoreService.getPositionHighestProfitTimestamp(backtest, symbol, context);
  };

  /**
   * Returns the PnL percentage at the moment the best profit price was recorded during this position's life.
   *
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to PnL percentage or null
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
  ): Promise<number | null> => {
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
    return await bt.strategyCoreService.getPositionHighestPnlPercentage(backtest, symbol, context);
  };

  /**
   * Returns the PnL cost (in quote currency) at the moment the best profit price was recorded during this position's life.
   *
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to PnL cost in quote currency or null
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
  ): Promise<number | null> => {
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
    return await bt.strategyCoreService.getPositionHighestPnlCost(backtest, symbol, context);
  };

  /**
   * Returns whether breakeven was mathematically reachable at the highest profit price.
   *
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to true if breakeven was reachable at peak, false otherwise, or null
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
  ): Promise<boolean | null> => {
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
    return await bt.strategyCoreService.getPositionHighestProfitBreakeven(backtest, symbol, context);
  };

  /**
   * Returns the number of minutes elapsed since the highest profit price was recorded.
   *
   * Returns null if no pending signal exists.
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
  ): Promise<number | null> => {
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
    return await bt.strategyCoreService.getPositionDrawdownMinutes(backtest, symbol, context);
  };

  /**
   * Returns the number of minutes elapsed since the highest profit price was recorded.
   *
   * Alias for getPositionDrawdownMinutes — measures how long the position has been
   * pulling back from its peak profit level.
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to minutes since last profit peak or null
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
  ): Promise<number | null> => {
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
    return await bt.strategyCoreService.getPositionHighestProfitMinutes(backtest, symbol, context);
  };

  /**
   * Returns the number of minutes elapsed since the worst loss price was recorded.
   *
   * Measures how long ago the deepest drawdown point occurred.
   * Zero when called at the exact moment the trough was set.
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to minutes since last drawdown trough or null
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
  ): Promise<number | null> => {
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
    return await bt.strategyCoreService.getPositionMaxDrawdownMinutes(backtest, symbol, context);
  };

  /**
   * Returns the worst price reached in the loss direction during this position's life.
   *
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to price or null
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
  ): Promise<number | null> => {
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
    return await bt.strategyCoreService.getPositionMaxDrawdownPrice(backtest, symbol, context);
  };

  /**
   * Returns the timestamp when the worst loss price was recorded during this position's life.
   *
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to timestamp in milliseconds or null
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
  ): Promise<number | null> => {
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
    return await bt.strategyCoreService.getPositionMaxDrawdownTimestamp(backtest, symbol, context);
  };

  /**
   * Returns the PnL percentage at the moment the worst loss price was recorded during this position's life.
   *
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to PnL percentage or null
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
  ): Promise<number | null> => {
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
    return await bt.strategyCoreService.getPositionMaxDrawdownPnlPercentage(backtest, symbol, context);
  };

  /**
   * Returns the PnL cost (in quote currency) at the moment the worst loss price was recorded during this position's life.
   *
   * Returns null if no pending signal exists.
   *
   * @param symbol - Trading pair symbol
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to PnL cost in quote currency or null
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
  ): Promise<number | null> => {
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
    return await bt.strategyCoreService.getPositionMaxDrawdownPnlCost(backtest, symbol, context);
  };

  /**
   * Returns the distance in PnL percentage between the current price and the highest profit peak.
   *
   * Result is ≥ 0. Returns null if no pending signal exists.
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
  ): Promise<number | null> => {
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
    return await bt.strategyCoreService.getPositionHighestProfitDistancePnlPercentage(backtest, symbol, context);
  };

  /**
   * Returns the distance in PnL cost between the current price and the highest profit peak.
   *
   * Result is ≥ 0. Returns null if no pending signal exists.
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
  ): Promise<number | null> => {
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
    return await bt.strategyCoreService.getPositionHighestProfitDistancePnlCost(backtest, symbol, context);
  };

  /**
   * Returns the distance in PnL percentage between the current price and the worst drawdown trough.
   *
   * Result is ≥ 0. Returns null if no pending signal exists.
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
  ): Promise<number | null> => {
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
    return await bt.strategyCoreService.getPositionHighestMaxDrawdownPnlPercentage(backtest, symbol, context);
  };

  /**
   * Returns the distance in PnL cost between the current price and the worst drawdown trough.
   *
   * Result is ≥ 0. Returns null if no pending signal exists.
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
  ): Promise<number | null> => {
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
    return await bt.strategyCoreService.getPositionHighestMaxDrawdownPnlCost(backtest, symbol, context);
  };

  /**
   * Returns the peak-to-trough PnL percentage distance between the position's highest profit and deepest drawdown.
   *
   * Result is ≥ 0. Returns null if no pending signal exists.
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
  ): Promise<number | null> => {
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
    return await bt.strategyCoreService.getMaxDrawdownDistancePnlPercentage(backtest, symbol, context);
  };

  /**
   * Returns the peak-to-trough PnL cost distance between the position's highest profit and deepest drawdown.
   *
   * Result is ≥ 0. Returns null if no pending signal exists.
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
  ): Promise<number | null> => {
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
    return await bt.strategyCoreService.getMaxDrawdownDistancePnlCost(backtest, symbol, context);
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

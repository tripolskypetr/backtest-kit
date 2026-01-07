import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { PartialConnectionService } from "../connection/PartialConnectionService";
import { ISignalRow } from "../../../interfaces/Strategy.interface";
import StrategyValidationService from "../validation/StrategyValidationService";
import StrategySchemaService from "../schema/StrategySchemaService";
import RiskValidationService from "../validation/RiskValidationService";
import { memoize } from "functools-kit";
import { IPartial } from "../../../interfaces/Partial.interface";

/**
 * Type definition for partial methods.
 * Maps all keys of IPartial to any type.
 * Used for dynamic method routing in PartialGlobalService.
 */
type TPartial = {
  [key in keyof IPartial]: any;
};

/**
 * Global service for partial profit/loss tracking.
 *
 * Thin delegation layer that forwards operations to PartialConnectionService.
 * Provides centralized logging for all partial operations at the global level.
 *
 * Architecture:
 * - Injected into ClientStrategy constructor via IStrategyParams
 * - Delegates all operations to PartialConnectionService
 * - Logs operations at "partialGlobalService" level before delegation
 *
 * Purpose:
 * - Single injection point for ClientStrategy (dependency injection pattern)
 * - Centralized logging for monitoring partial operations
 * - Layer of abstraction between strategy and connection layer
 *
 * @example
 * ```typescript
 * // Service injected into ClientStrategy via DI
 * const strategy = new ClientStrategy({
 *   partial: partialGlobalService,
 *   ...
 * });
 *
 * // Called during signal monitoring
 * await strategy.params.partial.profit("BTCUSDT", signal, 55000, 10.0, false, new Date());
 * // Logs at global level → delegates to PartialConnectionService
 * ```
 */
export class PartialGlobalService implements TPartial {
  /**
   * Logger service injected from DI container.
   * Used for logging operations at global service level.
   */
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * Connection service injected from DI container.
   * Handles actual ClientPartial instance creation and management.
   */
  private readonly partialConnectionService = inject<PartialConnectionService>(
    TYPES.partialConnectionService
  );

  /**
   * Strategy validation service for validating strategy existence.
   */
  private readonly strategyValidationService = inject<StrategyValidationService>(
    TYPES.strategyValidationService
  );

  /**
   * Strategy schema service for retrieving strategy configuration.
   */
  private readonly strategySchemaService = inject<StrategySchemaService>(
    TYPES.strategySchemaService
  );

  /**
   * Risk validation service for validating risk existence.
   */
  private readonly riskValidationService = inject<RiskValidationService>(
    TYPES.riskValidationService
  );

  /**
   * Validates strategy and associated risk configuration.
   * Memoized to avoid redundant validations for the same strategy-exchange-frame combination.
   *
   * @param context - Context with strategyName, exchangeName and frameName
   * @param methodName - Name of the calling method for error tracking
   */
  private validate = memoize(
    ([context]) => `${context.strategyName}:${context.exchangeName}:${context.frameName}`,
    (context: { strategyName: string; exchangeName: string; frameName: string }, methodName: string) => {
      this.loggerService.log("partialGlobalService validate", {
        context,
        methodName,
      });
      this.strategyValidationService.validate(context.strategyName, methodName);
      const { riskName, riskList } = this.strategySchemaService.get(context.strategyName);
      riskName && this.riskValidationService.validate(riskName, methodName);
      riskList && riskList.forEach((riskName) => this.riskValidationService.validate(riskName, methodName));
    }
  );

  /**
   * Processes profit state and emits events for newly reached profit levels.
   *
   * Logs operation at global service level, then delegates to PartialConnectionService.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param data - Signal row data
   * @param currentPrice - Current market price
   * @param revenuePercent - Current profit percentage (positive value)
   * @param backtest - True if backtest mode, false if live mode
   * @param when - Event timestamp (current time for live, candle time for backtest)
   * @returns Promise that resolves when profit processing is complete
   */
  public profit = async (
    symbol: string,
    data: ISignalRow,
    currentPrice: number,
    revenuePercent: number,
    backtest: boolean,
    when: Date
  ) => {
    this.loggerService.log("partialGlobalService profit", {
      symbol,
      data,
      currentPrice,
      revenuePercent,
      backtest,
      when,
    });
    this.validate({
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName
    }, "partialGlobalService profit");
    return await this.partialConnectionService.profit(
      symbol,
      data,
      currentPrice,
      revenuePercent,
      backtest,
      when
    );
  };

  /**
   * Processes loss state and emits events for newly reached loss levels.
   *
   * Logs operation at global service level, then delegates to PartialConnectionService.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param data - Signal row data
   * @param currentPrice - Current market price
   * @param lossPercent - Current loss percentage (negative value)
   * @param backtest - True if backtest mode, false if live mode
   * @param when - Event timestamp (current time for live, candle time for backtest)
   * @returns Promise that resolves when loss processing is complete
   */
  public loss = async (
    symbol: string,
    data: ISignalRow,
    currentPrice: number,
    lossPercent: number,
    backtest: boolean,
    when: Date
  ) => {
    this.loggerService.log("partialGlobalService loss", {
      symbol,
      data,
      currentPrice,
      lossPercent,
      backtest,
      when,
    });
    this.validate({
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName
    }, "partialGlobalService loss");
    return await this.partialConnectionService.loss(
      symbol,
      data,
      currentPrice,
      lossPercent,
      backtest,
      when
    );
  };

  /**
   * Clears partial profit/loss state when signal closes.
   *
   * Logs operation at global service level, then delegates to PartialConnectionService.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param data - Signal row data
   * @param priceClose - Final closing price
   * @returns Promise that resolves when clear is complete
   */
  public clear = async (
    symbol: string,
    data: ISignalRow,
    priceClose: number,
    backtest: boolean,
  ) => {
    this.loggerService.log("partialGlobalService clear", {
      symbol,
      data,
      priceClose,
      backtest,
    });
    this.validate({
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName
    }, "partialGlobalService clear");
    return await this.partialConnectionService.clear(symbol, data, priceClose, backtest);
  };
}

export default PartialGlobalService;

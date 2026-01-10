import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { BreakevenConnectionService } from "../connection/BreakevenConnectionService";
import { IPublicSignalRow, ISignalRow, StrategyName } from "../../../interfaces/Strategy.interface";
import StrategyValidationService from "../validation/StrategyValidationService";
import StrategySchemaService from "../schema/StrategySchemaService";
import RiskValidationService from "../validation/RiskValidationService";
import ExchangeValidationService from "../validation/ExchangeValidationService";
import { memoize } from "functools-kit";
import { IBreakeven } from "../../../interfaces/Breakeven.interface";
import { FrameName } from "../../../interfaces/Frame.interface";
import { ExchangeName } from "../../../interfaces/Exchange.interface";

/**
 * Type definition for breakeven methods.
 * Maps all keys of IBreakeven to any type.
 * Used for dynamic method routing in BreakevenGlobalService.
 */
type TBreakeven = {
  [key in keyof IBreakeven]: any;
};

/**
 * Global service for breakeven tracking.
 *
 * Thin delegation layer that forwards operations to BreakevenConnectionService.
 * Provides centralized logging for all breakeven operations at the global level.
 *
 * Architecture:
 * - Injected into ClientStrategy constructor via IStrategyParams
 * - Delegates all operations to BreakevenConnectionService
 * - Logs operations at "breakevenGlobalService" level before delegation
 *
 * Purpose:
 * - Single injection point for ClientStrategy (dependency injection pattern)
 * - Centralized logging for monitoring breakeven operations
 * - Layer of abstraction between strategy and connection layer
 *
 * @example
 * ```typescript
 * // Service injected into ClientStrategy via DI
 * const strategy = new ClientStrategy({
 *   breakeven: breakevenGlobalService,
 *   ...
 * });
 *
 * // Called during signal monitoring
 * await strategy.params.breakeven.check("BTCUSDT", signal, 100.5, false, new Date());
 * // Logs at global level → delegates to BreakevenConnectionService
 * ```
 */
export class BreakevenGlobalService implements TBreakeven {
  /**
   * Logger service injected from DI container.
   * Used for logging operations at global service level.
   */
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * Connection service injected from DI container.
   * Handles actual ClientBreakeven instance creation and management.
   */
  private readonly breakevenConnectionService = inject<BreakevenConnectionService>(
    TYPES.breakevenConnectionService
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
   * Exchange validation service for validating exchange existence.
   */
  private readonly exchangeValidationService = inject<ExchangeValidationService>(
    TYPES.exchangeValidationService
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
    (context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }, methodName: string) => {
      this.loggerService.log("breakevenGlobalService validate", {
        context,
        methodName,
      });
      this.strategyValidationService.validate(context.strategyName, methodName);
      this.exchangeValidationService.validate(context.exchangeName, methodName);
      const { riskName, riskList } = this.strategySchemaService.get(context.strategyName);
      riskName && this.riskValidationService.validate(riskName, methodName);
      riskList && riskList.forEach((riskName) => this.riskValidationService.validate(riskName, methodName));
    }
  );

  /**
   * Checks if breakeven should be triggered and emits event if conditions met.
   *
   * Logs operation at global service level, then delegates to BreakevenConnectionService.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param data - Signal row data
   * @param currentPrice - Current market price
   * @param backtest - True if backtest mode, false if live mode
   * @param when - Event timestamp (current time for live, candle time for backtest)
   * @returns Promise that resolves when breakeven check is complete
   */
  public check = async (
    symbol: string,
    data: IPublicSignalRow,
    currentPrice: number,
    backtest: boolean,
    when: Date
  ) => {
    this.loggerService.log("breakevenGlobalService check", {
      symbol,
      data,
      currentPrice,
      backtest,
      when,
    });
    this.validate({
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName
    }, "breakevenGlobalService check");
    return await this.breakevenConnectionService.check(
      symbol,
      data,
      currentPrice,
      backtest,
      when
    );
  };

  /**
   * Clears breakeven state when signal closes.
   *
   * Logs operation at global service level, then delegates to BreakevenConnectionService.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param data - Signal row data
   * @param priceClose - Final closing price
   * @param backtest - True if backtest mode, false if live mode
   * @returns Promise that resolves when clear is complete
   */
  public clear = async (
    symbol: string,
    data: ISignalRow,
    priceClose: number,
    backtest: boolean,
  ) => {
    this.loggerService.log("breakevenGlobalService clear", {
      symbol,
      data,
      priceClose,
      backtest,
    });
    this.validate({
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName
    }, "breakevenGlobalService clear");
    return await this.breakevenConnectionService.clear(symbol, data, priceClose, backtest);
  };
}

export default BreakevenGlobalService;

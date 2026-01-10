import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import RiskConnectionService from "../connection/RiskConnectionService";
import { IRisk, IRiskCheckArgs, RiskName } from "../../../interfaces/Risk.interface";
import { memoize } from "functools-kit";
import RiskValidationService from "../validation/RiskValidationService";
import ExchangeValidationService from "../validation/ExchangeValidationService";
import FrameValidationService from "../validation/FrameValidationService";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";
import { StrategyName } from "../../../interfaces/Strategy.interface";

/**
 * Type definition for risk methods.
 * Maps all keys of IRisk to any type.
 * Used for dynamic method routing in RiskGlobalService.
 */
type TRisk = {
  [key in keyof IRisk]: any;
};

/**
 * Global service for risk operations.
 *
 * Wraps RiskConnectionService for risk limit validation.
 * Used internally by strategy execution and public API.
 */
export class RiskGlobalService implements TRisk {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly riskConnectionService = inject<RiskConnectionService>(
    TYPES.riskConnectionService
  );
  private readonly riskValidationService = inject<RiskValidationService>(
    TYPES.riskValidationService
  );
  private readonly exchangeValidationService = inject<ExchangeValidationService>(
    TYPES.exchangeValidationService
  );
  private readonly frameValidationService = inject<FrameValidationService>(
    TYPES.frameValidationService
  );

  /**
   * Validates risk configuration.
   * Memoized to avoid redundant validations for the same risk-exchange-frame combination.
   * Logs validation activity.
   * @param payload - Payload with riskName, exchangeName and frameName
   * @returns Promise that resolves when validation is complete
   */
  private validate = memoize(
    ([payload]) => `${payload.riskName}:${payload.exchangeName}:${payload.frameName}`,
    async (payload: { riskName: RiskName; exchangeName: ExchangeName; frameName: FrameName }) => {
      this.loggerService.log("riskGlobalService validate", {
        payload,
      });
      this.riskValidationService.validate(
        payload.riskName,
        "riskGlobalService validate"
      );
      this.exchangeValidationService.validate(
        payload.exchangeName,
        "riskGlobalService validate"
      );
      payload.frameName && this.frameValidationService.validate(payload.frameName, "riskGlobalService validate");
    }
  );

  /**
   * Checks if a signal should be allowed based on risk limits.
   *
   * @param params - Risk check arguments (portfolio state, position details)
   * @param payload - Execution payload with risk name, exchangeName, frameName and backtest mode
   * @returns Promise resolving to risk check result
   */
  public checkSignal = async (
    params: IRiskCheckArgs,
    payload: { riskName: RiskName; exchangeName: ExchangeName; frameName: FrameName; backtest: boolean }
  ) => {
    this.loggerService.log("riskGlobalService checkSignal", {
      symbol: params.symbol,
      payload,
    });
    await this.validate(payload);
    return await this.riskConnectionService.checkSignal(params, payload);
  };

  /**
   * Registers an opened signal with the risk management system.
   *
   * @param symbol - Trading pair symbol
   * @param payload - Payload information (strategyName, riskName, exchangeName, frameName, backtest)
   */
  public addSignal = async (
    symbol: string,
    payload: { strategyName: StrategyName; riskName: RiskName; exchangeName: ExchangeName; frameName: FrameName; backtest: boolean }
  ) => {
    this.loggerService.log("riskGlobalService addSignal", {
      symbol,
      payload,
    });
    await this.validate(payload);
    await this.riskConnectionService.addSignal(symbol, payload);
  };

  /**
   * Removes a closed signal from the risk management system.
   *
   * @param symbol - Trading pair symbol
   * @param payload - Payload information (strategyName, riskName, exchangeName, frameName, backtest)
   */
  public removeSignal = async (
    symbol: string,
    payload: { strategyName: StrategyName; riskName: RiskName; exchangeName: ExchangeName; frameName: FrameName; backtest: boolean }
  ) => {
    this.loggerService.log("riskGlobalService removeSignal", {
      symbol,
      payload,
    });
    await this.validate(payload);
    await this.riskConnectionService.removeSignal(symbol, payload);
  };

  /**
   * Clears risk data.
   * If payload is provided, clears data for that specific risk instance.
   * If no payload is provided, clears all risk data.
   * @param payload - Optional payload with riskName, exchangeName, frameName, backtest (clears all if not provided)
   */
  public clear = async (
    payload?: { riskName: RiskName; exchangeName: ExchangeName; frameName: FrameName; backtest: boolean }
  ): Promise<void> => {
    this.loggerService.log("riskGlobalService clear", {
      payload,
    });
    if (payload) {
      await this.validate(payload);
    }
    return await this.riskConnectionService.clear(payload);
  };
}

export default RiskGlobalService;

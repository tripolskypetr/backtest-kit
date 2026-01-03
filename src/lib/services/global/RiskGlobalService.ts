import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import RiskConnectionService from "../connection/RiskConnectionService";
import { IRiskCheckArgs, RiskName } from "../../../interfaces/Risk.interface";
import { memoize } from "functools-kit";
import RiskValidationService from "../validation/RiskValidationService";

/**
 * Global service for risk operations.
 *
 * Wraps RiskConnectionService for risk limit validation.
 * Used internally by strategy execution and public API.
 */
export class RiskGlobalService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly riskConnectionService = inject<RiskConnectionService>(
    TYPES.riskConnectionService
  );
  private readonly riskValidationService = inject<RiskValidationService>(
    TYPES.riskValidationService
  );

  /**
   * Validates risk configuration.
   * Memoized to avoid redundant validations for the same risk instance.
   * Logs validation activity.
   * @param riskName - Name of the risk instance to validate
   * @returns Promise that resolves when validation is complete
   */
  private validate = memoize(
    ([riskName]) => `${riskName}`,
    async (riskName: RiskName) => {
      this.loggerService.log("riskGlobalService validate", {
        riskName,
      });
      this.riskValidationService.validate(
        riskName,
        "riskGlobalService validate"
      );
    }
  );

  /**
   * Checks if a signal should be allowed based on risk limits.
   *
   * @param params - Risk check arguments (portfolio state, position details)
   * @param context - Execution context with risk name
   * @returns Promise resolving to risk check result
   */
  public checkSignal = async (
    params: IRiskCheckArgs,
    context: { riskName: RiskName; backtest: boolean }
  ) => {
    this.loggerService.log("riskGlobalService checkSignal", {
      symbol: params.symbol,
      context,
    });
    await this.validate(context.riskName);
    return await this.riskConnectionService.checkSignal(params, context);
  };

  /**
   * Registers an opened signal with the risk management system.
   *
   * @param symbol - Trading pair symbol
   * @param context - Context information (strategyName, riskName)
   */
  public addSignal = async (
    symbol: string,
    context: { strategyName: string; riskName: RiskName; backtest: boolean }
  ) => {
    this.loggerService.log("riskGlobalService addSignal", {
      symbol,
      context,
    });
    await this.validate(context.riskName);
    await this.riskConnectionService.addSignal(symbol, context);
  };

  /**
   * Removes a closed signal from the risk management system.
   *
   * @param symbol - Trading pair symbol
   * @param context - Context information (strategyName, riskName)
   */
  public removeSignal = async (
    symbol: string,
    context: { strategyName: string; riskName: RiskName; backtest: boolean }
  ) => {
    this.loggerService.log("riskGlobalService removeSignal", {
      symbol,
      context,
    });
    await this.validate(context.riskName);
    await this.riskConnectionService.removeSignal(symbol, context);
  };

  /**
   * Clears risk data.
   * If ctx is provided, clears data for that specific risk instance.
   * If no ctx is provided, clears all risk data.
   * @param backtest - Whether running in backtest mode
   * @param ctx - Optional context with riskName, exchangeName, frameName (clears all if not provided)
   */
  public clear = async (
    backtest: boolean,
    ctx?: { riskName: RiskName; exchangeName: string; frameName: string }
  ): Promise<void> => {
    this.loggerService.log("riskGlobalService clear", {
      ctx,
      backtest,
    });
    if (ctx) {
      await this.validate(ctx.riskName);
    }
    return await this.riskConnectionService.clear(backtest, ctx);
  };
}

export default RiskGlobalService;

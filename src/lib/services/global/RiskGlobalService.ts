import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import RiskConnectionService from "../connection/RiskConnectionService";
import { IRiskCheckArgs, RiskName } from "../../../interfaces/Risk.interface";

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

  /**
   * Checks if a signal should be allowed based on risk limits.
   *
   * @param params - Risk check arguments (portfolio state, position details)
   * @param context - Execution context with risk name
   * @returns Promise resolving to risk check result
   */
  public checkSignal = async (
    params: IRiskCheckArgs,
    context: { riskName: RiskName }
  ) => {
    this.loggerService.log("riskGlobalService checkSignal", {
      symbol: params.symbol,
      context,
    });
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
    context: { strategyName: string; riskName: RiskName }
  ) => {
    this.loggerService.log("riskGlobalService addSignal", {
      symbol,
      context,
    });
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
    context: { strategyName: string; riskName: RiskName }
  ) => {
    this.loggerService.log("riskGlobalService removeSignal", {
      symbol,
      context,
    });
    await this.riskConnectionService.removeSignal(symbol, context);
  };
}

export default RiskGlobalService;

import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import SizingConnectionService from "../connection/SizingConnectionService";
import { ISizingCalculateParams, SizingName } from "../../../interfaces/Sizing.interface";
import SizingValidationService from "../validation/SizingValidationService";

const METHOD_NAME_CALCULATE = "sizingGlobalService calculate";

/**
 * Global service for sizing operations.
 *
 * Wraps SizingConnectionService for position size calculation.
 * Used internally by strategy execution and public API.
 */
export class SizingGlobalService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly sizingConnectionService = inject<SizingConnectionService>(
    TYPES.sizingConnectionService
  );
  private readonly sizingValidationService = inject<SizingValidationService>(TYPES.sizingValidationService);

  /**
   * Calculates position size based on risk parameters.
   *
   * @param params - Calculation parameters (symbol, balance, prices, method-specific data)
   * @param context - Execution context with sizing name
   * @returns Promise resolving to calculated position size
   */
  public calculate = async (
    params: ISizingCalculateParams,
    context: { sizingName: SizingName }
  ) => {
    this.loggerService.log(METHOD_NAME_CALCULATE, {
      symbol: params.symbol,
      method: params.method,
      context,
    });
    this.sizingValidationService.validate(context.sizingName, METHOD_NAME_CALCULATE);
    return await this.sizingConnectionService.calculate(params, context);
  };
}

export default SizingGlobalService;

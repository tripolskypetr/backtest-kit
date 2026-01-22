import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../core/types";
import OptimizerConnectionService from "../connection/OptimizerConnectionService";
import OptimizerValidationService from "../validation/OptimizerValidationService";
import { IOptimizer, IOptimizerStrategy } from "../../../interface/Optimizer.interface";

const METHOD_NAME_GET_DATA = "optimizerGlobalService getData";
const METHOD_NAME_GET_CODE = "optimizerGlobalService getCode";
const METHOD_NAME_DUMP = "optimizerGlobalService dump";

/**
 * Type definition for optimizer methods.
 * Maps all keys of IOptimizer to any type.
 * Used for dynamic method routing in OptimizerGlobalService.
 */
type TOptimizer = {
  [key in keyof IOptimizer]: any;
};

/**
 * Global service for optimizer operations with validation.
 * Entry point for public API, performs validation before delegating to ConnectionService.
 *
 * Workflow:
 * 1. Log operation
 * 2. Validate optimizer exists
 * 3. Delegate to OptimizerConnectionService
 */
export class OptimizerGlobalService implements TOptimizer {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly optimizerConnectionService =
    inject<OptimizerConnectionService>(TYPES.optimizerConnectionService);
  private readonly optimizerValidationService =
    inject<OptimizerValidationService>(TYPES.optimizerValidationService);

  /**
   * Fetches data from all sources and generates strategy metadata.
   * Validates optimizer existence before execution.
   *
   * @param symbol - Trading pair symbol
   * @param optimizerName - Optimizer identifier
   * @returns Array of generated strategies with conversation context
   * @throws Error if optimizer not found
   */
  public getData = async (
    symbol: string,
    optimizerName: string
  ): Promise<IOptimizerStrategy[]> => {
    this.loggerService.log(METHOD_NAME_GET_DATA, {
      symbol,
      optimizerName,
    });
    this.optimizerValidationService.validate(
      optimizerName,
      METHOD_NAME_GET_DATA
    );
    return await this.optimizerConnectionService.getData(symbol, optimizerName);
  };

  /**
   * Generates complete executable strategy code.
   * Validates optimizer existence before execution.
   *
   * @param symbol - Trading pair symbol
   * @param optimizerName - Optimizer identifier
   * @returns Generated TypeScript/JavaScript code as string
   * @throws Error if optimizer not found
   */
  public getCode = async (
    symbol: string,
    optimizerName: string
  ): Promise<string> => {
    this.loggerService.log(METHOD_NAME_GET_CODE, {
      symbol,
      optimizerName,
    });
    this.optimizerValidationService.validate(
      optimizerName,
      METHOD_NAME_GET_CODE
    );
    return await this.optimizerConnectionService.getCode(symbol, optimizerName);
  };

  /**
   * Generates and saves strategy code to file.
   * Validates optimizer existence before execution.
   *
   * @param symbol - Trading pair symbol
   * @param optimizerName - Optimizer identifier
   * @param path - Output directory path (optional)
   * @throws Error if optimizer not found
   */
  public dump = async (
    symbol: string,
    optimizerName: string,
    path?: string
  ): Promise<void> => {
    this.loggerService.log(METHOD_NAME_DUMP, {
      symbol,
      optimizerName,
      path,
    });
    this.optimizerValidationService.validate(optimizerName, METHOD_NAME_DUMP);
    return await this.optimizerConnectionService.dump(
      symbol,
      optimizerName,
      path
    );
  };
}

export default OptimizerGlobalService;

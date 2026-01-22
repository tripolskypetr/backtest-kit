import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../core/types";
import { OptimizerName, IOptimizerSchema } from "../../../interface/Optimizer.interface";
import { memoize } from "functools-kit";

/**
 * Service for validating optimizer existence and managing optimizer registry.
 * Maintains a Map of registered optimizers for validation purposes.
 *
 * Uses memoization for efficient repeated validation checks.
 */
export class OptimizerValidationService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private _optimizerMap = new Map<OptimizerName, IOptimizerSchema>();

  /**
   * Adds optimizer to validation registry.
   * Prevents duplicate optimizer names.
   *
   * @param optimizerName - Unique optimizer identifier
   * @param optimizerSchema - Complete optimizer schema
   * @throws Error if optimizer with same name already exists
   */
  public addOptimizer = (optimizerName: OptimizerName, optimizerSchema: IOptimizerSchema): void => {
    this.loggerService.log("optimizerValidationService addOptimizer", {
      optimizerName,
      optimizerSchema,
    });
    if (this._optimizerMap.has(optimizerName)) {
      throw new Error(`optimizer ${optimizerName} already exist`);
    }
    this._optimizerMap.set(optimizerName, optimizerSchema);
  };

  /**
   * Validates that optimizer exists in registry.
   * Memoized for performance on repeated checks.
   *
   * @param optimizerName - Optimizer name to validate
   * @param source - Source method name for error messages
   * @throws Error if optimizer not found
   */
  public validate = memoize(
    ([optimizerName]) => optimizerName,
    (optimizerName: OptimizerName, source: string): void => {
      this.loggerService.log("optimizerValidationService validate", {
        optimizerName,
        source,
      });
      const optimizer = this._optimizerMap.get(optimizerName);
      if (!optimizer) {
        throw new Error(
          `optimizer ${optimizerName} not found source=${source}`
        );
      }
      return true as never;
    }
  ) as (optimizerName: OptimizerName, source: string) => void;

  /**
   * Lists all registered optimizer schemas.
   *
   * @returns Array of all optimizer schemas
   */
  public list = async (): Promise<IOptimizerSchema[]> => {
    this.loggerService.log("optimizerValidationService list");
    return Array.from(this._optimizerMap.values());
  };
}

export default OptimizerValidationService;

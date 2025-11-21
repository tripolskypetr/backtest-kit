import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import { StrategyName, IStrategySchema } from "../../../interfaces/Strategy.interface";
import { memoize } from "functools-kit";

/**
 * @class StrategyValidationService
 * Service for managing and validating strategy configurations
 */
export class StrategyValidationService {
  /**
   * @private
   * @readonly
   * Injected logger service instance
   */
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * @private
   * Map storing strategy schemas by strategy name
   */
  private _strategyMap = new Map<StrategyName, IStrategySchema>();

  /**
   * Adds a strategy schema to the validation service
   * @public
   * @throws {Error} If strategyName already exists
   */
  public addStrategy = (strategyName: StrategyName, strategySchema: IStrategySchema): void => {
    this.loggerService.log("strategyValidationService addStrategy", {
      strategyName,
      strategySchema,
    });
    if (this._strategyMap.has(strategyName)) {
      throw new Error(`strategy ${strategyName} already exist`);
    }
    this._strategyMap.set(strategyName, strategySchema);
  };

  /**
   * Validates the existence of a strategy
   * @public
   * @throws {Error} If strategyName is not found
   * Memoized function to cache validation results
   */
  public validate = memoize(
    ([strategyName]) => strategyName,
    (strategyName: StrategyName, source: string): void => {
      this.loggerService.log("strategyValidationService validate", {
        strategyName,
        source,
      });
      const strategy = this._strategyMap.get(strategyName);
      if (!strategy) {
        throw new Error(
          `strategy ${strategyName} not found source=${source}`
        );
      }
      return true as never;
    }
  ) as (strategyName: StrategyName, source: string) => void;
}

/**
 * @exports StrategyValidationService
 * Default export of StrategyValidationService class
 */
export default StrategyValidationService;

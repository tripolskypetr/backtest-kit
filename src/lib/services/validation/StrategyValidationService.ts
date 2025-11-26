import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import { StrategyName, IStrategySchema } from "../../../interfaces/Strategy.interface";
import { memoize } from "functools-kit";
import RiskValidationService from "./RiskValidationService";

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
   * @readonly
   * Injected risk validation service instance
   */
  private readonly riskValidationService = inject<RiskValidationService>(TYPES.riskValidationService);

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
   * Validates the existence of a strategy and its risk profile (if configured)
   * @public
   * @throws {Error} If strategyName is not found
   * @throws {Error} If riskName is configured but not found
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

      // Validate risk profile if configured
      if (strategy.riskName) {
        this.riskValidationService.validate(strategy.riskName, source);
      }

      return true as never;
    }
  ) as (strategyName: StrategyName, source: string) => void;

  /**
   * Returns a list of all registered strategy schemas
   * @public
   * @returns Array of strategy schemas with their configurations
   */
  public list = async (): Promise<IStrategySchema[]> => {
    this.loggerService.log("strategyValidationService list");
    return Array.from(this._strategyMap.values());
  };
}

/**
 * @exports StrategyValidationService
 * Default export of StrategyValidationService class
 */
export default StrategyValidationService;

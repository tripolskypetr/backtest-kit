import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import { RiskName, IRiskSchema } from "../../../interfaces/Risk.interface";
import { memoize } from "functools-kit";

/**
 * Service for managing and validating risk management configurations.
 *
 * Maintains a registry of all configured risk profiles and validates
 * their existence before operations. Uses memoization for performance.
 *
 * Key features:
 * - Registry management: addRisk() to register new risk profiles
 * - Validation: validate() ensures risk profile exists before use
 * - Memoization: validation results are cached by riskName:source for performance
 * - Listing: list() returns all registered risk profiles
 *
 * @throws {Error} If duplicate risk name is added
 * @throws {Error} If unknown risk profile is referenced
 *
 * @example
 * ```typescript
 * const riskValidation = new RiskValidationService();
 * riskValidation.addRisk("conservative", conservativeSchema);
 * riskValidation.validate("conservative", "strategy-1"); // OK
 * riskValidation.validate("unknown", "strategy-2"); // Throws error
 * ```
 */
export class RiskValidationService {
  /**
   * @private
   * @readonly
   * Injected logger service instance
   */
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * @private
   * Map storing risk schemas by risk name
   */
  private _riskMap = new Map<RiskName, IRiskSchema>();

  /**
   * Adds a risk schema to the validation service
   * @public
   * @throws {Error} If riskName already exists
   */
  public addRisk = (riskName: RiskName, riskSchema: IRiskSchema): void => {
    this.loggerService.log("riskValidationService addRisk", {
      riskName,
      riskSchema,
    });
    if (this._riskMap.has(riskName)) {
      throw new Error(`risk ${riskName} already exist`);
    }
    this._riskMap.set(riskName, riskSchema);
  };

  /**
   * Validates the existence of a risk profile
   * @public
   * @throws {Error} If riskName is not found
   * Memoized function to cache validation results
   */
  public validate = memoize(
    ([riskName, source]) => `${riskName}:${source}`,
    (riskName: RiskName, source: string): void => {
      this.loggerService.log("riskValidationService validate", {
        riskName,
        source,
      });
      const risk = this._riskMap.get(riskName);
      if (!risk) {
        throw new Error(
          `risk ${riskName} not found source=${source}`
        );
      }
      return true as never;
    }
  ) as (riskName: RiskName, source: string) => void;

  /**
   * Returns a list of all registered risk schemas
   * @public
   * @returns Array of risk schemas with their configurations
   */
  public list = async (): Promise<IRiskSchema[]> => {
    this.loggerService.log("riskValidationService list");
    return Array.from(this._riskMap.values());
  };
}

/**
 * @exports RiskValidationService
 * Default export of RiskValidationService class
 */
export default RiskValidationService;

import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import { RiskName, IRiskSchema } from "../../../interfaces/Risk.interface";
import { memoize } from "functools-kit";

/**
 * @class RiskValidationService
 * Service for managing and validating risk configurations
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

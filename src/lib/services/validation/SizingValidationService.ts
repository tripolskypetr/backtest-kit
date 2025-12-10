import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import { SizingName, ISizingSchema } from "../../../interfaces/Sizing.interface";
import { memoize } from "functools-kit";

/**
 * Service for managing and validating position sizing configurations.
 *
 * Maintains a registry of all configured sizing strategies and validates
 * their existence before operations. Uses memoization for performance.
 *
 * Key features:
 * - Registry management: addSizing() to register new sizing strategies
 * - Validation: validate() ensures sizing strategy exists before use
 * - Memoization: validation results are cached for performance
 * - Listing: list() returns all registered sizing strategies
 *
 * @throws {Error} If duplicate sizing name is added
 * @throws {Error} If unknown sizing strategy is referenced
 *
 * @example
 * ```typescript
 * const sizingValidation = new SizingValidationService();
 * sizingValidation.addSizing("fixed-1000", fixedSizingSchema);
 * sizingValidation.validate("fixed-1000", "strategy-1"); // OK
 * sizingValidation.validate("unknown", "strategy-2"); // Throws error
 * ```
 */
export class SizingValidationService {
  /**
   * @private
   * @readonly
   * Injected logger service instance
   */
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * @private
   * Map storing sizing schemas by sizing name
   */
  private _sizingMap = new Map<SizingName, ISizingSchema>();

  /**
   * Adds a sizing schema to the validation service
   * @public
   * @throws {Error} If sizingName already exists
   */
  public addSizing = (sizingName: SizingName, sizingSchema: ISizingSchema): void => {
    this.loggerService.log("sizingValidationService addSizing", {
      sizingName,
      sizingSchema,
    });
    if (this._sizingMap.has(sizingName)) {
      throw new Error(`sizing ${sizingName} already exist`);
    }
    this._sizingMap.set(sizingName, sizingSchema);
  };

  /**
   * Validates the existence of a sizing and optionally its method
   * @public
   * @throws {Error} If sizingName is not found
   * @throws {Error} If method is provided and doesn't match sizing schema method
   * Memoized function to cache validation results
   */
  public validate = memoize(
    ([sizingName, source, method]) => `${sizingName}:${source}:${method || ""}`,
    (sizingName: SizingName, source: string, method?: "fixed-percentage" | "kelly-criterion" | "atr-based"): void => {
      this.loggerService.log("sizingValidationService validate", {
        sizingName,
        source,
        method,
      });
      const sizing = this._sizingMap.get(sizingName);
      if (!sizing) {
        throw new Error(
          `sizing ${sizingName} not found source=${source}`
        );
      }
      if (method !== undefined && sizing.method !== method) {
        throw new Error(
          `Sizing method mismatch: sizing "${sizingName}" is configured as "${sizing.method}" but "${method}" was requested at source=${source}`
        );
      }
      return true as never;
    }
  ) as (sizingName: SizingName, source: string, method?: "fixed-percentage" | "kelly-criterion" | "atr-based") => void;

  /**
   * Returns a list of all registered sizing schemas
   * @public
   * @returns Array of sizing schemas with their configurations
   */
  public list = async (): Promise<ISizingSchema[]> => {
    this.loggerService.log("sizingValidationService list");
    return Array.from(this._sizingMap.values());
  };
}

/**
 * @exports SizingValidationService
 * Default export of SizingValidationService class
 */
export default SizingValidationService;

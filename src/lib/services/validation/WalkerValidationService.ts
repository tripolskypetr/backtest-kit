import { inject } from "../../core/di";
import { TLoggerService } from "../base/LoggerService";
import TYPES from "../../core/types";
import { WalkerName, IWalkerSchema } from "../../../interfaces/Walker.interface";
import WalkerSchemaService from "../schema/WalkerSchemaService";
import StrategySchemaService from "../schema/StrategySchemaService";
import StrategyValidationService from "./StrategyValidationService";
import RiskValidationService from "./RiskValidationService";
import ActionValidationService from "./ActionValidationService";
import { memoize } from "functools-kit";

/**
 * Service for managing and validating walker (parameter sweep) configurations.
 *
 * Maintains a registry of all configured walkers and validates
 * their existence before operations. Uses memoization for performance.
 *
 * Walkers define parameter ranges for optimization and hyperparameter tuning.
 *
 * Key features:
 * - Registry management: addWalker() to register new walker configurations
 * - Validation: validate() ensures walker exists before use
 * - Memoization: validation results are cached for performance
 * - Listing: list() returns all registered walkers
 *
 * @throws {Error} If duplicate walker name is added
 * @throws {Error} If unknown walker is referenced
 *
 * @example
 * ```typescript
 * const walkerValidation = new WalkerValidationService();
 * walkerValidation.addWalker("rsi-sweep", walkerSchema);
 * walkerValidation.validate("rsi-sweep", "optimizer"); // OK
 * walkerValidation.validate("unknown", "optimizer"); // Throws error
 * ```
 */
export class WalkerValidationService {
  /**
   * @private
   * @readonly
   * Injected logger service instance
   */
  private readonly loggerService = inject<TLoggerService>(TYPES.loggerService);

  /**
   * @private
   * @readonly
   * Injected walker schema service instance
   */
  private readonly walkerSchemaService = inject<WalkerSchemaService>(TYPES.walkerSchemaService);

  /**
   * @private
   * @readonly
   * Injected strategy validation service instance
   */
  private readonly strategyValidationService = inject<StrategyValidationService>(TYPES.strategyValidationService);

  /**
   * @private
   * @readonly
   * Injected strategy schema service instance
   */
  private readonly strategySchemaService = inject<StrategySchemaService>(TYPES.strategySchemaService);

  /**
   * @private
   * @readonly
   * Injected risk validation service instance
   */
  private readonly riskValidationService = inject<RiskValidationService>(TYPES.riskValidationService);

  /**
   * @private
   * @readonly
   * Injected action validation service instance
   */
  private readonly actionValidationService = inject<ActionValidationService>(TYPES.actionValidationService);

  /**
   * @private
   * Map storing walker schemas by walker name
   */
  private _walkerMap = new Map<WalkerName, IWalkerSchema>();

  /**
   * Adds a walker schema to the validation service
   * @public
   * @throws {Error} If walkerName already exists
   */
  public addWalker = (walkerName: WalkerName, walkerSchema: IWalkerSchema): void => {
    this.loggerService.log("walkerValidationService addWalker", {
      walkerName,
      walkerSchema,
    });
    if (this._walkerMap.has(walkerName)) {
      throw new Error(`walker ${walkerName} already exist`);
    }
    this._walkerMap.set(walkerName, walkerSchema);
  };

  /**
   * Validates the existence of a walker and its associated strategy configurations.
   * Each strategy referenced by the walker is validated via StrategyValidationService,
   * which in turn validates the strategy's risk profiles and actions.
   * @public
   * @throws {Error} If walkerName is not found
   * @throws {Error} If any referenced strategy (or its risk/actions) is invalid
   * Memoized function to cache validation results
   */
  public validate = memoize(
    ([walkerName]) => walkerName,
    (walkerName: WalkerName, source: string): void => {
      this.loggerService.log("walkerValidationService validate", {
        walkerName,
        source,
      });
      const walker = this._walkerMap.get(walkerName);
      if (!walker) {
        throw new Error(
          `walker ${walkerName} not found source=${source}`
        );
      }
      const walkerSchema = this.walkerSchemaService.get(walkerName);
      for (const strategyName of walkerSchema.strategies) {
        const { riskName, riskList, actions } = this.strategySchemaService.get(strategyName);
        this.strategyValidationService.validate(strategyName, source);
        riskName && this.riskValidationService.validate(riskName, source);
        riskList && riskList.forEach((riskName) => this.riskValidationService.validate(riskName, source));
        actions && actions.forEach((actionName) => this.actionValidationService.validate(actionName, source));
      }
      return true as never;
    }
  ) as (walkerName: WalkerName, source: string) => void;

  /**
   * Returns a list of all registered walker schemas
   * @public
   * @returns Array of walker schemas with their configurations
   */
  public list = async (): Promise<IWalkerSchema[]> => {
    this.loggerService.log("walkerValidationService list");
    return Array.from(this._walkerMap.values());
  };
}

/**
 * @exports WalkerValidationService
 * Default export of WalkerValidationService class
 */
export default WalkerValidationService;

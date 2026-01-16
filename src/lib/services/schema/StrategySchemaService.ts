import { StrategyName, IStrategySchema } from "../../../interfaces/Strategy.interface";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { ToolRegistry } from "functools-kit";

/**
 * Service for managing strategy schema registry.
 *
 * Uses ToolRegistry from functools-kit for type-safe schema storage.
 * Strategies are registered via addStrategy() and retrieved by name.
 */
export class StrategySchemaService {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private _registry = new ToolRegistry<Record<StrategyName, IStrategySchema>>("strategySchema");

  /**
   * Registers a new strategy schema.
   *
   * @param key - Unique strategy name
   * @param value - Strategy schema configuration
   * @throws Error if strategy name already exists
   */
  public register = (key: StrategyName, value: IStrategySchema) => {
    this.loggerService.log(`strategySchemaService register`, { key });
    this.validateShallow(value);
    this._registry = this._registry.register(key, value);
  };

  /**
   * Validates strategy schema structure for required properties.
   *
   * Performs shallow validation to ensure all required properties exist
   * and have correct types before registration in the registry.
   *
   * @param strategySchema - Strategy schema to validate
   * @throws Error if strategyName is missing or not a string
   * @throws Error if riskName is provided but not a string
   * @throws Error if riskList is provided but not an array
   * @throws Error if riskList contains duplicate values
   * @throws Error if riskList contains non-string values
   * @throws Error if actions is provided but not an array
   * @throws Error if actions contains duplicate values
   * @throws Error if actions contains non-string values
   * @throws Error if interval is missing or not a valid SignalInterval
   * @throws Error if getSignal is missing or not a function
   */
  private validateShallow = (strategySchema: IStrategySchema) => {
    this.loggerService.log(`strategySchemaService validateShallow`, {
      strategySchema,
    });

    if (typeof strategySchema.strategyName !== "string") {
      throw new Error(
        `strategy schema validation failed: missing strategyName`
      );
    }

    if (strategySchema.riskName && typeof strategySchema.riskName !== "string") {
      throw new Error(
        `strategy schema validation failed: invalid riskName`
      );
    }

    if (strategySchema.riskList && !Array.isArray(strategySchema.riskList)) {
      throw new Error(
        `strategy schema validation failed: invalid riskList for strategyName=${strategySchema.strategyName} system=${strategySchema.riskList}`
      );
    }

    if (
      strategySchema.riskList &&
      strategySchema.riskList.length !== new Set(strategySchema.riskList).size
    ) {
      throw new Error(
        `strategy schema validation failed: found duplicate riskList for strategyName=${strategySchema.strategyName} riskList=[${strategySchema.riskList}]`
      );
    }

    if (strategySchema.riskList?.some((value) => typeof value !== "string")) {
      throw new Error(
        `strategy schema validation failed: invalid riskList for strategyName=${strategySchema.strategyName} riskList=[${strategySchema.riskList}]`
      );
    }

    if (strategySchema.actions && !Array.isArray(strategySchema.actions)) {
      throw new Error(
        `strategy schema validation failed: invalid actions for strategyName=${strategySchema.strategyName} actions=${strategySchema.actions}`
      );
    }

    if (
      strategySchema.actions &&
      strategySchema.actions.length !== new Set(strategySchema.actions).size
    ) {
      throw new Error(
        `strategy schema validation failed: found duplicate actions for strategyName=${strategySchema.strategyName} actions=[${strategySchema.actions}]`
      );
    }

    if (strategySchema.actions?.some((value) => typeof value !== "string")) {
      throw new Error(
        `strategy schema validation failed: invalid actions for strategyName=${strategySchema.strategyName} actions=[${strategySchema.actions}]`
      );
    }

    if (typeof strategySchema.interval !== "string") {
      throw new Error(
        `strategy schema validation failed: missing interval for strategyName=${strategySchema.strategyName}`
      );
    }

    if (typeof strategySchema.getSignal !== "function") {
      throw new Error(
        `strategy schema validation failed: missing getSignal for strategyName=${strategySchema.strategyName}`
      );
    }
  };

  /**
   * Overrides an existing strategy schema with partial updates.
   *
   * @param key - Strategy name to override
   * @param value - Partial schema updates
   * @returns Updated strategy schema
   * @throws Error if strategy name doesn't exist
   */
  public override = (key: StrategyName, value: Partial<IStrategySchema>) => {
    this.loggerService.log(`strategySchemaService override`, { key });
    this._registry = this._registry.override(key, value);
    return this._registry.get(key);
  };

  /**
   * Retrieves a strategy schema by name.
   *
   * @param key - Strategy name
   * @returns Strategy schema configuration
   * @throws Error if strategy name doesn't exist
   */
  public get = (key: StrategyName): IStrategySchema => {
    this.loggerService.log(`strategySchemaService get`, { key });
    return this._registry.get(key);
  };
}

export default StrategySchemaService;

import { RiskName, IRiskSchema } from "../../../interfaces/Risk.interface";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { ToolRegistry } from "functools-kit";

/**
 * Service for managing risk schema registry.
 *
 * Uses ToolRegistry from functools-kit for type-safe schema storage.
 * Risk profiles are registered via addRisk() and retrieved by name.
 */
export class RiskSchemaService {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private _registry = new ToolRegistry<Record<RiskName, IRiskSchema>>("riskSchema");

  /**
   * Registers a new risk schema.
   *
   * @param key - Unique risk profile name
   * @param value - Risk schema configuration
   * @throws Error if risk name already exists
   */
  public register = (key: RiskName, value: IRiskSchema) => {
    this.loggerService.log(`riskSchemaService register`, { key });
    this.validateShallow(value);
    this._registry = this._registry.register(key, value);
  };

  /**
   * Validates risk schema structure for required properties.
   *
   * Performs shallow validation to ensure all required properties exist
   * and have correct types before registration in the registry.
   *
   * @param riskSchema - Risk schema to validate
   * @throws Error if riskName is missing or not a string
   */
  private validateShallow = (riskSchema: IRiskSchema) => {
    this.loggerService.log(`riskSchemaService validateShallow`, {
      riskSchema,
    });

    if (typeof riskSchema.riskName !== "string") {
      throw new Error(
        `risk schema validation failed: missing riskName`
      );
    }
  };

  /**
   * Overrides an existing risk schema with partial updates.
   *
   * @param key - Risk name to override
   * @param value - Partial schema updates
   * @returns Updated risk schema
   * @throws Error if risk name doesn't exist
   */
  public override = (key: RiskName, value: Partial<IRiskSchema>) => {
    this.loggerService.log(`riskSchemaService override`, { key });
    this._registry = this._registry.override(key, value);
    return this._registry.get(key);
  };

  /**
   * Retrieves a risk schema by name.
   *
   * @param key - Risk name
   * @returns Risk schema configuration
   * @throws Error if risk name doesn't exist
   */
  public get = (key: RiskName): IRiskSchema => {
    this.loggerService.log(`riskSchemaService get`, { key });
    return this._registry.get(key);
  };
}

export default RiskSchemaService;

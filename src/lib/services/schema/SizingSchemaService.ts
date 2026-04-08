import { ISizingSchema, SizingName } from "../../../interfaces/Sizing.interface";
import { inject } from "../../../lib/core/di";
import { TLoggerService } from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { ToolRegistry } from "functools-kit";

/**
 * Service for managing sizing schema registry.
 *
 * Uses ToolRegistry from functools-kit for type-safe schema storage.
 * Sizing schemas are registered via addSizing() and retrieved by name.
 */
export class SizingSchemaService {
  readonly loggerService = inject<TLoggerService>(TYPES.loggerService);

  private _registry = new ToolRegistry<Record<SizingName, ISizingSchema>>(
    "sizingSchema"
  );

  /**
   * Registers a new sizing schema.
   *
   * @param key - Unique sizing name
   * @param value - Sizing schema configuration
   * @throws Error if sizing name already exists
   */
  public register(key: SizingName, value: ISizingSchema) {
    this.loggerService.log(`sizingSchemaService register`, { key });
    this.validateShallow(value);
    this._registry = this._registry.register(key, value);
  }

  /**
   * Validates sizing schema structure for required properties.
   *
   * Performs shallow validation to ensure all required properties exist
   * and have correct types before registration in the registry.
   *
   * @param sizingSchema - Sizing schema to validate
   * @throws Error if sizingName is missing or not a string
   * @throws Error if method is missing or not a valid sizing method
   * @throws Error if required method-specific fields are missing
   */
  private validateShallow = (sizingSchema: ISizingSchema) => {
    this.loggerService.log(`sizingSchemaService validateShallow`, {
      sizingSchema,
    });

    const sizingName = sizingSchema.sizingName;
    const method = sizingSchema.method;

    if (typeof sizingName !== "string") {
      throw new Error(
        `sizing schema validation failed: missing sizingName`
      );
    }

    if (typeof method !== "string") {
      throw new Error(
        `sizing schema validation failed: missing method for sizingName=${sizingName}`
      );
    }

    // Method-specific validation
    if (sizingSchema.method === "fixed-percentage") {
      if (typeof sizingSchema.riskPercentage !== "number") {
        throw new Error(
          `sizing schema validation failed: missing riskPercentage for fixed-percentage sizing (sizingName=${sizingName})`
        );
      }
    }

    if (sizingSchema.method === "atr-based") {
      if (typeof sizingSchema.riskPercentage !== "number") {
        throw new Error(
          `sizing schema validation failed: missing riskPercentage for atr-based sizing (sizingName=${sizingName})`
        );
      }
    }
  };

  /**
   * Overrides an existing sizing schema with partial updates.
   *
   * @param key - Sizing name to override
   * @param value - Partial schema updates
   * @throws Error if sizing name doesn't exist
   */
  public override(key: SizingName, value: Partial<ISizingSchema>) {
    this.loggerService.log(`sizingSchemaService override`, { key });
    this._registry = this._registry.override(key, value);
    return this._registry.get(key);
  }

  /**
   * Retrieves a sizing schema by name.
   *
   * @param key - Sizing name
   * @returns Sizing schema configuration
   * @throws Error if sizing name doesn't exist
   */
  public get(key: SizingName): ISizingSchema {
    this.loggerService.log(`sizingSchemaService get`, { key });
    return this._registry.get(key);
  }
}

export default SizingSchemaService;

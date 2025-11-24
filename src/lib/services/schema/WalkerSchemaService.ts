import { WalkerName, IWalkerSchema } from "../../../interfaces/Walker.interface";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { ToolRegistry } from "functools-kit";

/**
 * Service for managing walker schema registry.
 *
 * Uses ToolRegistry from functools-kit for type-safe schema storage.
 * Walkers are registered via addWalker() and retrieved by name.
 */
export class WalkerSchemaService {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private _registry = new ToolRegistry<Record<WalkerName, IWalkerSchema>>("walkerSchema");

  /**
   * Registers a new walker schema.
   *
   * @param key - Unique walker name
   * @param value - Walker schema configuration
   * @throws Error if walker name already exists
   */
  public register = (key: WalkerName, value: IWalkerSchema) => {
    this.loggerService.log(`walkerSchemaService register`, { key });
    this.validateShallow(value);
    this._registry = this._registry.register(key, value);
  };

  /**
   * Validates walker schema structure for required properties.
   *
   * Performs shallow validation to ensure all required properties exist
   * and have correct types before registration in the registry.
   *
   * @param walkerSchema - Walker schema to validate
   * @throws Error if walkerName is missing or not a string
   * @throws Error if exchangeName is missing or not a string
   * @throws Error if frameName is missing or not a string
   * @throws Error if strategies is missing or not an array
   * @throws Error if strategies array is empty
   */
  private validateShallow = (walkerSchema: IWalkerSchema) => {
    this.loggerService.log(`walkerSchemaService validateShallow`, {
      walkerSchema,
    });

    if (typeof walkerSchema.walkerName !== "string") {
      throw new Error(
        `walker schema validation failed: missing walkerName`
      );
    }

    if (typeof walkerSchema.exchangeName !== "string") {
      throw new Error(
        `walker schema validation failed: missing exchangeName for walkerName=${walkerSchema.walkerName}`
      );
    }

    if (typeof walkerSchema.frameName !== "string") {
      throw new Error(
        `walker schema validation failed: missing frameName for walkerName=${walkerSchema.walkerName}`
      );
    }

    if (!Array.isArray(walkerSchema.strategies)) {
      throw new Error(
        `walker schema validation failed: strategies must be an array for walkerName=${walkerSchema.walkerName}`
      );
    }

    if (walkerSchema.strategies.length === 0) {
      throw new Error(
        `walker schema validation failed: strategies array cannot be empty for walkerName=${walkerSchema.walkerName}`
      );
    }
  };

  /**
   * Overrides an existing walker schema with partial updates.
   *
   * @param key - Walker name to override
   * @param value - Partial schema updates
   * @returns Updated walker schema
   * @throws Error if walker name doesn't exist
   */
  public override = (key: WalkerName, value: Partial<IWalkerSchema>) => {
    this.loggerService.log(`walkerSchemaService override`, { key });
    this._registry = this._registry.override(key, value);
    return this._registry.get(key);
  };

  /**
   * Retrieves a walker schema by name.
   *
   * @param key - Walker name
   * @returns Walker schema configuration
   * @throws Error if walker name doesn't exist
   */
  public get = (key: WalkerName): IWalkerSchema => {
    this.loggerService.log(`walkerSchemaService get`, { key });
    return this._registry.get(key);
  };
}

export default WalkerSchemaService;

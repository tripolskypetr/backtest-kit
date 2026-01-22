import { OptimizerName, IOptimizerSchema } from "../../../interface/Optimizer.interface";
import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../core/types";
import { ToolRegistry } from "functools-kit";

/**
 * Service for managing optimizer schema registration and retrieval.
 * Provides validation and registry management for optimizer configurations.
 *
 * Uses ToolRegistry for immutable schema storage.
 */
export class OptimizerSchemaService {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private _registry = new ToolRegistry<Record<OptimizerName, IOptimizerSchema>>(
    "optimizerSchema"
  );

  /**
   * Registers a new optimizer schema.
   * Validates required fields before registration.
   *
   * @param key - Unique optimizer name
   * @param value - Optimizer schema configuration
   * @throws Error if schema validation fails
   */
  public register = (key: OptimizerName, value: IOptimizerSchema) => {
    this.loggerService.log(`optimizerSchemaService register`, { key });
    this.validateShallow(value);
    this._registry = this._registry.register(key, value);
  };

  /**
   * Validates optimizer schema structure.
   * Checks required fields: optimizerName, rangeTrain, source, getPrompt.
   *
   * @param optimizerSchema - Schema to validate
   * @throws Error if validation fails
   */
  private validateShallow = (optimizerSchema: IOptimizerSchema) => {
    this.loggerService.log(`optimizerTemplateService validateShallow`, {
      optimizerSchema,
    });

    if (typeof optimizerSchema.optimizerName !== "string") {
      throw new Error(`optimizer template validation failed: missing optimizerName`);
    }

    if (!Array.isArray(optimizerSchema.rangeTrain) || optimizerSchema.rangeTrain.length === 0) {
      throw new Error(
        `optimizer template validation failed: rangeTrain must be a non-empty array for optimizerName=${optimizerSchema.optimizerName}`
      );
    }

    if (!Array.isArray(optimizerSchema.source) || optimizerSchema.source.length === 0) {
      throw new Error(
        `optimizer template validation failed: source must be a non-empty array for optimizerName=${optimizerSchema.optimizerName}`
      );
    }

    if (typeof optimizerSchema.getPrompt !== "function") {
      throw new Error(
        `optimizer template validation failed: getPrompt must be a function for optimizerName=${optimizerSchema.optimizerName}`
      );
    }
  };

  /**
   * Partially overrides an existing optimizer schema.
   * Merges provided values with existing schema.
   *
   * @param key - Optimizer name to override
   * @param value - Partial schema values to merge
   * @returns Updated complete schema
   * @throws Error if optimizer not found
   */
  public override = (key: OptimizerName, value: Partial<IOptimizerSchema>) => {
    this.loggerService.log(`optimizerSchemaService override`, { key });
    this._registry = this._registry.override(key, value);
    return this._registry.get(key);
  };

  /**
   * Retrieves optimizer schema by name.
   *
   * @param key - Optimizer name
   * @returns Complete optimizer schema
   * @throws Error if optimizer not found
   */
  public get = (key: OptimizerName): IOptimizerSchema => {
    this.loggerService.log(`optimizerSchemaService get`, { key });
    return this._registry.get(key);
  };
}

export default OptimizerSchemaService;

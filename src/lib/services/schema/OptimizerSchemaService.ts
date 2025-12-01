import { OptimizerName, IOptimizerSchema } from "../../../interfaces/Optimizer.interface";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { isObject, ToolRegistry } from "functools-kit";

export class OptimizerSchemaService {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private _registry = new ToolRegistry<Record<OptimizerName, IOptimizerSchema>>(
    "optimizerSchema"
  );

  public register = (key: OptimizerName, value: IOptimizerSchema) => {
    this.loggerService.log(`optimizerSchemaService register`, { key });
    this.validateShallow(value);
    this._registry = this._registry.register(key, value);
  };

  private validateShallow = (optimizerSchema: IOptimizerSchema) => {
    this.loggerService.log(`optimizerTemplateService validateShallow`, {
      optimizerSchema,
    });

    if (typeof optimizerSchema.optimizerName !== "string") {
      throw new Error(`optimizer template validation failed: missing optimizerName`);
    }

    if (!Array.isArray(optimizerSchema.range) || optimizerSchema.range.length === 0) {
      throw new Error(
        `optimizer template validation failed: range must be a non-empty array for optimizerName=${optimizerSchema.optimizerName}`
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

  public override = (key: OptimizerName, value: Partial<IOptimizerSchema>) => {
    this.loggerService.log(`optimizerSchemaService override`, { key });
    this._registry = this._registry.override(key, value);
    return this._registry.get(key);
  };

  public get = (key: OptimizerName): IOptimizerSchema => {
    this.loggerService.log(`optimizerSchemaService get`, { key });
    return this._registry.get(key);
  };
}

export default OptimizerSchemaService;
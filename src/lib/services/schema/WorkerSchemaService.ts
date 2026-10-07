import { inject } from "../../../lib/core/di";
import { TLoggerService } from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { ToolRegistry } from "functools-kit";
import { IWorkerSchema, WorkerName } from "../../../interfaces/Worker.interface";

/**
 * Registry of worker schemas.
 *
 * Stores IWorkerSchema records by worker name with shallow validation on
 * registration. A worker binds a run mode (backtest, paper or live) to
 * optional strategy, exchange and frame references resolved at run time;
 * the symbol list is NOT part of the schema — Worker.run receives it and
 * forks one child process per symbol.
 */
export class WorkerSchemaService {
  readonly loggerService = inject<TLoggerService>(TYPES.loggerService);

  private _registry = new ToolRegistry<Record<WorkerName, IWorkerSchema>>(
    "workerRegistry"
  );

  /**
   * Registers a worker schema under its name after shallow
   * validation. Registering the same key twice replaces the record.
   *
   * @param key - Worker name to register under
   * @param value - Schema to store
   */
  public register(key: WorkerName, value: IWorkerSchema) {
    this.loggerService.log(`workerSchemaService register`, { key });
    this.validateShallow(value);
    this._registry = this._registry.register(key, value);
  }

  /**
   * Shallow structural validation of a schema: required string
   * fields and the run-mode discriminator only, no deep checks —
   * strategy, exchange and frame references are validated by
   * WorkerValidationService at use time. strategyName and
   * exchangeName are optional but must be strings when present.
   *
   * @param workerSchema - Schema to check
   * @throws Error when workerName is missing, an optional reference is
   *   not a string, or no run mode (backtest, paper, live) is set
   */
  private validateShallow = (workerSchema: IWorkerSchema) => {
    this.loggerService.log(`workerSchemaService validateShallow`, {
      workerSchema,
    });

    if (typeof workerSchema.workerName !== "string") {
      throw new Error(
        `worker schema validation failed: missing workerName`
      );
    }

    if (workerSchema.strategyName && typeof workerSchema.strategyName !== "string") {
      throw new Error(
        `worker schema validation failed: invalid strategyName for workerName=${workerSchema.workerName}`
      );
    }

    if (workerSchema.exchangeName && typeof workerSchema.exchangeName !== "string") {
      throw new Error(
        `worker schema validation failed: invalid exchangeName for workerName=${workerSchema.workerName}`
      );
    }

    if (
      !("backtest" in workerSchema && workerSchema.backtest) &&
      !("paper" in workerSchema && workerSchema.paper) &&
      !("live" in workerSchema && workerSchema.live)
    ) {
      throw new Error(
        `worker schema validation failed: missing run mode (backtest, paper or live) for workerName=${workerSchema.workerName}`
      );
    }
  };

  /**
   * Partially overrides a registered schema and returns the merged
   * record. Used by overrideWorkerSchema-style public APIs.
   *
   * @param key - Worker name to override
   * @param value - Partial schema patch
   * @returns The merged schema after override
   */
  public override(key: WorkerName, value: Partial<IWorkerSchema>) {
    this.loggerService.log(`workerSchemaService override`, { key });
    this._registry = this._registry.override(key, value);
    return this._registry.get(key);
  }

  /**
   * Returns the registered schema by worker name.
   *
   * @param key - Worker name to look up
   * @returns The stored schema
   * @throws Error when no schema is registered under the name
   */
  public get(key: WorkerName): IWorkerSchema {
    this.loggerService.log(`workerSchemaService get`, { key });
    return this._registry.get(key);
  }
}

export default WorkerSchemaService;

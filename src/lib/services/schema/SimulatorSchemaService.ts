import { inject } from "../../../lib/core/di";
import { TLoggerService } from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { ToolRegistry } from "functools-kit";
import { ISimulatorSchema, SimulatorName } from "../../../interfaces/Simulator.interface";

/**
 * Registry of simulator schemas.
 *
 * Stores ISimulatorSchema records by simulator name with shallow
 * validation on registration. The connection service reads schemas
 * from here when building ClientSimulator instances.
 */
export class SimulatorSchemaService {
  readonly loggerService = inject<TLoggerService>(TYPES.loggerService);

  private _registry = new ToolRegistry<Record<SimulatorName, ISimulatorSchema>>(
    "simulatorRegistry"
  );

  /**
   * Registers a simulator schema under its name after shallow
   * validation. Registering the same key twice replaces the record.
   *
   * @param key - Simulator name to register under
   * @param value - Schema to store
   */
  public register(key: SimulatorName, value: ISimulatorSchema) {
    this.loggerService.log(`simulatorSchemaService register`, { key });
    this.validateShallow(value);
    this._registry = this._registry.register(key, value);
  }

  /**
   * Shallow structural validation of a schema: required string
   * fields only, no deep checks — grid axes and callbacks are
   * validated by their consumers.
   *
   * @param simulatorSchema - Schema to check
   * @throws Error when simulatorName or exchangeName is missing
   */
  private validateShallow = (simulatorSchema: ISimulatorSchema) => {
    this.loggerService.log(`simulatorSchemaService validateShallow`, {
      simulatorSchema,
    });

    if (typeof simulatorSchema.simulatorName !== "string") {
      throw new Error(
        `simulator schema validation failed: missing simulatorName`
      );
    }

    if (typeof simulatorSchema.exchangeName !== "string") {
      throw new Error(
        `simulator schema validation failed: missing exchangeName`
      );
    }
  };

  /**
   * Partially overrides a registered schema and returns the merged
   * record. Used by overrideSimulatorSchema-style public APIs.
   *
   * @param key - Simulator name to override
   * @param value - Partial schema patch
   * @returns The merged schema after override
   */
  public override(key: SimulatorName, value: Partial<ISimulatorSchema>) {
    this.loggerService.log(`simulatorSchemaService override`, { key });
    this._registry = this._registry.override(key, value);
    return this._registry.get(key);
  }

  /**
   * Returns the registered schema by simulator name.
   *
   * @param key - Simulator name to look up
   * @returns The stored schema
   * @throws Error when no schema is registered under the name
   */
  public get(key: SimulatorName): ISimulatorSchema {
    this.loggerService.log(`simulatorSchemaService get`, { key });
    return this._registry.get(key);
  }
}

export default SimulatorSchemaService;

import { inject } from "../../../lib/core/di";
import { TLoggerService } from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { ToolRegistry } from "functools-kit";
import { ILauncherSchema, LauncherName } from "../../../interfaces/Launcher.interface";

/**
 * Registry of launcher schemas.
 *
 * Stores ILauncherSchema records by launcher name with shallow validation on
 * registration. A launcher binds a run mode (backtest, paper or live) to
 * optional strategy, exchange and frame references resolved at launch time.
 */
export class LauncherSchemaService {
  readonly loggerService = inject<TLoggerService>(TYPES.loggerService);

  private _registry = new ToolRegistry<Record<LauncherName, ILauncherSchema>>(
    "launcherRegistry"
  );

  /**
   * Registers a launcher schema under its name after shallow
   * validation. Registering the same key twice replaces the record.
   *
   * @param key - Launcher name to register under
   * @param value - Schema to store
   */
  public register(key: LauncherName, value: ILauncherSchema) {
    this.loggerService.log(`launcherSchemaService register`, { key });
    this.validateShallow(value);
    this._registry = this._registry.register(key, value);
  }

  /**
   * Shallow structural validation of a schema: required string
   * fields and the run-mode discriminator only, no deep checks —
   * strategy, exchange and frame references are validated by
   * LauncherValidationService at use time. strategyName and
   * exchangeName are optional but must be strings when present.
   *
   * @param launcherSchema - Schema to check
   * @throws Error when launcherName is missing, an optional reference is
   *   not a string, or no run mode (backtest, paper, live) is set
   */
  private validateShallow = (launcherSchema: ILauncherSchema) => {
    this.loggerService.log(`launcherSchemaService validateShallow`, {
      launcherSchema,
    });

    if (typeof launcherSchema.launcherName !== "string") {
      throw new Error(
        `launcher schema validation failed: missing launcherName`
      );
    }

    if (launcherSchema.strategyName && typeof launcherSchema.strategyName !== "string") {
      throw new Error(
        `launcher schema validation failed: invalid strategyName for launcherName=${launcherSchema.launcherName}`
      );
    }

    if (launcherSchema.exchangeName && typeof launcherSchema.exchangeName !== "string") {
      throw new Error(
        `launcher schema validation failed: invalid exchangeName for launcherName=${launcherSchema.launcherName}`
      );
    }

    if (!Array.isArray(launcherSchema.symbolList)) {
      throw new Error(
        `launcher schema validation failed: missing symbolList for launcherName=${launcherSchema.launcherName}`
      );
    }

    if (launcherSchema.symbolList.length !== new Set(launcherSchema.symbolList).size) {
      throw new Error(
        `launcher schema validation failed: found duplicate symbolList for launcherName=${launcherSchema.launcherName} symbolList=[${launcherSchema.symbolList}]`
      );
    }

    if (launcherSchema.symbolList.some((value) => typeof value !== "string")) {
      throw new Error(
        `launcher schema validation failed: invalid symbolList for launcherName=${launcherSchema.launcherName} symbolList=[${launcherSchema.symbolList}]`
      );
    }

    if (
      !("backtest" in launcherSchema && launcherSchema.backtest) &&
      !("paper" in launcherSchema && launcherSchema.paper) &&
      !("live" in launcherSchema && launcherSchema.live)
    ) {
      throw new Error(
        `launcher schema validation failed: missing run mode (backtest, paper or live) for launcherName=${launcherSchema.launcherName}`
      );
    }
  };

  /**
   * Partially overrides a registered schema and returns the merged
   * record. Used by overrideLauncherSchema-style public APIs.
   *
   * @param key - Launcher name to override
   * @param value - Partial schema patch
   * @returns The merged schema after override
   */
  public override(key: LauncherName, value: Partial<ILauncherSchema>) {
    this.loggerService.log(`launcherSchemaService override`, { key });
    this._registry = this._registry.override(key, value);
    return this._registry.get(key);
  }

  /**
   * Returns the registered schema by launcher name.
   *
   * @param key - Launcher name to look up
   * @returns The stored schema
   * @throws Error when no schema is registered under the name
   */
  public get(key: LauncherName): ILauncherSchema {
    this.loggerService.log(`launcherSchemaService get`, { key });
    return this._registry.get(key);
  }
}

export default LauncherSchemaService;

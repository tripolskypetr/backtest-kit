import { StrategyName, IStrategySchema } from "../../../interfaces/Strategy.interface";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { ToolRegistry } from "functools-kit";

export class StrategySchemaService {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private _registry = new ToolRegistry<Record<StrategyName, IStrategySchema>>("strategySchema");

  public register = (key: StrategyName, value: IStrategySchema) => {
    this.loggerService.info(`strategySchemaService register`, { key });
    this._registry = this._registry.register(key, value);
  };

  public override = (key: StrategyName, value: Partial<IStrategySchema>) => {
    this.loggerService.info(`strategySchemaService override`, { key });
    this._registry = this._registry.override(key, value);
    return this._registry.get(key);
  };

  public get = (key: StrategyName): IStrategySchema => {
    this.loggerService.info(`strategySchemaService get`, { key });
    return this._registry.get(key);
  };
}

export default StrategySchemaService;

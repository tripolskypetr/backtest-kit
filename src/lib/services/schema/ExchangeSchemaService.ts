import { ExchangeName, IExchangeSchema } from "../../../interfaces/Exchange.interface";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { ToolRegistry } from "functools-kit";

export class ExchangeSchemaService {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private _registry = new ToolRegistry<Record<ExchangeName, IExchangeSchema>>("exchangeSchema");

  public register = (key: ExchangeName, value: IExchangeSchema) => {
    this.loggerService.info(`exchangeSchemaService register`, { key });
    this._registry = this._registry.register(key, value);
  };

  public override = (key: ExchangeName, value: Partial<IExchangeSchema>) => {
    this.loggerService.info(`exchangeSchemaService override`, { key });
    this._registry = this._registry.override(key, value);
    return this._registry.get(key);
  };

  public get = (key: ExchangeName): IExchangeSchema => {
    this.loggerService.info(`exchangeSchemaService get`, { key });
    return this._registry.get(key);
  };
}

export default ExchangeSchemaService;

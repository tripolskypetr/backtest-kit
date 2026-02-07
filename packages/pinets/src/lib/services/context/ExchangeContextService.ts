import { scoped } from "di-scoped";

export type ExchangeName = string;

export interface IExchangeContext {
  exchangeName: ExchangeName;
}

export const ExchangeContextService = scoped(
  class {
    constructor(readonly context: IExchangeContext) {}
  }
);

export type TExchangeContextService = InstanceType<typeof ExchangeContextService>;

export default ExchangeContextService;

import { scoped } from "di-scoped";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { StrategyName } from "../../../interfaces/Strategy.interface";

export interface IExecutionContext {
  exchangeName: ExchangeName;
  strategyName: StrategyName;
}

export const MethodContextService = scoped(
  class {
    constructor(readonly context: IExecutionContext) {}
  }
);

export type TMethodContextService = InstanceType<
  typeof MethodContextService
>;

export default MethodContextService;

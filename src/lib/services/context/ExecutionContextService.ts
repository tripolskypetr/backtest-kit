import { scoped } from "di-scoped";

export interface IExecutionContext {
  when: Date;
  backtest: boolean;
}

export const ExecutionContextService = scoped(
  class {
    constructor(readonly context: IExecutionContext) {}
  }
);

export type TExecutionContextService = InstanceType<
  typeof ExecutionContextService
>;

export default ExecutionContextService;

import { scoped } from "di-scoped";
import { InferenceName } from "../../../enum/InferenceName";

export interface IContext {
    inference: InferenceName;
    model: string;
}

export const ContextService = scoped(
  class {
    constructor(readonly context: IContext) {}
  }
);

export type TContextService = InstanceType<typeof ContextService>;

export default ContextService;

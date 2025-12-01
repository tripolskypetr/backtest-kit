import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import { OptimizerName, IOptimizerSchema } from "../../../interfaces/Optimizer.interface";
import { memoize } from "functools-kit";

export class OptimizerValidationService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private _optimizerMap = new Map<OptimizerName, IOptimizerSchema>();

  public addOptimizer = (optimizerName: OptimizerName, optimizerSchema: IOptimizerSchema): void => {
    this.loggerService.log("optimizerValidationService addOptimizer", {
      optimizerName,
      optimizerSchema,
    });
    if (this._optimizerMap.has(optimizerName)) {
      throw new Error(`optimizer ${optimizerName} already exist`);
    }
    this._optimizerMap.set(optimizerName, optimizerSchema);
  };

  public validate = memoize(
    ([optimizerName]) => optimizerName,
    (optimizerName: OptimizerName, source: string): void => {
      this.loggerService.log("optimizerValidationService validate", {
        optimizerName,
        source,
      });
      const optimizer = this._optimizerMap.get(optimizerName);
      if (!optimizer) {
        throw new Error(
          `optimizer ${optimizerName} not found source=${source}`
        );
      }
      return true as never;
    }
  ) as (optimizerName: OptimizerName, source: string) => void;

  public list = async (): Promise<IOptimizerSchema[]> => {
    this.loggerService.log("optimizerValidationService list");
    return Array.from(this._optimizerMap.values());
  };
}

export default OptimizerValidationService;
import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import OptimizerConnectionService from "../connection/OptimizerConnectionService";
import OptimizerValidationService from "../validation/OptimizerValidationService";
import { IOptimizerStrategy } from "src/interfaces/Optimizer.interface";

const METHOD_NAME_GET_DATA = "optimizerGlobalService getData";
const METHOD_NAME_GET_CODE = "optimizerGlobalService getCode";
const METHOD_NAME_DUMP = "optimizerGlobalService dump";

export class OptimizerGlobalService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly optimizerConnectionService =
    inject<OptimizerConnectionService>(TYPES.optimizerConnectionService);
  private readonly optimizerValidationService =
    inject<OptimizerValidationService>(TYPES.optimizerValidationService);

  public getData = async (
    symbol: string,
    optimizerName: string
  ): Promise<IOptimizerStrategy[]> => {
    this.loggerService.log(METHOD_NAME_GET_DATA, {
      symbol,
      optimizerName,
    });
    this.optimizerValidationService.validate(
      optimizerName,
      METHOD_NAME_GET_DATA
    );
    return await this.optimizerConnectionService.getData(symbol, optimizerName);
  };

  public getCode = async (
    symbol: string,
    optimizerName: string
  ): Promise<string> => {
    this.loggerService.log(METHOD_NAME_GET_CODE, {
      symbol,
      optimizerName,
    });
    this.optimizerValidationService.validate(
      optimizerName,
      METHOD_NAME_GET_CODE
    );
    return await this.optimizerConnectionService.getCode(symbol, optimizerName);
  };

  public dump = async (
    symbol: string,
    optimizerName: string,
    path?: string
  ): Promise<void> => {
    this.loggerService.log(METHOD_NAME_DUMP, {
      symbol,
      optimizerName,
      path,
    });
    this.optimizerValidationService.validate(optimizerName, METHOD_NAME_DUMP);
    return await this.optimizerConnectionService.dump(
      symbol,
      optimizerName,
      path
    );
  };
}

export default OptimizerGlobalService;

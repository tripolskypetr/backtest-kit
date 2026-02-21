import { singleshot } from "functools-kit";
import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import { getArgs } from "../../../helpers/getArgs";

export class SymbolSchemaService {
  public readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public init = singleshot(async () => {
    this.loggerService.log("symbolSchemaService init");
    if (!getArgs().values.symbol) {
      console.warn(
        "Warning: The default symbol is set to BTCUSDT. Please make sure to update it according to your needs using --symbol cli param.",
      );
    }
  });
}

export default SymbolSchemaService;

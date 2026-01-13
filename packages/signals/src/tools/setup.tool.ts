import { ILogger } from "../interfaces/Logger.interface";
import lib from "../lib";

export const setLogger = (logger: ILogger) => {
  lib.loggerService.setLogger(logger);
}

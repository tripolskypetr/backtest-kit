import { ILogger } from "../interface/Logger.interface";
import ioc from "../lib";

export const setLogger = (logger: ILogger) => {
  ioc.loggerService.setLogger(logger);
};

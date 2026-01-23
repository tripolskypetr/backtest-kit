import { ILogger } from "../interface/Logger.interface";
import lib from "../lib";

export function setLogger(logger: ILogger) {
  lib.loggerService.setLogger(logger);
};

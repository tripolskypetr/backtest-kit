import { ILogger } from "../interfaces/Logger.interface";
import backtest from "../lib";

export async function setLogger(logger: ILogger) {
    backtest.loggerService.setLogger(logger);
}

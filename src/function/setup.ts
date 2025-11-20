import { ILogger } from "../interfaces/Logger.interface";
import backtest from "../lib";

/**
 * Sets custom logger implementation for the framework.
 *
 * All log messages from internal services will be forwarded to the provided logger
 * with automatic context injection (strategyName, exchangeName, symbol, etc.).
 *
 * @param logger - Custom logger implementing ILogger interface
 *
 * @example
 * ```typescript
 * setLogger({
 *   log: (topic, ...args) => console.log(topic, args),
 *   debug: (topic, ...args) => console.debug(topic, args),
 *   info: (topic, ...args) => console.info(topic, args),
 * });
 * ```
 */
export async function setLogger(logger: ILogger) {
    backtest.loggerService.setLogger(logger);
}

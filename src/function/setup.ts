import { GLOBAL_CONFIG, GlobalConfig } from "../config/params";
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

/**
 * Sets global configuration parameters for the framework.
 * @param config - Partial configuration object to override default settings
 *
 * @example
 * ```typescript
 * setConfig({
 *   CC_SCHEDULE_AWAIT_MINUTES: 90,
 * });
 * ```
 */
export async function setConfig(config: Partial<GlobalConfig>) {
    Object.assign(GLOBAL_CONFIG, config);
}


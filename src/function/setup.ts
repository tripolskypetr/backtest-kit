import { getErrorMessage } from "functools-kit";
import { DEFAULT_CONFIG, GLOBAL_CONFIG, GlobalConfig } from "../config/params";
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
export function setLogger(logger: ILogger) {
  backtest.loggerService.setLogger(logger);
}

/**
 * Sets global configuration parameters for the framework.
 * @param config - Partial configuration object to override default settings
 * @param _unsafe - Skip config validations - required for testbed
 * 
 * @example
 * ```typescript
 * setConfig({
 *   CC_SCHEDULE_AWAIT_MINUTES: 90,
 * });
 * ```
 */
export function setConfig(config: Partial<GlobalConfig>, _unsafe?: boolean) {
  const prevConfig = Object.assign({}, GLOBAL_CONFIG);
  try {
    Object.assign(GLOBAL_CONFIG, config);
    !_unsafe && backtest.configValidationService.validate();
  } catch (error) {
    console.warn(
      `backtest-kit setConfig failed: ${getErrorMessage(error)}`,
      config
    );
    Object.assign(GLOBAL_CONFIG, prevConfig);
    throw error;
  }
}

/**
 * Retrieves a copy of the current global configuration.
 * 
 * Returns a shallow copy of the current GLOBAL_CONFIG to prevent accidental mutations.
 * Use this to inspect the current configuration state without modifying it.
 * 
 * @returns {GlobalConfig} A copy of the current global configuration object
 * 
 * @example
 * ```typescript
 * const currentConfig = getConfig();
 * console.log(currentConfig.CC_SCHEDULE_AWAIT_MINUTES);
 * ```
 */
export function getConfig() {
    return Object.assign({}, GLOBAL_CONFIG);
}

/**
 * Retrieves the default configuration object for the framework.
 * 
 * Returns a reference to the default configuration with all preset values.
 * Use this to see what configuration options are available and their default values.
 * 
 * @returns {GlobalConfig} The default configuration object
 * 
 * @example
 * ```typescript
 * const defaultConfig = getDefaultConfig();
 * console.log(defaultConfig.CC_SCHEDULE_AWAIT_MINUTES);
 * ```
 */
export function getDefaultConfig() {
    return DEFAULT_CONFIG;
}

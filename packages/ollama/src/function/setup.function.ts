import { getErrorMessage } from "functools-kit";
import { DEFAULT_CONFIG, GLOBAL_CONFIG, GlobalConfig } from "../config/params";
import { ILogger } from "../interface/Logger.interface";
import lib from "../lib";

/**
 * Type representing the global configuration object with flexible value types.
 * 
 * Maps all keys from GlobalConfig interface to allow any value type during configuration updates.
 * Used to provide type-safe partial configuration overrides while maintaining flexibility.
 * 
 * @typedef {Object} Cfg
 * @template {keyof GlobalConfig} K - Configuration key names from GlobalConfig
 * 
 * @example
 * ```typescript
 * const customConfig: Partial<Cfg> = {
 *   CC_ENABLE_DEBUG: true,
 *   CC_ENABLE_THINKING: false,
 * };
 * ```
 */
type Cfg = {
  [key in keyof GlobalConfig]: any;
}

/**
 * Sets custom logger implementation for the framework.
 *
 * All log messages from internal services will be forwarded to the provided logger
 * with automatic context injection.
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
export const setLogger = (logger: ILogger) => {
  lib.loggerService.setLogger(logger);
};

/**
 * Sets global configuration parameters for the framework.
 * @param config - Partial configuration object to override default settings
 *
 * @example
 * ```typescript
 * setConfig({
 *   CC_ENABLE_DEBUG: true,
 *   CC_ENABLE_THINKING: true,
 * });
 * ```
 */
export function setConfig(config: Partial<Cfg>) {
  const prevConfig = Object.assign({}, GLOBAL_CONFIG);
  try {
    Object.assign(GLOBAL_CONFIG, config);
  } catch (error) {
    console.warn(
      `ollama setConfig failed: ${getErrorMessage(error)}`,
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
 * console.log(currentConfig.CC_ENABLE_DEBUG);
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
 * console.log(defaultConfig.CC_ENABLE_DEBUG);
 * ```
 */
export function getDefaultConfig() {
  return DEFAULT_CONFIG;
}

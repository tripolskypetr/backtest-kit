/**
 * Configuration utilities for signals library.
 *
 * Provides functions to customize library behavior, primarily logging configuration.
 *
 * @module tools/setup
 */

import { ILogger } from "../interfaces/Logger.interface";
import lib from "../lib";

/**
 * Sets custom logger implementation for signals library.
 *
 * By default, signals uses a no-op logger (no output).
 * Use this function to enable logging for debugging and monitoring.
 *
 * @param logger - Custom logger implementation conforming to ILogger interface
 *
 * @example
 * ```typescript
 * import { setLogger } from '@backtest-kit/signals';
 *
 * // Enable console logging
 * setLogger({
 *   log: console.log,
 *   debug: console.debug,
 *   info: console.info,
 *   warn: console.warn,
 * });
 *
 * // Or use custom logger
 * import winston from 'winston';
 * setLogger({
 *   log: (topic, ...args) => winston.log('info', topic, args),
 *   debug: (topic, ...args) => winston.debug(topic, args),
 *   info: (topic, ...args) => winston.info(topic, args),
 *   warn: (topic, ...args) => winston.warn(topic, args),
 * });
 * ```
 */
export const setLogger = (logger: ILogger) => {
  lib.loggerService.setLogger(logger);
}

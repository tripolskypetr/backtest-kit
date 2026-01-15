/**
 * Logger interface for diagnostic output in signals library.
 *
 * Defines the contract for custom logging implementations.
 * By default, signals uses a no-op logger (all methods do nothing).
 * Use setLogger() to provide a custom implementation for debugging and monitoring.
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
 * // Or custom logger
 * setLogger({
 *   log: (topic, ...args) => myLogger.log(`[SIGNALS] ${topic}`, args),
 *   debug: (topic, ...args) => myLogger.debug(`[SIGNALS] ${topic}`, args),
 *   info: (topic, ...args) => myLogger.info(`[SIGNALS] ${topic}`, args),
 *   warn: (topic, ...args) => myLogger.warn(`[SIGNALS] ${topic}`, args),
 * });
 * ```
 */
export interface ILogger {
  /**
   * Log general information.
   * @param topic - Log category or topic
   * @param args - Additional arguments to log
   */
  log(topic: string, ...args: any[]): void;

  /**
   * Log debug information.
   * @param topic - Log category or topic
   * @param args - Additional arguments to log
   */
  debug(topic: string, ...args: any[]): void;

  /**
   * Log informational messages.
   * @param topic - Log category or topic
   * @param args - Additional arguments to log
   */
  info(topic: string, ...args: any[]): void;

  /**
   * Log warning messages.
   * @param topic - Log category or topic
   * @param args - Additional arguments to log
   */
  warn(topic: string, ...args: any[]): void;
}

/**
 * Logger service for signals library diagnostic output.
 *
 * Provides logging capabilities with a no-op default implementation.
 * Use setLogger() from the public API to enable actual logging output.
 *
 * @example
 * ```typescript
 * import { setLogger } from '@backtest-kit/signals';
 *
 * setLogger({
 *   log: console.log,
 *   debug: console.debug,
 *   info: console.info,
 *   warn: console.warn,
 * });
 * ```
 */

import { ILogger } from "../../../interfaces/Logger.interface";

/**
 * No-op logger implementation that discards all log calls.
 * Used as default to avoid polluting console output.
 */
const NOOP_LOGGER: ILogger = {
  log() {
    void 0;
  },
  debug() {
    void 0;
  },
  info() {
    void 0;
  },
  warn() {
    void 0;
  },
};

/**
 * Logger service implementation with configurable backend.
 *
 * Delegates all logging calls to the configured logger implementation.
 * Defaults to NOOP_LOGGER which discards all output.
 */
export class LoggerService implements ILogger {
  private _commonLogger: ILogger = NOOP_LOGGER;

  /**
   * Logs general messages with topic and optional arguments.
   *
   * Delegates to configured logger implementation. Uses no-op logger by default
   * until setLogger() is called with custom implementation.
   *
   * @param topic - Log topic or category identifier
   * @param args - Additional arguments to log
   *
   * @example
   * ```typescript
   * const logger = new LoggerService();
   * await logger.log('user-action', { userId: '123', action: 'login' });
   * // Output depends on configured logger implementation
   * ```
   */
  public log = async (topic: string, ...args: any[]) => {
    await this._commonLogger.log(
      topic,
      ...args,
    );
  };

  /**
   * Logs debug-level messages with topic and optional arguments.
   *
   * Typically used for detailed diagnostic information during development.
   * Delegates to configured logger implementation.
   *
   * @param topic - Debug topic or category identifier
   * @param args - Additional arguments to log
   *
   * @example
   * ```typescript
   * const logger = new LoggerService();
   * await logger.debug('api-call', { endpoint: '/data', params: { limit: 10 } });
   * ```
   */
  public debug = async (topic: string, ...args: any[]) => {
    await this._commonLogger.debug(
      topic,
      ...args,
    );
  };

  /**
   * Logs informational messages with topic and optional arguments.
   *
   * Used for general informational messages about application state or progress.
   * Delegates to configured logger implementation.
   *
   * @param topic - Info topic or category identifier
   * @param args - Additional arguments to log
   *
   * @example
   * ```typescript
   * const logger = new LoggerService();
   * await logger.info('server-start', { port: 3000, env: 'production' });
   * ```
   */
  public info = async (topic: string, ...args: any[]) => {
    await this._commonLogger.info(
      topic,
      ...args,
    );
  };

  /**
   * Logs warning messages with topic and optional arguments.
   *
   * Used for potentially harmful situations that don't prevent execution.
   * Delegates to configured logger implementation.
   *
   * @param topic - Warning topic or category identifier
   * @param args - Additional arguments to log
   *
   * @example
   * ```typescript
   * const logger = new LoggerService();
   * await logger.warn('rate-limit', { limit: 100, current: 95 });
   * ```
   */
  public warn = async (topic: string, ...args: any[]) => {
    await this._commonLogger.warn(
      topic,
      ...args,
    );
  };

  /**
   * Sets custom logger implementation.
   *
   * Replaces the default no-op logger with a custom implementation that
   * conforms to the ILogger interface. Call this during application initialization
   * to enable actual logging output.
   *
   * @param logger - Custom logger conforming to ILogger interface
   *
   * @example
   * ```typescript
   * const logger = new LoggerService();
   * logger.setLogger({
   *   log: console.log,
   *   debug: console.debug,
   *   info: console.info,
   *   warn: console.warn,
   * });
   * await logger.log('test', 'now logging to console');
   * ```
   */
  public setLogger = (logger: ILogger) => {
    this._commonLogger = logger;
  };
}

export default LoggerService;

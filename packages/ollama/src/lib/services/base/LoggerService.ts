import { ILogger } from "../../../interface/Logger.interface";

/**
 * No-operation logger that silently discards all log messages.
 * Used as default logger before a real logger is configured.
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
 * Centralized logging service for the Ollama package.
 *
 * Provides a unified interface for logging operations across the application.
 * Uses a delegate pattern to forward log calls to a configured logger implementation.
 * Defaults to a no-op logger if no logger is set.
 *
 * Key features:
 * - Supports multiple log levels: log, debug, info, warn
 * - Configurable logger backend via setLogger
 * - Async logging support
 * - Safe default (no-op) when unconfigured
 *
 * @example
 * ```typescript
 * import { LoggerService } from "./services/common/LoggerService";
 * import { setLogger } from "./function/setup.function";
 *
 * // Configure custom logger
 * setLogger({
 *   log: async (topic, ...args) => console.log(topic, ...args),
 *   debug: async (topic, ...args) => console.debug(topic, ...args),
 *   info: async (topic, ...args) => console.info(topic, ...args),
 *   warn: async (topic, ...args) => console.warn(topic, ...args),
 * });
 *
 * const loggerService = inject<LoggerService>(TYPES.loggerService);
 * await loggerService.info("Operation completed", { status: "success" });
 * ```
 */
export class LoggerService implements ILogger {
  /** Internal logger instance, defaults to NOOP_LOGGER */
  private _commonLogger: ILogger = NOOP_LOGGER;

  /**
   * Logs a general message with optional arguments.
   *
   * @param topic - Message topic or category
   * @param args - Additional arguments to log
   */
  public log = async (topic: string, ...args: any[]) => {
    await this._commonLogger.log(
      topic,
      ...args,
    );
  };

  /**
   * Logs a debug message with optional arguments.
   * Used for detailed diagnostic information.
   *
   * @param topic - Message topic or category
   * @param args - Additional arguments to log
   */
  public debug = async (topic: string, ...args: any[]) => {
    await this._commonLogger.debug(
      topic,
      ...args,
    );
  };

  /**
   * Logs an informational message with optional arguments.
   * Used for general operational information.
   *
   * @param topic - Message topic or category
   * @param args - Additional arguments to log
   */
  public info = async (topic: string, ...args: any[]) => {
    await this._commonLogger.info(
      topic,
      ...args,
    );
  };

  /**
   * Logs a warning message with optional arguments.
   * Used for potentially problematic situations.
   *
   * @param topic - Message topic or category
   * @param args - Additional arguments to log
   */
  public warn = async (topic: string, ...args: any[]) => {
    await this._commonLogger.warn(
      topic,
      ...args,
    );
  };

  /**
   * Sets the logger implementation to use for all logging operations.
   *
   * @param logger - Logger implementation conforming to ILogger interface
   *
   * @example
   * ```typescript
   * const logger = new LoggerService();
   * logger.setLogger({
   *   log: async (topic, ...args) => console.log(topic, ...args),
   *   debug: async (topic, ...args) => console.debug(topic, ...args),
   *   info: async (topic, ...args) => console.info(topic, ...args),
   *   warn: async (topic, ...args) => console.warn(topic, ...args),
   * });
   * ```
   */
  public setLogger = (logger: ILogger) => {
    this._commonLogger = logger;
  };
}

export default LoggerService;

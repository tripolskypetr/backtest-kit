import { inject } from "../../../lib/core/di";
import { ILogger } from "../../../interfaces/Logger.interface";
import MethodContextService, {
  TMethodContextService,
} from "../context/MethodContextService";
import TYPES from "../../../lib/core/types";
import ExecutionContextService, {
  TExecutionContextService,
} from "../context/ExecutionContextService";

/**
 * No-op logger implementation used as default.
 * Silently discards all log messages.
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
};

/**
 * Logger service with automatic context injection.
 *
 * Features:
 * - Delegates to user-provided logger via setLogger()
 * - Automatically appends method context (strategyName, exchangeName, frameName)
 * - Automatically appends execution context (symbol, when, backtest)
 * - Defaults to NOOP_LOGGER if no logger configured
 *
 * Used throughout the framework for consistent logging with context.
 */
export class LoggerService implements ILogger {
  private readonly methodContextService = inject<TMethodContextService>(
    TYPES.methodContextService
  );
  private readonly executionContextService = inject<TExecutionContextService>(
    TYPES.executionContextService
  );

  private _commonLogger: ILogger = NOOP_LOGGER;

  /**
   * Gets current method context if available.
   * Contains strategyName, exchangeName, frameName from MethodContextService.
   */
  private get methodContext() {
    if (MethodContextService.hasContext()) {
      return this.methodContextService.context;
    }
    return {};
  }

  /**
   * Gets current execution context if available.
   * Contains symbol, when, backtest from ExecutionContextService.
   */
  private get executionContext() {
    if (ExecutionContextService.hasContext()) {
      return this.executionContextService.context;
    }
    return {};
  }

  /**
   * Logs general-purpose message with automatic context injection.
   *
   * @param topic - Log topic/category
   * @param args - Additional log arguments
   */
  public log = async (topic: string, ...args: any[]) => {
    await this._commonLogger.log(
      topic,
      ...args,
      this.methodContext,
      this.executionContext
    );
  };

  /**
   * Logs debug-level message with automatic context injection.
   *
   * @param topic - Log topic/category
   * @param args - Additional log arguments
   */
  public debug = async (topic: string, ...args: any[]) => {
    await this._commonLogger.debug(
      topic,
      ...args,
      this.methodContext,
      this.executionContext
    );
  };

  /**
   * Logs info-level message with automatic context injection.
   *
   * @param topic - Log topic/category
   * @param args - Additional log arguments
   */
  public info = async (topic: string, ...args: any[]) => {
    await this._commonLogger.info(
      topic,
      ...args,
      this.methodContext,
      this.executionContext
    );
  };

  /**
   * Sets custom logger implementation.
   *
   * @param logger - Custom logger implementing ILogger interface
   */
  public setLogger = (logger: ILogger) => {
    this._commonLogger = logger;
  };
}

export default LoggerService;

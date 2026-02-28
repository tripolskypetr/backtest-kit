import { randomString, singleshot } from "functools-kit";
import { ILogEntry, ILogger } from "../interfaces/Logger.interface";
import { PersistLogAdapter } from "./Persist";
import backtest, { ExecutionContextService } from "../lib";
import { GLOBAL_CONFIG } from "../config/params";

const LOG_PERSIST_METHOD_NAME_WAIT_FOR_INIT = "LogPersistUtils.waitForInit";
const LOG_PERSIST_METHOD_NAME_LOG = "LogPersistUtils.log";
const LOG_PERSIST_METHOD_NAME_DEBUG = "LogPersistUtils.debug";
const LOG_PERSIST_METHOD_NAME_INFO = "LogPersistUtils.info";
const LOG_PERSIST_METHOD_NAME_WARN = "LogPersistUtils.warn";
const LOG_PERSIST_METHOD_NAME_GET_LIST = "LogPersistUtils.getList";

const LOG_MEMORY_METHOD_NAME_LOG = "LogMemoryUtils.log";
const LOG_MEMORY_METHOD_NAME_DEBUG = "LogMemoryUtils.debug";
const LOG_MEMORY_METHOD_NAME_INFO = "LogMemoryUtils.info";
const LOG_MEMORY_METHOD_NAME_WARN = "LogMemoryUtils.warn";
const LOG_MEMORY_METHOD_NAME_GET_LIST = "LogMemoryUtils.getList";

const LOG_ADAPTER_METHOD_NAME_USE_LOGGER = "LogAdapter.useLogger";
const LOG_ADAPTER_METHOD_NAME_USE_PERSIST = "LogAdapter.usePersist";
const LOG_ADAPTER_METHOD_NAME_USE_MEMORY = "LogAdapter.useMemory";
const LOG_ADAPTER_METHOD_NAME_USE_DUMMY = "LogAdapter.useDummy";

/**
 * Backtest execution time retrieval function.
 * Returns the 'when' timestamp from the execution context if available, otherwise returns the current time.
 * This allows log entries to be timestamped according to the backtest timeline rather than real-world time, improving log relevance and user experience during backtest analysis.
 */
const GET_DATE_FN = async () => {
  if (ExecutionContextService.hasContext()) {
    return new Date(backtest.executionContextService.context.when);
  }
  return new Date();
};

/**
 * Extended logger interface with log history access.
 */
export interface ILog extends ILogger {
  /**
   * Returns all stored log entries.
   * @returns Array of all log entries
   */
  getList(): Promise<ILogEntry[]>;
}

/**
 * Constructor type for log adapters.
 * Used for custom log implementations.
 */
export type TLogCtor = new () => Partial<ILog>;

/**
 * Persistent log adapter.
 *
 * Features:
 * - Persists log entries to disk using PersistLogAdapter
 * - Lazy initialization with singleshot pattern
 * - Maintains up to CC_MAX_LOG_LINES most recent entries
 * - Each entry stored individually keyed by its id
 *
 * Use this adapter (default) for log persistence across sessions.
 */
export class LogPersistUtils implements ILog {
  /** Array of log entries */
  private _entries: ILogEntry[] = [];

  /**
   * Singleshot initialization function that loads entries from disk.
   * Protected by singleshot to ensure one-time execution.
   */
  private waitForInit = singleshot(async () => {
    backtest.loggerService.info(LOG_PERSIST_METHOD_NAME_WAIT_FOR_INIT);
    const list = await PersistLogAdapter.readLogData();
    list.sort((a, b) => a.timestamp - b.timestamp);
    this._entries = list.slice(-GLOBAL_CONFIG.CC_MAX_LOG_LINES);
  });

  /**
   * Removes oldest entries if limit is exceeded.
   */
  private _enforceLimit(): void {
    if (this._entries.length > GLOBAL_CONFIG.CC_MAX_LOG_LINES) {
      this._entries.splice(
        0,
        this._entries.length - GLOBAL_CONFIG.CC_MAX_LOG_LINES,
      );
    }
  }

  /**
   * Logs a general-purpose message.
   * Persists entry to disk after appending.
   * @param topic - The log topic / method name
   * @param args - Additional arguments
   */
  public log = async (topic: string, ...args: any[]): Promise<void> => {
    backtest.loggerService.info(LOG_PERSIST_METHOD_NAME_LOG, { topic });
    await this.waitForInit();
    const date = await GET_DATE_FN();
    this._entries.push({
      id: randomString(),
      type: "log",
      timestamp: Date.now(),
      createdAt: date.toISOString(),
      topic,
      args,
    });
    this._enforceLimit();
    await PersistLogAdapter.writeLogData(this._entries);
  };

  /**
   * Logs a debug-level message.
   * Persists entry to disk after appending.
   * @param topic - The log topic / method name
   * @param args - Additional arguments
   */
  public debug = async (topic: string, ...args: any[]): Promise<void> => {
    backtest.loggerService.info(LOG_PERSIST_METHOD_NAME_DEBUG, { topic });
    await this.waitForInit();
    const date = await GET_DATE_FN();
    this._entries.push({
      id: randomString(),
      type: "debug",
      timestamp: Date.now(),
      createdAt: date.toISOString(),
      topic,
      args,
    });
    this._enforceLimit();
    await PersistLogAdapter.writeLogData(this._entries);
  };

  /**
   * Logs an info-level message.
   * Persists entry to disk after appending.
   * @param topic - The log topic / method name
   * @param args - Additional arguments
   */
  public info = async (topic: string, ...args: any[]): Promise<void> => {
    backtest.loggerService.info(LOG_PERSIST_METHOD_NAME_INFO, { topic });
    await this.waitForInit();
    const date = await GET_DATE_FN();
    this._entries.push({
      id: randomString(),
      type: "info",
      timestamp: Date.now(),
      createdAt: date.toISOString(),
      topic,
      args,
    });
    this._enforceLimit();
    await PersistLogAdapter.writeLogData(this._entries);
  };

  /**
   * Logs a warning-level message.
   * Persists entry to disk after appending.
   * @param topic - The log topic / method name
   * @param args - Additional arguments
   */
  public warn = async (topic: string, ...args: any[]): Promise<void> => {
    backtest.loggerService.info(LOG_PERSIST_METHOD_NAME_WARN, { topic });
    await this.waitForInit();
    const date = await GET_DATE_FN();
    this._entries.push({
      id: randomString(),
      type: "warn",
      timestamp: Date.now(),
      createdAt: date.toISOString(),
      topic,
      args,
    });
    this._enforceLimit();
    await PersistLogAdapter.writeLogData(this._entries);
  };

  /**
   * Lists all stored log entries.
   * @returns Array of all log entries
   */
  public getList = async (): Promise<ILogEntry[]> => {
    backtest.loggerService.info(LOG_PERSIST_METHOD_NAME_GET_LIST);
    await this.waitForInit();
    return [...this._entries];
  };
}

/**
 * In-memory log adapter.
 *
 * Features:
 * - Stores log entries in memory only (no persistence)
 * - Maintains up to CC_MAX_LOG_LINES most recent entries
 * - Data is lost when application restarts
 * - Handles all log levels (log, debug, info, warn)
 *
 * Use this adapter for testing or when persistence is not required.
 */
export class LogMemoryUtils implements ILog {
  /** Array of log entries */
  private _entries: ILogEntry[] = [];

  /**
   * Removes oldest entries if limit is exceeded.
   */
  private _enforceLimit(): void {
    if (this._entries.length > GLOBAL_CONFIG.CC_MAX_LOG_LINES) {
      this._entries.splice(
        0,
        this._entries.length - GLOBAL_CONFIG.CC_MAX_LOG_LINES,
      );
    }
  }

  /**
   * Logs a general-purpose message.
   * Appends entry to in-memory array.
   * @param topic - The log topic / method name
   * @param args - Additional arguments
   */
  public log = async (topic: string, ...args: any[]): Promise<void> => {
    backtest.loggerService.info(LOG_MEMORY_METHOD_NAME_LOG, { topic });
    const date = await GET_DATE_FN();
    this._entries.push({
      id: randomString(),
      type: "log",
      timestamp: Date.now(),
      createdAt: date.toISOString(),
      topic,
      args,
    });
    this._enforceLimit();
  };

  /**
   * Logs a debug-level message.
   * Appends entry to in-memory array.
   * @param topic - The log topic / method name
   * @param args - Additional arguments
   */
  public debug = async (topic: string, ...args: any[]): Promise<void> => {
    backtest.loggerService.info(LOG_MEMORY_METHOD_NAME_DEBUG, { topic });
    const date = await GET_DATE_FN();
    this._entries.push({
      id: randomString(),
      type: "debug",
      timestamp: Date.now(),
      createdAt: date.toISOString(),
      topic,
      args,
    });
    this._enforceLimit();
  };

  /**
   * Logs an info-level message.
   * Appends entry to in-memory array.
   * @param topic - The log topic / method name
   * @param args - Additional arguments
   */
  public info = async (topic: string, ...args: any[]): Promise<void> => {
    backtest.loggerService.info(LOG_MEMORY_METHOD_NAME_INFO, { topic });
    const date = await GET_DATE_FN();
    this._entries.push({
      id: randomString(),
      type: "info",
      timestamp: Date.now(),
      createdAt: date.toISOString(),
      topic,
      args,
    });
    this._enforceLimit();
  };

  /**
   * Logs a warning-level message.
   * Appends entry to in-memory array.
   * @param topic - The log topic / method name
   * @param args - Additional arguments
   */
  public warn = async (topic: string, ...args: any[]): Promise<void> => {
    backtest.loggerService.info(LOG_MEMORY_METHOD_NAME_WARN, { topic });
    const date = await GET_DATE_FN();
    this._entries.push({
      id: randomString(),
      type: "warn",
      timestamp: Date.now(),
      createdAt: date.toISOString(),
      topic,
      args,
    });
    this._enforceLimit();
  };

  /**
   * Lists all stored log entries.
   * @returns Array of all log entries
   */
  public getList = async (): Promise<ILogEntry[]> => {
    backtest.loggerService.info(LOG_MEMORY_METHOD_NAME_GET_LIST);
    return [...this._entries];
  };
}

/**
 * Dummy log adapter that discards all writes.
 *
 * Features:
 * - No-op implementation for all methods
 * - getList always returns empty array
 *
 * Use this adapter to disable log storage completely.
 */
export class LogDummyUtils implements ILog {
  /**
   * Always returns empty array (no storage).
   * @returns Empty array
   */
  async getList(): Promise<ILogEntry[]> {
    return [];
  }

  /**
   * No-op handler for general-purpose log.
   */
  log() {
    void 0;
  }

  /**
   * No-op handler for debug-level log.
   */
  debug() {
    void 0;
  }

  /**
   * No-op handler for info-level log.
   */
  info() {
    void 0;
  }

  /**
   * No-op handler for warning-level log.
   */
  warn() {
    void 0;
  }
}

/**
 * Log adapter with pluggable storage backend.
 *
 * Features:
 * - Adapter pattern for swappable log implementations
 * - Default adapter: LogMemoryUtils (in-memory storage)
 * - Alternative adapters: LogPersistUtils, LogDummyUtils
 * - Convenience methods: usePersist(), useMemory(), useDummy()
 */
export class LogAdapter implements ILog {
  /** Internal log utils instance */
  private _log: Partial<ILog> = new LogMemoryUtils();

  /**
   * Lists all stored log entries.
   * Proxies call to the underlying log adapter.
   * @returns Array of all log entries
   */
  public getList = async () => {
    if (this._log.getList) {
      return await this._log.getList();
    }
    return [];
  };

  /**
   * Logs a general-purpose message.
   * Proxies call to the underlying log adapter.
   * @param topic - The log topic / method name
   * @param args - Additional arguments
   */
  public log = (topic: string, ...args: any[]) => {
    if (this._log.log) {
      this._log.log(topic, ...args);
    }
  };

  /**
   * Logs a debug-level message.
   * Proxies call to the underlying log adapter.
   * @param topic - The log topic / method name
   * @param args - Additional arguments
   */
  public debug = (topic: string, ...args: any[]) => {
    if (this._log.debug) {
      this._log.debug(topic, ...args);
    }
  };

  /**
   * Logs an info-level message.
   * Proxies call to the underlying log adapter.
   * @param topic - The log topic / method name
   * @param args - Additional arguments
   */
  public info = (topic: string, ...args: any[]) => {
    if (this._log.info) {
      this._log.info(topic, ...args);
    }
  };

  /**
   * Logs a warning-level message.
   * Proxies call to the underlying log adapter.
   * @param topic - The log topic / method name
   * @param args - Additional arguments
   */
  public warn = (topic: string, ...args: any[]) => {
    if (this._log.warn) {
      this._log.warn(topic, ...args);
    }
  };

  /**
   * Sets the log adapter constructor.
   * All future log operations will use this adapter.
   * @param Ctor - Constructor for log adapter
   */
  public useLogger = (Ctor: TLogCtor) => {
    backtest.loggerService.info(LOG_ADAPTER_METHOD_NAME_USE_LOGGER);
    this._log = Reflect.construct(Ctor, []);
  };

  /**
   * Switches to persistent log adapter.
   * Log entries will be persisted to disk.
   */
  public usePersist = () => {
    backtest.loggerService.info(LOG_ADAPTER_METHOD_NAME_USE_PERSIST);
    this._log = new LogPersistUtils();
  };

  /**
   * Switches to in-memory log adapter (default).
   * Log entries will be stored in memory only.
   */
  public useMemory = () => {
    backtest.loggerService.info(LOG_ADAPTER_METHOD_NAME_USE_MEMORY);
    this._log = new LogMemoryUtils();
  };

  /**
   * Switches to dummy log adapter.
   * All future log writes will be no-ops.
   */
  public useDummy = () => {
    backtest.loggerService.info(LOG_ADAPTER_METHOD_NAME_USE_DUMMY);
    this._log = new LogDummyUtils();
  };
}

/**
 * Global singleton instance of LogAdapter.
 * Provides unified log management with pluggable backends.
 */
export const Log = new LogAdapter();

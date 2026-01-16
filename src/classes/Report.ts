import * as fs from "fs/promises";
import { createWriteStream, WriteStream } from "fs";
import { join } from "path";
import lib from "../lib";
import {
  compose,
  getErrorMessage,
  makeExtendable,
  memoize,
  singleshot,
  timeout,
  TIMEOUT_SYMBOL,
} from "functools-kit";
import { exitEmitter } from "../config/emitters";

const REPORT_BASE_METHOD_NAME_CTOR = "ReportBase.CTOR";
const REPORT_BASE_METHOD_NAME_WAIT_FOR_INIT = "ReportBase.waitForInit";
const REPORT_BASE_METHOD_NAME_WRITE = "ReportBase.write";

const REPORT_UTILS_METHOD_NAME_USE_REPORT_ADAPTER =
  "ReportUtils.useReportAdapter";
const REPORT_UTILS_METHOD_NAME_WRITE_DATA = "ReportUtils.writeReportData";
const REPORT_UTILS_METHOD_NAME_ENABLE = "ReportUtils.enable";
const REPORT_UTILS_METHOD_NAME_DISABLE = "ReportUtils.disable";
const REPORT_UTILS_METHOD_NAME_USE_DUMMY = "ReportUtils.useDummy";
const REPORT_UTILS_METHOD_NAME_USE_JSONL = "ReportUtils.useJsonl";

const WAIT_FOR_INIT_SYMBOL = Symbol("wait-for-init");
const WRITE_SAFE_SYMBOL = Symbol("write-safe");

/**
 * Configuration interface for selective report service enablement.
 * Controls which report services should be activated for JSONL event logging.
 */
interface IReportTarget {
  /** Enable risk rejection event logging */
  risk: boolean;
  /** Enable breakeven event logging */
  breakeven: boolean;
  /** Enable partial close event logging */
  partial: boolean;
  /** Enable heatmap data event logging */
  heat: boolean;
  /** Enable walker iteration event logging */
  walker: boolean;
  /** Enable performance metrics event logging */
  performance: boolean;
  /** Enable scheduled signal event logging */
  schedule: boolean;
  /** Enable live trading event logging (all tick states) */
  live: boolean;
  /** Enable backtest closed signal event logging */
  backtest: boolean;
}

/**
 * Union type of all valid report names.
 * Used for type-safe identification of report services.
 */
export type ReportName = keyof IReportTarget;

/**
 * Options for report data writes.
 * Contains metadata for event filtering and search.
 */
export interface IReportDumpOptions {
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Strategy name */
  strategyName: string;
  /** Exchange name */
  exchangeName: string;
  /** Frame name (timeframe identifier) */
  frameName: string;
  /** Signal unique identifier */
  signalId: string;
  /** Walker optimization name */
  walkerName: string;
}

/**
 * Base interface for report storage adapters.
 * All report adapters must implement this interface.
 */
export type TReportBase = {
  /**
   * Initialize report storage and prepare for writes.
   * Uses singleshot to ensure one-time execution.
   *
   * @param initial - Whether this is the first initialization
   * @returns Promise that resolves when initialization is complete
   */
  waitForInit(initial: boolean): Promise<void>;

  /**
   * Write report data to storage.
   *
   * @param data - Report data object to write
   * @param options - Metadata options for filtering and search
   * @returns Promise that resolves when write is complete
   * @throws Error if write fails or stream is not initialized
   */
  write<T = any>(data: T, options: IReportDumpOptions): Promise<void>;
};

/**
 * Constructor type for report storage adapters.
 * Used for custom report storage implementations.
 */
export type TReportBaseCtor = new (
  reportName: ReportName,
  baseDir: string
) => TReportBase;

/**
 * JSONL-based report adapter with append-only writes.
 *
 * Features:
 * - Writes events as JSONL entries to a single file per report type
 * - Stream-based writes with backpressure handling
 * - 15-second timeout protection for write operations
 * - Automatic directory creation
 * - Error handling via exitEmitter
 * - Search metadata for filtering (symbol, strategy, exchange, frame, signalId, walkerName)
 *
 * File format: ./dump/report/{reportName}.jsonl
 * Each line contains: reportName, data, metadata, timestamp
 *
 * Use this adapter for event logging and post-processing analytics.
 */
class ReportBase implements TReportBase {
  /** Absolute path to the JSONL file for this report type */
  _filePath: string;

  /** WriteStream instance for append-only writes, null until initialized */
  _stream: WriteStream | null = null;

  /**
   * Creates a new JSONL report adapter instance.
   *
   * @param reportName - Type of report (backtest, live, walker, etc.)
   * @param baseDir - Base directory for report files, defaults to ./dump/report
   */
  constructor(
    readonly reportName: ReportName,
    readonly baseDir = join(process.cwd(), "./dump/report")
  ) {
    lib.loggerService.debug(REPORT_BASE_METHOD_NAME_CTOR, {
      reportName: this.reportName,
      baseDir,
    });
    this._filePath = join(this.baseDir, `${this.reportName}.jsonl`);
  }

  /**
   * Singleshot initialization function that creates directory and stream.
   * Protected by singleshot to ensure one-time execution.
   * Sets up error handler that emits to exitEmitter.
   */
  [WAIT_FOR_INIT_SYMBOL] = singleshot(async (): Promise<void> => {
    await fs.mkdir(this.baseDir, { recursive: true });
    this._stream = createWriteStream(this._filePath, { flags: "a" });
    this._stream.on("error", (err) => {
      exitEmitter.next(
        new Error(
          `ReportBase stream error for reportName=${
            this.reportName
          } message=${getErrorMessage(err)}`
        )
      );
    });
  });

  /**
   * Timeout-protected write function with backpressure handling.
   * Waits for drain event if write buffer is full.
   * Times out after 15 seconds and returns TIMEOUT_SYMBOL.
   */
  [WRITE_SAFE_SYMBOL] = timeout(async (line: string) => {
    if (!this._stream.write(line)) {
      await new Promise<void>((resolve) => {
        this._stream!.once("drain", resolve);
      });
    }
  }, 15_000);

  /**
   * Initializes the JSONL file and write stream.
   * Safe to call multiple times - singleshot ensures one-time execution.
   *
   * @param initial - Whether this is the first initialization (informational only)
   * @returns Promise that resolves when initialization is complete
   */
  async waitForInit(initial: boolean): Promise<void> {
    lib.loggerService.debug(REPORT_BASE_METHOD_NAME_WAIT_FOR_INIT, {
      reportName: this.reportName,
      initial,
    });
    await this[WAIT_FOR_INIT_SYMBOL]();
  }

  /**
   * Writes event data to JSONL file with metadata.
   * Appends a single line with JSON object containing:
   * - reportName: Type of report
   * - data: Event data object
   * - Search flags: symbol, strategyName, exchangeName, frameName, signalId, walkerName
   * - timestamp: Current timestamp in milliseconds
   *
   * @param data - Event data object to write
   * @param options - Metadata options for filtering and search
   * @throws Error if stream not initialized or write timeout exceeded
   */
  async write<T = any>(data: T, options: IReportDumpOptions): Promise<void> {
    lib.loggerService.debug(REPORT_BASE_METHOD_NAME_WRITE, {
      reportName: this.reportName,
      options,
    });
    if (!this._stream) {
      throw new Error(
        `Stream not initialized for report ${this.reportName}. Call waitForInit() first.`
      );
    }

    const searchFlags: Partial<IReportDumpOptions> = {};

    if (options.symbol) {
      searchFlags.symbol = options.symbol;
    }

    if (options.strategyName) {
      searchFlags.strategyName = options.strategyName;
    }

    if (options.exchangeName) {
      searchFlags.exchangeName = options.exchangeName;
    }

    if (options.frameName) {
      searchFlags.frameName = options.frameName;
    }

    if (options.signalId) {
      searchFlags.signalId = options.signalId;
    }

    if (options.walkerName) {
      searchFlags.walkerName = options.walkerName;
    }

    const line =
      JSON.stringify({
        reportName: this.reportName,
        data,
        ...searchFlags,
        timestamp: Date.now(),
      }) + "\n";

    const status = await this[WRITE_SAFE_SYMBOL](line);
    if (status === TIMEOUT_SYMBOL) {
      throw new Error(`Timeout writing to report ${this.reportName}`);
    }
  }
}

// @ts-ignore
ReportBase = makeExtendable(ReportBase);

/**
 * Dummy report adapter that discards all writes.
 * Used for disabling report logging.
 */
export class ReportDummy implements TReportBase {
  /**
   * No-op initialization function.
   * @returns Promise that resolves immediately
   */
  async waitForInit() {
    void 0;
  }
  /**
   * No-op write function.
   * @returns Promise that resolves immediately
   */
  async write() {
    void 0;
  }
}

/**
 * Default configuration that enables all report services.
 * Used when no specific configuration is provided to enable().
 */
const WILDCARD_TARGET: IReportTarget = {
  backtest: true,
  breakeven: true,
  heat: true,
  live: true,
  partial: true,
  performance: true,
  risk: true,
  schedule: true,
  walker: true,
};

/**
 * Utility class for managing report services.
 *
 * Provides methods to enable/disable JSONL event logging across
 * different service types (backtest, live, walker, performance, etc.).
 *
 * Typically extended by ReportAdapter for additional functionality.
 */
export class ReportUtils {
  /**
   * Enables report services selectively.
   *
   * Subscribes to specified report services and returns a cleanup function
   * that unsubscribes from all enabled services at once.
   *
   * Each enabled service will:
   * - Start listening to relevant events
   * - Write events to JSONL files in real-time
   * - Include metadata for filtering and analytics
   *
   * IMPORTANT: Always call the returned unsubscribe function to prevent memory leaks.
   *
   * @param config - Service configuration object. Defaults to enabling all services.
   * @param config.backtest - Enable backtest closed signal logging
   * @param config.breakeven - Enable breakeven event logging
   * @param config.partial - Enable partial close event logging
   * @param config.heat - Enable heatmap data logging
   * @param config.walker - Enable walker iteration logging
   * @param config.performance - Enable performance metrics logging
   * @param config.risk - Enable risk rejection logging
   * @param config.schedule - Enable scheduled signal logging
   * @param config.live - Enable live trading event logging
   *
   * @returns Cleanup function that unsubscribes from all enabled services
   */
  public enable = ({
    backtest: bt = false,
    breakeven = false,
    heat = false,
    live = false,
    partial = false,
    performance = false,
    risk = false,
    schedule = false,
    walker = false,
  }: Partial<IReportTarget> = WILDCARD_TARGET) => {
    lib.loggerService.debug(REPORT_UTILS_METHOD_NAME_ENABLE, {
      backtest: bt,
      breakeven,
      heat,
      live,
      partial,
      performance,
      risk,
      schedule,
      walker,
    });
    const unList: Function[] = [];
    if (bt) {
      unList.push(lib.backtestReportService.subscribe());
    }
    if (breakeven) {
      unList.push(lib.breakevenReportService.subscribe());
    }
    if (heat) {
      unList.push(lib.heatReportService.subscribe());
    }
    if (live) {
      unList.push(lib.liveReportService.subscribe());
    }
    if (partial) {
      unList.push(lib.partialReportService.subscribe());
    }
    if (performance) {
      unList.push(lib.performanceReportService.subscribe());
    }
    if (risk) {
      unList.push(lib.riskReportService.subscribe());
    }
    if (schedule) {
      unList.push(lib.scheduleReportService.subscribe());
    }
    if (walker) {
      unList.push(lib.walkerReportService.subscribe());
    }
    return compose(...unList.map((un) => () => void un()));
  };

  /**
   * Disables report services selectively.
   *
   * Unsubscribes from specified report services to stop event logging.
   * Use this method to stop JSONL logging for specific services while keeping others active.
   *
   * Each disabled service will:
   * - Stop listening to events immediately
   * - Stop writing to JSONL files
   * - Free up event listener resources
   *
   * Unlike enable(), this method does NOT return an unsubscribe function.
   * Services are unsubscribed immediately upon calling this method.
   *
   * @param config - Service configuration object specifying which services to disable. Defaults to disabling all services.
   * @param config.backtest - Disable backtest closed signal logging
   * @param config.breakeven - Disable breakeven event logging
   * @param config.partial - Disable partial close event logging
   * @param config.heat - Disable heatmap data logging
   * @param config.walker - Disable walker iteration logging
   * @param config.performance - Disable performance metrics logging
   * @param config.risk - Disable risk rejection logging
   * @param config.schedule - Disable scheduled signal logging
   * @param config.live - Disable live trading event logging
   *
   * @example
   * ```typescript
   * import { Report } from "backtest-kit";
   *
   * // Disable specific services
   * Report.disable({ backtest: true, live: true });
   *
   * // Disable all services
   * Report.disable();
   * ```
   */
  public disable = ({
    backtest: bt = false,
    breakeven = false,
    heat = false,
    live = false,
    partial = false,
    performance = false,
    risk = false,
    schedule = false,
    walker = false,
  }: Partial<IReportTarget> = WILDCARD_TARGET) => {
    lib.loggerService.debug(REPORT_UTILS_METHOD_NAME_DISABLE, {
      backtest: bt,
      breakeven,
      heat,
      live,
      partial,
      performance,
      risk,
      schedule,
      walker,
    });
    if (bt) {
      lib.backtestReportService.unsubscribe();
    }
    if (breakeven) {
      lib.breakevenReportService.unsubscribe();
    }
    if (heat) {
      lib.heatReportService.unsubscribe();
    }
    if (live) {
      lib.liveReportService.unsubscribe();
    }
    if (partial) {
      lib.partialReportService.unsubscribe();
    }
    if (performance) {
      lib.performanceReportService.unsubscribe();
    }
    if (risk) {
      lib.riskReportService.unsubscribe();
    }
    if (schedule) {
      lib.scheduleReportService.unsubscribe();
    }
    if (walker) {
      lib.walkerReportService.unsubscribe();
    }
  };
}

/**
 * Report adapter with pluggable storage backend and instance memoization.
 *
 * Features:
 * - Adapter pattern for swappable storage implementations
 * - Memoized storage instances (one per report type)
 * - Default adapter: ReportBase (JSONL append)
 * - Lazy initialization on first write
 * - Real-time event logging to JSONL files
 *
 * Used for structured event logging and analytics pipelines.
 */
export class ReportAdapter extends ReportUtils {
  /**
   * Current report storage adapter constructor.
   * Defaults to ReportBase for JSONL storage.
   * Can be changed via useReportAdapter().
   */
  private ReportFactory: TReportBaseCtor = ReportBase;

  /**
   * Memoized storage instances cache.
   * Key: reportName (backtest, live, walker, etc.)
   * Value: TReportBase instance created with current ReportFactory.
   * Ensures single instance per report type for the lifetime of the application.
   */
  private getReportStorage = memoize(
    ([reportName]: [ReportName]): string => reportName,
    (reportName: ReportName): TReportBase =>
      Reflect.construct(this.ReportFactory, [reportName, "./dump/report"])
  );

  /**
   * Sets the report storage adapter constructor.
   * All future report instances will use this adapter.
   *
   * @param Ctor - Constructor for report storage adapter
   */
  public useReportAdapter(Ctor: TReportBaseCtor): void {
    lib.loggerService.info(REPORT_UTILS_METHOD_NAME_USE_REPORT_ADAPTER);
    this.ReportFactory = Ctor;
  }

  /**
   * Writes report data to storage using the configured adapter.
   * Automatically initializes storage on first write for each report type.
   *
   * @param reportName - Type of report (backtest, live, walker, etc.)
   * @param data - Event data object to write
   * @param options - Metadata options for filtering and search
   * @returns Promise that resolves when write is complete
   * @throws Error if write fails or storage initialization fails
   *
   * @internal - Automatically called by report services, not for direct use
   */
  public writeData = async <T = any>(
    reportName: ReportName,
    data: T,
    options: IReportDumpOptions
  ): Promise<void> => {
    lib.loggerService.info(REPORT_UTILS_METHOD_NAME_WRITE_DATA, {
      reportName,
      options,
    });

    const isInitial = !this.getReportStorage.has(reportName);
    const reportStorage = this.getReportStorage(reportName);
    await reportStorage.waitForInit(isInitial);

    await reportStorage.write(data, options);
  };

  /**
   * Switches to a dummy report adapter that discards all writes.
   * All future report writes will be no-ops.
   */
  public useDummy() {
    lib.loggerService.log(REPORT_UTILS_METHOD_NAME_USE_DUMMY);
    this.useReportAdapter(ReportDummy);
  }

  /**
   * Switches to the default JSONL report adapter.
   * All future report writes will use JSONL storage.
   */
  public useJsonl() {
    lib.loggerService.log(REPORT_UTILS_METHOD_NAME_USE_JSONL);
    this.useReportAdapter(ReportBase);
  }
}

/**
 * Global singleton instance of ReportAdapter.
 * Provides JSONL event logging with pluggable storage backends.
 */
export const Report = new ReportAdapter();

export { ReportBase }

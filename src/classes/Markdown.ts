import { compose, getErrorMessage, makeExtendable, memoize, singleshot, timeout, TIMEOUT_SYMBOL } from "functools-kit";
import backtest from "../lib";
import { createWriteStream, WriteStream } from "fs";
import * as fs from "fs/promises";
import { join, dirname } from "path";
import { exitEmitter } from "../config/emitters";

const MARKDOWN_METHOD_NAME_ENABLE = "MarkdownUtils.enable";
const MARKDOWN_METHOD_NAME_DISABLE = "MarkdownUtils.disable";
const MARKDOWN_METHOD_NAME_USE_ADAPTER = "MarkdownAdapter.useMarkdownAdapter";

/**
 * Configuration interface for selective markdown service enablement.
 * Controls which markdown report services should be activated.
 */
interface IMarkdownTarget {
  /** Enable risk rejection tracking reports (signals blocked by risk limits) */
  risk: boolean;
  /** Enable breakeven event tracking reports (when stop loss moves to entry) */
  breakeven: boolean;
  /** Enable partial profit/loss event tracking reports */
  partial: boolean;
  /** Enable portfolio heatmap analysis reports across all symbols */
  heat: boolean;
  /** Enable walker strategy comparison and optimization reports */
  walker: boolean;
  /** Enable performance metrics and bottleneck analysis reports */
  performance: boolean;
  /** Enable scheduled signal tracking reports (signals waiting for trigger) */
  schedule: boolean;
  /** Enable live trading event reports (all tick events) */
  live: boolean;
  /** Enable backtest markdown reports (main strategy results with full trade history) */
  backtest: boolean;
}

const WAIT_FOR_INIT_SYMBOL = Symbol("wait-for-init");
const WRITE_SAFE_SYMBOL = Symbol("write-safe");

/**
 * Default configuration that enables all markdown services.
 * Used when no specific configuration is provided to `enable()`.
 */
const WILDCARD_TARGET: IMarkdownTarget = {
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
 * Union type of all valid markdown report names.
 * Used for type-safe identification of markdown services.
 */
export type MarkdownName = keyof IMarkdownTarget;

/**
 * Options for markdown dump operations.
 * Contains path information and metadata for filtering.
 */
export interface IMarkdownDumpOptions {
  /** Directory path relative to process.cwd() */
  path: string;
  /** File name including extension */
  file: string;
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
}

/**
 * Base interface for markdown storage adapters.
 * All markdown adapters must implement this interface.
 */
export type TMarkdownBase = {
  /**
   * Initialize markdown storage and prepare for writes.
   * Uses singleshot to ensure one-time execution.
   *
   * @param initial - Whether this is the first initialization
   * @returns Promise that resolves when initialization is complete
   */
  waitForInit(initial: boolean): Promise<void>;

  /**
   * Dump markdown content to storage.
   *
   * @param content - Markdown content to write
   * @param options - Metadata and path options for the dump
   * @returns Promise that resolves when write is complete
   * @throws Error if write fails or stream is not initialized
   */
  dump(content: string, options: IMarkdownDumpOptions): Promise<void>;
};

/**
 * Constructor type for markdown storage adapters.
 * Used for custom markdown storage implementations.
 */
export type TMarkdownBaseCtor = new (markdownName: MarkdownName) => TMarkdownBase;

/**
 * JSONL-based markdown adapter with append-only writes.
 *
 * Features:
 * - Writes markdown reports as JSONL entries to a single file per markdown type
 * - Stream-based writes with backpressure handling
 * - 15-second timeout protection for write operations
 * - Automatic directory creation
 * - Error handling via exitEmitter
 * - Search metadata for filtering (symbol, strategy, exchange, frame, signalId)
 *
 * File format: ./dump/markdown/{markdownName}.jsonl
 * Each line contains: markdownName, data, symbol, strategyName, exchangeName, frameName, signalId, timestamp
 *
 * Use this adapter for centralized logging and post-processing with JSONL tools.
 */
export const MarkdownFileBase = makeExtendable(
  class implements TMarkdownBase {
    /** Absolute path to the JSONL file for this markdown type */
    _filePath: string;

    /** WriteStream instance for append-only writes, null until initialized */
    _stream: WriteStream | null = null;

    /** Base directory for all JSONL markdown files */
    _baseDir = join(process.cwd(), "./dump/markdown");

    /**
     * Creates a new JSONL markdown adapter instance.
     *
     * @param markdownName - Type of markdown report (backtest, live, walker, etc.)
     */
    constructor(readonly markdownName: MarkdownName) {
      this._filePath = join(this._baseDir, `${markdownName}.jsonl`);
    }

    /**
     * Singleshot initialization function that creates directory and stream.
     * Protected by singleshot to ensure one-time execution.
     * Sets up error handler that emits to exitEmitter.
     */
    [WAIT_FOR_INIT_SYMBOL] = singleshot(async (): Promise<void> => {
      await fs.mkdir(this._baseDir, { recursive: true });
      this._stream = createWriteStream(this._filePath, { flags: "a" });
      this._stream.on('error', (err) => {
        exitEmitter.next(new Error(`MarkdownFileAdapter stream error for markdownName=${this.markdownName} message=${getErrorMessage(err)}`))
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
          this._stream!.once('drain', resolve);
        });
      }
    }, 15_000);

    /**
     * Initializes the JSONL file and write stream.
     * Safe to call multiple times - singleshot ensures one-time execution.
     *
     * @returns Promise that resolves when initialization is complete
     */
    async waitForInit(): Promise<void> {
      await this[WAIT_FOR_INIT_SYMBOL]();
    }

    /**
     * Writes markdown content to JSONL file with metadata.
     * Appends a single line with JSON object containing:
     * - markdownName: Type of report
     * - data: Markdown content
     * - Search flags: symbol, strategyName, exchangeName, frameName, signalId
     * - timestamp: Current timestamp in milliseconds
     *
     * @param data - Markdown content to write
     * @param options - Path and metadata options
     * @throws Error if stream not initialized or write timeout exceeded
     */
    async dump(data: string, options: IMarkdownDumpOptions): Promise<void> {
      backtest.loggerService.debug("MarkdownFileAdapter.dump", {
        markdownName: this.markdownName,
        options,
      });

      if (!this._stream) {
        throw new Error(
          `Stream not initialized for markdown ${this.markdownName}. Call waitForInit() first.`
        );
      }

      const searchFlags: Partial<IMarkdownDumpOptions> = {};

      {
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
      }

      const line = JSON.stringify({
        markdownName: this.markdownName,
        data,
        ...searchFlags,
        timestamp: Date.now(),
      }) + "\n";

      const status = await this[WRITE_SAFE_SYMBOL](line);
      if (status === TIMEOUT_SYMBOL) {
        throw new Error(`Timeout writing to markdown ${this.markdownName}`);
      }
    }
  }
);

/**
 * Folder-based markdown adapter with separate files per report.
 *
 * Features:
 * - Writes each markdown report as a separate .md file
 * - File path based on options.path and options.file
 * - Automatic directory creation
 * - No stream management (direct writeFile)
 * - Suitable for human-readable report directories
 *
 * File format: {options.path}/{options.file}
 * Example: ./dump/backtest/BTCUSDT_my-strategy_binance_2024-Q1_backtest-1736601234567.md
 *
 * Use this adapter (default) for organized report directories and manual review.
 */
export const MarkdownFolderBase = makeExtendable(
  class implements TMarkdownBase {

    /**
     * Creates a new folder-based markdown adapter instance.
     *
     * @param markdownName - Type of markdown report (backtest, live, walker, etc.)
     */
    constructor(readonly markdownName: MarkdownName) {}

    /**
     * No-op initialization for folder adapter.
     * This adapter doesn't need initialization since it uses direct writeFile.
     *
     * @returns Promise that resolves immediately
     */
    async waitForInit(): Promise<void> {
      void 0;
    }

    /**
     * Writes markdown content to a separate file.
     * Creates directory structure automatically.
     * File path is determined by options.path and options.file.
     *
     * @param content - Markdown content to write
     * @param options - Path and file options for the dump
     * @throws Error if directory creation or file write fails
     */
    async dump(content: string, options: IMarkdownDumpOptions): Promise<void> {
      backtest.loggerService.debug("MarkdownFolderAdapter.dump", {
        markdownName: this.markdownName,
        options,
      });

      // Combine into full file path
      const filePath = join(process.cwd(), options.path, options.file);

      // Extract directory from file path
      const dir = dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filePath, content, "utf8");
    }
  }
);

/**
 * Dummy markdown adapter that discards all writes.
 * Used for disabling markdown report generation.
 */
export class MarkdownDummy implements TMarkdownBase {
  /**
   * No-op dump function.
   * @returns Promise that resolves immediately
   */
  async dump() {
    void 0;
  }
  /**
   * No-op initialization function.
   * @returns Promise that resolves immediately
   */
  async waitForInit() {
    void 0;
  }
}

/**
 * Utility class for managing markdown report services.
 *
 * Provides methods to enable/disable markdown report generation across
 * different service types (backtest, live, walker, performance, etc.).
 *
 * Typically extended by MarkdownAdapter for additional functionality.
 */
export class MarkdownUtils {
  /**
   * Enables markdown report services selectively.
   *
   * Subscribes to specified markdown services and returns a cleanup function
   * that unsubscribes from all enabled services at once.
   *
   * Each enabled service will:
   * - Start listening to relevant events
   * - Accumulate data for reports
   * - Generate markdown files when requested
   *
   * IMPORTANT: Always call the returned unsubscribe function to prevent memory leaks.
   *
   * @param config - Service configuration object. Defaults to enabling all services.
   * @param config.backtest - Enable backtest result reports with full trade history
   * @param config.breakeven - Enable breakeven event tracking (when stop loss moves to entry)
   * @param config.partial - Enable partial profit/loss event tracking
   * @param config.heat - Enable portfolio heatmap analysis across all symbols
   * @param config.walker - Enable walker strategy comparison and optimization reports
   * @param config.performance - Enable performance bottleneck analysis
   * @param config.risk - Enable risk rejection tracking (signals blocked by risk limits)
   * @param config.schedule - Enable scheduled signal tracking (signals waiting for trigger)
   * @param config.live - Enable live trading event reports (all tick events)
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
  }: Partial<IMarkdownTarget> = WILDCARD_TARGET) => {
    backtest.loggerService.debug(MARKDOWN_METHOD_NAME_ENABLE, {
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
      unList.push(backtest.backtestMarkdownService.subscribe());
    }
    if (breakeven) {
      unList.push(backtest.breakevenMarkdownService.subscribe());
    }
    if (heat) {
      unList.push(backtest.heatMarkdownService.subscribe());
    }
    if (live) {
      unList.push(backtest.liveMarkdownService.subscribe());
    }
    if (partial) {
      unList.push(backtest.partialMarkdownService.subscribe());
    }
    if (performance) {
      unList.push(backtest.performanceMarkdownService.subscribe());
    }
    if (risk) {
      unList.push(backtest.riskMarkdownService.subscribe());
    }
    if (schedule) {
      unList.push(backtest.scheduleMarkdownService.subscribe());
    }
    if (walker) {
      unList.push(backtest.walkerMarkdownService.subscribe());
    }
    return compose(...unList.map((un) => () => void un()));
  };

  /**
   * Disables markdown report services selectively.
   *
   * Unsubscribes from specified markdown services to stop report generation.
   * Use this method to stop markdown report generation for specific services while keeping others active.
   *
   * Each disabled service will:
   * - Stop listening to events immediately
   * - Stop accumulating data for reports
   * - Stop generating markdown files
   * - Free up event listener and memory resources
   *
   * Unlike enable(), this method does NOT return an unsubscribe function.
   * Services are unsubscribed immediately upon calling this method.
   *
   * @param config - Service configuration object specifying which services to disable. Defaults to disabling all services.
   * @param config.backtest - Disable backtest result reports with full trade history
   * @param config.breakeven - Disable breakeven event tracking
   * @param config.partial - Disable partial profit/loss event tracking
   * @param config.heat - Disable portfolio heatmap analysis
   * @param config.walker - Disable walker strategy comparison reports
   * @param config.performance - Disable performance bottleneck analysis
   * @param config.risk - Disable risk rejection tracking
   * @param config.schedule - Disable scheduled signal tracking
   * @param config.live - Disable live trading event reports
   *
   * @example
   * ```typescript
   * import { Markdown } from "backtest-kit";
   *
   * // Disable specific services
   * Markdown.disable({ backtest: true, walker: true });
   *
   * // Disable all services
   * Markdown.disable();
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
  }: Partial<IMarkdownTarget> = WILDCARD_TARGET) => {
    backtest.loggerService.debug(MARKDOWN_METHOD_NAME_DISABLE, {
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
      backtest.backtestMarkdownService.unsubscribe();
    }
    if (breakeven) {
      backtest.breakevenMarkdownService.unsubscribe();
    }
    if (heat) {
      backtest.heatMarkdownService.unsubscribe();
    }
    if (live) {
      backtest.liveMarkdownService.unsubscribe();
    }
    if (partial) {
      backtest.partialMarkdownService.unsubscribe();
    }
    if (performance) {
      backtest.performanceMarkdownService.unsubscribe();
    }
    if (risk) {
      backtest.riskMarkdownService.unsubscribe();
    }
    if (schedule) {
      backtest.scheduleMarkdownService.unsubscribe();
    }
    if (walker) {
      backtest.walkerMarkdownService.unsubscribe();
    }
  };
}

/**
 * Markdown adapter with pluggable storage backend and instance memoization.
 *
 * Features:
 * - Adapter pattern for swappable storage implementations
 * - Memoized storage instances (one per markdown type)
 * - Default adapter: MarkdownFolderBase (separate files)
 * - Alternative adapter: MarkdownFileBase (JSONL append)
 * - Lazy initialization on first write
 * - Convenience methods: useMd(), useJsonl()
 */
export class MarkdownAdapter extends MarkdownUtils {
  /**
   * Current markdown storage adapter constructor.
   * Defaults to MarkdownFolderBase for separate file storage.
   * Can be changed via useMarkdownAdapter().
   */
  private MarkdownFactory: TMarkdownBaseCtor = MarkdownFolderBase;

  /**
   * Memoized storage instances cache.
   * Key: markdownName (backtest, live, walker, etc.)
   * Value: TMarkdownBase instance created with current MarkdownFactory.
   * Ensures single instance per markdown type for the lifetime of the application.
   */
  private getMarkdownStorage = memoize(
    ([markdownName]: [MarkdownName]): string => markdownName,
    (markdownName: MarkdownName): TMarkdownBase =>
      Reflect.construct(this.MarkdownFactory, [markdownName])
  );

  /**
   * Sets the markdown storage adapter constructor.
   * All future markdown instances will use this adapter.
   *
   * @param Ctor - Constructor for markdown storage adapter
   */
  public useMarkdownAdapter(Ctor: TMarkdownBaseCtor): void {
    backtest.loggerService.info(MARKDOWN_METHOD_NAME_USE_ADAPTER);
    this.MarkdownFactory = Ctor;
  }

  /**
   * Writes markdown data to storage using the configured adapter.
   * Automatically initializes storage on first write for each markdown type.
   *
   * @param markdownName - Type of markdown report (backtest, live, walker, etc.)
   * @param content - Markdown content to write
   * @param options - Path, file, and metadata options
   * @returns Promise that resolves when write is complete
   * @throws Error if write fails or storage initialization fails
   *
   * @internal - Use service-specific dump methods instead (e.g., Backtest.dump)
   */
  public async writeData(
    markdownName: MarkdownName,
    content: string,
    options: IMarkdownDumpOptions
  ): Promise<void> {
    backtest.loggerService.debug("MarkdownAdapter.writeData", {
      markdownName,
      options,
    });

    const isInitial = !this.getMarkdownStorage.has(markdownName);
    const markdown = this.getMarkdownStorage(markdownName);
    await markdown.waitForInit(isInitial);

    await markdown.dump(content, options);
  }

  /**
   * Switches to folder-based markdown storage (default).
   * Shorthand for useMarkdownAdapter(MarkdownFolderBase).
   * Each dump creates a separate .md file.
   */
  public useMd() {
    backtest.loggerService.debug("MarkdownAdapter.useMd");
    this.useMarkdownAdapter(MarkdownFolderBase);
  }

  /**
   * Switches to JSONL-based markdown storage.
   * Shorthand for useMarkdownAdapter(MarkdownFileBase).
   * All dumps append to a single .jsonl file per markdown type.
   */
  public useJsonl() {
    backtest.loggerService.debug("MarkdownAdapter.useJsonl");
    this.useMarkdownAdapter(MarkdownFileBase);
  }

  /**
   * Switches to a dummy markdown adapter that discards all writes.
   * All future markdown writes will be no-ops.
   */
  public useDummy() {
    backtest.loggerService.debug("MarkdownAdapter.useDummy");;
    this.useMarkdownAdapter(MarkdownDummy);
  }
}

/**
 * Global singleton instance of MarkdownAdapter.
 * Provides markdown report generation with pluggable storage backends.
 */
export const Markdown = new MarkdownAdapter();

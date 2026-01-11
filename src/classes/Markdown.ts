import { compose, makeExtendable, memoize, singleshot } from "functools-kit";
import backtest from "src/lib";
import { createWriteStream, WriteStream } from "fs";
import * as fs from "fs/promises";
import { join, dirname } from "path";

const MARKDOWN_METHOD_NAME_ENABLE = "MarkdownUtils.enable";
const MARKDOWN_METHOD_NAME_USE_ADAPTER = "MarkdownAdapter.useMarkdownAdapter";

/**
 * Configuration interface for selective markdown service enablement.
 *
 * Controls which markdown report services should be activated.
 * Each property corresponds to a specific markdown service type.
 *
 * @property backtest - Enable backtest markdown reports (main strategy results)
 * @property breakeven - Enable breakeven event tracking reports
 * @property partial - Enable partial profit/loss event reports
 * @property heat - Enable heatmap portfolio analysis reports
 * @property walker - Enable walker optimization comparison reports
 * @property performance - Enable performance metrics and bottleneck analysis
 * @property risk - Enable risk rejection tracking reports
 * @property schedule - Enable scheduled signal tracking reports
 * @property live - Enable live trading event reports
 */
interface IMarkdownTarget {
  risk: boolean;
  breakeven: boolean;
  partial: boolean;
  heat: boolean;
  walker: boolean;
  performance: boolean;
  schedule: boolean;
  live: boolean;
  backtest: boolean;
  outline: boolean;
}

const WAIT_FOR_INIT_SYMBOL = Symbol("wait-for-init");

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
  outline: true,
};

export type MarkdownName = keyof IMarkdownTarget;

export interface IMarkdownDumpOptions {
  path: string;
  file: string;
  symbol: string;
  strategyName: string;
  exchangeName: string;
  frameName: string;
}

export type TMarkdownBase = {
  waitForInit(initial: boolean): Promise<void>;
  dump(content: string, options: IMarkdownDumpOptions): Promise<void>;
};

export type TMarkdownBaseCtor = new (markdownName: MarkdownName) => TMarkdownBase;

export const MarkdownFileBase = makeExtendable(
  class implements TMarkdownBase {
    _filePath: string;
    _stream: WriteStream | null = null;
    _baseDir = join(process.cwd(), "./dump/markdown");

    constructor(readonly markdownName: MarkdownName) {
      this._filePath = join(this._baseDir, `${markdownName}.jsonl`);
    }

    [WAIT_FOR_INIT_SYMBOL] = singleshot(async (): Promise<void> => {
      await fs.mkdir(this._baseDir, { recursive: true });
      this._stream = createWriteStream(this._filePath, { flags: "a" });
    });

    async waitForInit(): Promise<void> {
      await this[WAIT_FOR_INIT_SYMBOL]();
    }

    async dump(content: string, options: IMarkdownDumpOptions): Promise<void> {
      backtest.loggerService.debug("MarkdownFileAdapter.dump", {
        markdownName: this.markdownName,
        options,
      });

      if (!this._stream) {
        throw new Error(
          `Stream not initialized for markdown ${this.markdownName}. Call waitForInit() first.`
        );
      }

      const line = JSON.stringify({
        markdownName: this.markdownName,
        content,
        options,
        timestamp: Date.now(),
      }) + "\n";

      this._stream.write(line);
    }
  }
);

export const MarkdownFolderBase = makeExtendable(
  class implements TMarkdownBase {
    _baseDir: string;
    _filePath: string;

    constructor(readonly markdownName: MarkdownName) {
      this._baseDir = join(process.cwd(), `./dump/${markdownName}`);
      this._filePath = join(this._baseDir, `${markdownName}.md`);
    }

    [WAIT_FOR_INIT_SYMBOL] = singleshot(async (): Promise<void> => {
      await fs.mkdir(this._baseDir, { recursive: true });
    });

    async waitForInit(): Promise<void> {
      await this[WAIT_FOR_INIT_SYMBOL]();
    }

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
   *
   * @example
   * ```typescript
   * // Enable all services (default behavior)
   * const unsubscribe = Markdown.enable();
   *
   * // Run backtest
   * await bt.backtest(...);
   *
   * // Generate reports
   * await bt.Backtest.dump("BTCUSDT", "my-strategy");
   * await bt.Performance.dump("BTCUSDT", "my-strategy");
   *
   * // Cleanup
   * unsubscribe();
   * ```
   *
   * @example
   * ```typescript
   * // Enable only essential services
   * const unsubscribe = Markdown.enable({
   *   backtest: true,    // Main results
   *   performance: true, // Bottlenecks
   *   risk: true        // Rejections
   * });
   *
   * // Other services (breakeven, partial, heat, etc.) won't collect data
   * ```
   *
   * @example
   * ```typescript
   * // Safe cleanup pattern
   * let unsubscribe: Function;
   *
   * try {
   *   unsubscribe = Markdown.enable({
   *     backtest: true,
   *     heat: true
   *   });
   *
   *   await bt.backtest(...);
   *   await bt.Backtest.dump("BTCUSDT", "my-strategy");
   * } finally {
   *   unsubscribe?.();
   * }
   * ```
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
  }: Partial<Omit<IMarkdownTarget, "outline">> = WILDCARD_TARGET) => {
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
}

export class MarkdownAdapter extends MarkdownUtils {
  private MarkdownFactory: TMarkdownBaseCtor = MarkdownFolderBase;

  private getMarkdownStorage = memoize(
    ([markdownName]: [MarkdownName]): string => markdownName,
    (markdownName: MarkdownName): TMarkdownBase =>
      Reflect.construct(this.MarkdownFactory, [markdownName])
  );

  public useMarkdownAdapter(Ctor: TMarkdownBaseCtor): void {
    backtest.loggerService.info(MARKDOWN_METHOD_NAME_USE_ADAPTER);
    this.MarkdownFactory = Ctor;
  }

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
}

export const Markdown = new MarkdownAdapter();

import {
  compose,
} from "functools-kit";
import LoggerService from "../lib/services/base/LoggerService";
import { IMarkdownTarget, MarkdownWriter, TMarkdownBaseCtor } from "./Writer";
import backtest from "../lib";

const MARKDOWN_METHOD_NAME_ENABLE = "MarkdownUtils.enable";
const MARKDOWN_METHOD_NAME_DISABLE = "MarkdownUtils.disable";
const MARKDOWN_METHOD_NAME_USE_ADAPTER = "MarkdownAdapter.useMarkdownAdapter";
const MARKDOWN_METHOD_NAME_USE_MD = "MarkdownAdapter.useMd";
const MARKDOWN_METHOD_NAME_USE_JSONL = "MarkdownAdapter.useJsonl";
const MARKDOWN_METHOD_NAME_USE_DUMMY = "MarkdownAdapter.useDummy";
const MARKDOWN_METHOD_NAME_CLEAR = "MarkdownAdapter.clear";

/** Logger service injected as DI singleton */
const LOGGER_SERVICE = new LoggerService();

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
  strategy: true,
  schedule: true,
  walker: true,
  sync: true,
  highest_profit: true,
  max_drawdown: true,
};

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
    strategy = false,
    risk = false,
    schedule = false,
    walker = false,
    sync = false,
    highest_profit = false,
    max_drawdown = false,
  }: Partial<IMarkdownTarget> = WILDCARD_TARGET) => {
    LOGGER_SERVICE.debug(MARKDOWN_METHOD_NAME_ENABLE, {
      backtest: bt,
      breakeven,
      heat,
      live,
      partial,
      performance,
      risk,
      strategy,
      schedule,
      walker,
      sync,
      highest_profit,
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
    if (strategy) {
      unList.push(backtest.strategyMarkdownService.subscribe());
    }
    if (schedule) {
      unList.push(backtest.scheduleMarkdownService.subscribe());
    }
    if (walker) {
      unList.push(backtest.walkerMarkdownService.subscribe());
    }
    if (sync) {
      unList.push(backtest.syncMarkdownService.subscribe());
    }
    if (highest_profit) {
      unList.push(backtest.highestProfitMarkdownService.subscribe());
    }
    if (max_drawdown) {
      unList.push(backtest.maxDrawdownMarkdownService.subscribe());
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
    strategy = false,
    schedule = false,
    walker = false,
    sync = false,
    highest_profit = false,
    max_drawdown = false,
  }: Partial<IMarkdownTarget> = WILDCARD_TARGET) => {
    LOGGER_SERVICE.debug(MARKDOWN_METHOD_NAME_DISABLE, {
      backtest: bt,
      breakeven,
      heat,
      live,
      partial,
      performance,
      risk,
      strategy,
      schedule,
      walker,
      sync,
      highest_profit,
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
    if (strategy) {
      backtest.strategyMarkdownService.unsubscribe();
    }
    if (schedule) {
      backtest.scheduleMarkdownService.unsubscribe();
    }
    if (walker) {
      backtest.walkerMarkdownService.unsubscribe();
    }
    if (sync) {
      backtest.syncMarkdownService.unsubscribe();
    }
    if (highest_profit) {
      backtest.highestProfitMarkdownService.unsubscribe();
    }
    if (max_drawdown) {
      backtest.maxDrawdownMarkdownService.unsubscribe();
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
   * Sets the markdown storage adapter constructor.
   * All future markdown instances will use this adapter.
   *
   * @param Ctor - Constructor for markdown storage adapter
   */
  public useMarkdownAdapter(Ctor: TMarkdownBaseCtor): void {
    LOGGER_SERVICE.info(MARKDOWN_METHOD_NAME_USE_ADAPTER);
    return MarkdownWriter.useMarkdownAdapter(Ctor);
  }

  /**
   * Switches to folder-based markdown storage (default).
   * Shorthand for useMarkdownAdapter(MarkdownFolderBase).
   * Each dump creates a separate .md file.
   */
  public useMd() {
    LOGGER_SERVICE.debug(MARKDOWN_METHOD_NAME_USE_MD);
    MarkdownWriter.useMd();
  }

  /**
   * Switches to JSONL-based markdown storage.
   * Shorthand for useMarkdownAdapter(MarkdownFileBase).
   * All dumps append to a single .jsonl file per markdown type.
   */
  public useJsonl() {
    LOGGER_SERVICE.debug(MARKDOWN_METHOD_NAME_USE_JSONL);
    MarkdownWriter.useJsonl();
  }

  /**
   * Clears the memoized storage cache.
   * Call this when process.cwd() changes between strategy iterations
   * so new storage instances are created with the updated base path.
   */
  public clear(): void {
    LOGGER_SERVICE.log(MARKDOWN_METHOD_NAME_CLEAR);
    MarkdownWriter.clear();
  }

  /**
   * Switches to a dummy markdown adapter that discards all writes.
   * All future markdown writes will be no-ops.
   */
  public useDummy() {
    LOGGER_SERVICE.debug(MARKDOWN_METHOD_NAME_USE_DUMMY);
    MarkdownWriter.useDummy();
  }
}

/**
 * Global singleton instance of MarkdownAdapter.
 * Provides markdown report generation with pluggable storage backends.
 */
export const Markdown = new MarkdownAdapter();


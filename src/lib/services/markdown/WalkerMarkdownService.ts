import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import {
  WalkerName,
  WalkerMetric,
} from "../../../interfaces/Walker.interface";
import { WalkerCompleteContract } from "../../../contract/WalkerComplete.contract";
import { StrategyName } from "../../../interfaces/Strategy.interface";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { memoize, singleshot } from "functools-kit";
import { walkerEmitter } from "../../../config/emitters";
import { WalkerContract } from "../../../contract/Walker.contract";
import {
  WalkerStatisticsModel,
  IStrategyResult,
  SignalData,
} from "../../../model/WalkerStatistics.model";
import { BacktestStatisticsModel } from "../../../model/BacktestStatistics.model";
import { ColumnModel } from "../../../model/Column.model";
import { COLUMN_CONFIG } from "../../../config/columns";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";

/**
 * Type alias for column configuration used in walker strategy markdown reports.
 * 
 * Represents a column model specifically designed to format and display
 * walker backtest strategy results in markdown tables.
 * 
 * @typeParam IStrategyResult - The walker strategy result data type containing
 *   strategy name, performance metrics, and aggregated trade statistics
 * 
 * @example
 * ```typescript
 * // Column to display strategy name
 * const strategyColumn: StrategyColumn = {
 *   key: "strategyName",
 *   label: "Strategy",
 *   format: (result) => result.strategyName,
 *   isVisible: () => true
 * };
 * 
 * // Column to display total trades
 * const tradesColumn: StrategyColumn = {
 *   key: "totalTrades",
 *   label: "Total Trades",
 *   format: (result) => result.totalTrades.toString(),
 *   isVisible: () => true
 * };
 * ```
 * 
 * @see ColumnModel for the base interface
 * @see IStrategyResult for the strategy result data structure
 */
export type StrategyColumn = ColumnModel<IStrategyResult>;

/**
 * Type alias for column configuration used in walker PNL markdown reports.
 * 
 * Represents a column model specifically designed to format and display
 * walker backtest signal PNL data in markdown tables.
 * 
 * @typeParam SignalData - The signal PNL data type containing
 *   signal information and PNL details from individual trades
 * 
 * @example
 * ```typescript
 * // Column to display signal ID
 * const signalIdColumn: PnlColumn = {
 *   key: "signalId",
 *   label: "Signal ID",
 *   format: (signal) => signal.signalId,
 *   isVisible: () => true
 * };
 * 
 * // Column to display PNL percentage
 * const pnlColumn: PnlColumn = {
 *   key: "pnl",
 *   label: "PNL %",
 *   format: (signal) => signal.pnl.toFixed(2) + '%',
 *   isVisible: () => true
 * };
 * ```
 * 
 * @see ColumnModel for the base interface
 * @see SignalData for the signal data structure
 */
export type PnlColumn = ColumnModel<SignalData>;

/**
 * Checks if a value is unsafe for display (not a number, NaN, or Infinity).
 */
function isUnsafe(value: number | null): boolean {
  if (value === null) {
    return true;
  }
  if (typeof value !== "number") {
    return true;
  }
  if (isNaN(value)) {
    return true;
  }
  if (!isFinite(value)) {
    return true;
  }
  return false;
}

/**
 * Formats a metric value for display.
 * Returns "N/A" for unsafe values, otherwise formats with 2 decimal places.
 */
function formatMetric(value: number | null): string {
  if (isUnsafe(value)) {
    return "N/A";
  }
  return value!.toFixed(2);
}

/**
 * Storage class for accumulating walker results.
 * Maintains a list of all strategy results and provides methods to generate reports.
 */
class ReportStorage {

  /** Walker metadata (set from first addResult call) */
  private _totalStrategies: number | null = null;
  private _bestStats: BacktestStatisticsModel | null = null;
  private _bestMetric: number | null = null;
  private _bestStrategy: StrategyName | null = null;

  /** All strategy results for comparison table */
  private _strategyResults: IStrategyResult[] = [];

  constructor(readonly walkerName: WalkerName) {
  }

  /**
   * Adds a strategy result to the storage.
   * Updates best strategy tracking and accumulates result for comparison table.
   *
   * @param data - Walker contract with strategy result
   */
  public addResult(data: WalkerContract) {
    this._totalStrategies = data.totalStrategies;
    this._bestMetric = data.bestMetric;
    this._bestStrategy = data.bestStrategy;

    if (data.strategyName === data.bestStrategy) {
      this._bestStats = data.stats;
    }

    this._strategyResults.unshift({
      strategyName: data.strategyName,
      stats: data.stats,
      metricValue: isUnsafe(data.metricValue) ? null : data.metricValue,
    });
  }

  /**
   * Calculates walker results from strategy results.
   * Returns null for any unsafe numeric values (NaN, Infinity, etc).
   *
   * @param symbol - Trading symbol
   * @param metric - Metric being optimized
   * @param context - Context with exchangeName and frameName
   * @returns Walker results data
   */
  public async getData(
    symbol: string,
    metric: WalkerMetric,
    context: {
      exchangeName: ExchangeName;
      frameName: FrameName;
    }
  ): Promise<WalkerStatisticsModel> {
    if (this._totalStrategies === null) {
      throw new Error("No walker data available - no results added yet");
    }
    return {
      walkerName: this.walkerName,
      symbol,
      exchangeName: context.exchangeName,
      frameName: context.frameName,
      metric,
      totalStrategies: this._totalStrategies,
      bestStrategy: this._bestStrategy,
      bestMetric: this._bestMetric,
      bestStats: this._bestStats,
      strategyResults: this._strategyResults,
    };
  }

  /**
   * Generates comparison table for top N strategies (View).
   * Sorts strategies by metric value and formats as markdown table.
   *
   * @param topN - Number of top strategies to include (default: 10)
   * @param columns - Column configuration for formatting the strategy comparison table
   * @returns Markdown formatted comparison table
   */
  private async getComparisonTable(
    topN: number = 10,
    columns: StrategyColumn[] = COLUMN_CONFIG.walker_strategy_columns
  ): Promise<string> {
    if (this._strategyResults.length === 0) {
      return "No strategy results available.";
    }

    // Sort strategies by metric value (descending)
    const sortedResults = [...this._strategyResults].sort((a, b) => {
      const aValue = a.metricValue ?? -Infinity;
      const bValue = b.metricValue ?? -Infinity;
      return bValue - aValue;
    });

    // Take top N strategies
    const topStrategies = sortedResults.slice(0, topN);

    // Get columns configuration
    const visibleColumns = [];
    for (const col of columns) {
      if (await col.isVisible()) {
        visibleColumns.push(col);
      }
    }

    // Build table header
    const header = visibleColumns.map((col) => col.label);
    const separator = visibleColumns.map(() => "---");

    // Build table rows
    const rows = await Promise.all(
      topStrategies.map(async (result, index) =>
        Promise.all(visibleColumns.map((col) => col.format(result, index)))
      )
    );

    const tableData = [header, separator, ...rows];
    return tableData.map((row) => `| ${row.join(" | ")} |`).join("\n");
  }

  /**
   * Generates PNL table showing all closed signals across all strategies (View).
   * Collects all signals from all strategies and formats as markdown table.
   *
   * @param columns - Column configuration for formatting the PNL table
   * @returns Markdown formatted PNL table
   */
  private async getPnlTable(
    columns: PnlColumn[] = COLUMN_CONFIG.walker_pnl_columns
  ): Promise<string> {
    if (this._strategyResults.length === 0) {
      return "No strategy results available.";
    }

    // Collect all closed signals from all strategies
    const allSignals: SignalData[] = [];

    for (const result of this._strategyResults) {
      for (const signal of result.stats.signalList) {
        allSignals.push({
          strategyName: result.strategyName,
          signalId: signal.signal.id,
          symbol: signal.signal.symbol,
          position: signal.signal.position,
          pnl: signal.pnl.pnlPercentage,
          closeReason: signal.closeReason,
          openTime: signal.signal.pendingAt,
          closeTime: signal.closeTimestamp,
        });
      }
    }

    if (allSignals.length === 0) {
      return "No closed signals available.";
    }

    // Build table header
    const visibleColumns = [];
    for (const col of columns) {
      if (await col.isVisible()) {
        visibleColumns.push(col);
      }
    }
    const header = visibleColumns.map((col) => col.label);
    const separator = visibleColumns.map(() => "---");

    // Build table rows
    const rows = await Promise.all(
      allSignals.map(async (signal, index) =>
        Promise.all(visibleColumns.map((col) => col.format(signal, index)))
      )
    );

    const tableData = [header, separator, ...rows];
    return tableData.map((row) => `| ${row.join(" | ")} |`).join("\n");
  }

  /**
   * Generates markdown report with all strategy results (View).
   * Includes best strategy summary, comparison table, and PNL table.
   *
   * @param symbol - Trading symbol
   * @param metric - Metric being optimized
   * @param context - Context with exchangeName and frameName
   * @param strategyColumns - Column configuration for strategy comparison table
   * @param pnlColumns - Column configuration for PNL table
   * @returns Markdown formatted report with all results
   */
  public async getReport(
    symbol: string,
    metric: WalkerMetric,
    context: {
      exchangeName: ExchangeName;
      frameName: FrameName;
    },
    strategyColumns: StrategyColumn[] = COLUMN_CONFIG.walker_strategy_columns,
    pnlColumns: PnlColumn[] = COLUMN_CONFIG.walker_pnl_columns
  ): Promise<string> {
    const results = await this.getData(symbol, metric, context);

    // Get total signals for best strategy
    const bestStrategySignals = results.bestStats?.totalSignals ?? 0;

    return [
      `# Walker Comparison Report: ${results.walkerName}`,
      "",
      `**Symbol:** ${results.symbol}`,
      `**Exchange:** ${results.exchangeName}`,
      `**Frame:** ${results.frameName}`,
      `**Optimization Metric:** ${results.metric}`,
      `**Strategies Tested:** ${results.totalStrategies}`,
      "",
      `## Best Strategy: ${results.bestStrategy}`,
      "",
      `**Best ${results.metric}:** ${formatMetric(results.bestMetric)}`,
      `**Total Signals:** ${bestStrategySignals}`,
      "",
      "## Top Strategies Comparison",
      "",
      await this.getComparisonTable(10, strategyColumns),
      "",
      "## All Signals (PNL Table)",
      "",
      await this.getPnlTable(pnlColumns),
      "",
      "**Note:** Higher values are better for all metrics except Standard Deviation (lower is better)."
    ].join("\n");
  }

  /**
   * Saves walker report to disk.
   *
   * @param symbol - Trading symbol
   * @param metric - Metric being optimized
   * @param context - Context with exchangeName and frameName
   * @param path - Directory path to save report (default: "./dump/walker")
   * @param strategyColumns - Column configuration for strategy comparison table
   * @param pnlColumns - Column configuration for PNL table
   */
  public async dump(
    symbol: string,
    metric: WalkerMetric,
    context: {
      exchangeName: ExchangeName;
      frameName: FrameName;
    },
    path = "./dump/walker",
    strategyColumns: StrategyColumn[] = COLUMN_CONFIG.walker_strategy_columns,
    pnlColumns: PnlColumn[] = COLUMN_CONFIG.walker_pnl_columns
  ): Promise<void> {
    const markdown = await this.getReport(symbol, metric, context, strategyColumns, pnlColumns);

    try {
      const dir = join(process.cwd(), path);
      await mkdir(dir, { recursive: true });

      const filename = `${this.walkerName}.md`;
      const filepath = join(dir, filename);

      await writeFile(filepath, markdown, "utf-8");
      console.log(`Walker report saved: ${filepath}`);
    } catch (error) {
      console.error(`Failed to save walker report:`, error);
    }
  }
}

/**
 * Service for generating and saving walker markdown reports.
 *
 * Features:
 * - Listens to walker events via tick callback
 * - Accumulates strategy results per walker using memoized storage
 * - Generates markdown tables with detailed strategy comparison
 * - Saves reports to disk in logs/walker/{walkerName}.md
 *
 * @example
 * ```typescript
 * const service = new WalkerMarkdownService();
 * const results = await service.getData("my-walker");
 * await service.dump("my-walker");
 * ```
 */
export class WalkerMarkdownService {
  /** Logger service for debug output */
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * Memoized function to get or create ReportStorage for a walker.
   * Each walker gets its own isolated storage instance.
   */
  private getStorage = memoize<(walkerName: WalkerName) => ReportStorage>(
    ([walkerName]) => `${walkerName}`,
    (walkerName) => new ReportStorage(walkerName)
  );

  /**
   * Subscribes to walker emitter to receive walker progress events.
   * Protected against multiple subscriptions.
   * Returns an unsubscribe function to stop receiving events.
   *
   * @example
   * ```typescript
   * const service = new WalkerMarkdownService();
   * const unsubscribe = service.subscribe();
   * // ... later
   * unsubscribe();
   * ```
   */
  public subscribe = singleshot(() => {
    this.loggerService.log("walkerMarkdownService init");
    const unsubscribe = walkerEmitter.subscribe(this.tick);
    return () => {
      this.subscribe.clear();
      this.clear();
      unsubscribe();
    }
  });

  /**
   * Unsubscribes from walker emitter to stop receiving events.
   * Calls the unsubscribe function returned by subscribe().
   * If not subscribed, does nothing.
   *
   * @example
   * ```typescript
   * const service = new WalkerMarkdownService();
   * service.subscribe();
   * // ... later
   * service.unsubscribe();
   * ```
   */
  public unsubscribe = async () => {
    this.loggerService.log("walkerMarkdownService unsubscribe");
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };

  /**
   * Processes walker progress events and accumulates strategy results.
   * Should be called from walkerEmitter.
   *
   * @param data - Walker contract from walker execution
   *
   * @example
   * ```typescript
   * const service = new WalkerMarkdownService();
   * walkerEmitter.subscribe((data) => service.tick(data));
   * ```
   */
  private tick = async (data: WalkerContract) => {
    this.loggerService.log("walkerMarkdownService tick", {
      data,
    });

    const storage = this.getStorage(data.walkerName);
    storage.addResult(data);
  };

  /**
   * Gets walker results data from all strategy results.
   * Delegates to ReportStorage.getData().
   *
   * @param walkerName - Walker name to get data for
   * @param symbol - Trading symbol
   * @param metric - Metric being optimized
   * @param context - Context with exchangeName and frameName
   * @returns Walker results data object with all metrics
   *
   * @example
   * ```typescript
   * const service = new WalkerMarkdownService();
   * const results = await service.getData("my-walker", "BTCUSDT", "sharpeRatio", { exchangeName: "binance", frameName: "1d" });
   * console.log(results.bestStrategy, results.bestMetric);
   * ```
   */
  public getData = async (
    walkerName: WalkerName,
    symbol: string,
    metric: WalkerMetric,
    context: {
      exchangeName: ExchangeName;
      frameName: FrameName;
    }
  ): Promise<WalkerCompleteContract> => {
    this.loggerService.log("walkerMarkdownService getData", {
      walkerName,
      symbol,
      metric,
      context,
    });
    if (!this.subscribe.hasValue()) {
      throw new Error("WalkerMarkdownService not initialized. Call subscribe() before getting data.");
    }
    const storage = this.getStorage(walkerName);
    return storage.getData(symbol, metric, context);
  };

  /**
   * Generates markdown report with all strategy results for a walker.
   * Delegates to ReportStorage.getReport().
   *
   * @param walkerName - Walker name to generate report for
   * @param symbol - Trading symbol
   * @param metric - Metric being optimized
   * @param context - Context with exchangeName and frameName
   * @param strategyColumns - Column configuration for strategy comparison table
   * @param pnlColumns - Column configuration for PNL table
   * @returns Markdown formatted report string
   *
   * @example
   * ```typescript
   * const service = new WalkerMarkdownService();
   * const markdown = await service.getReport("my-walker", "BTCUSDT", "sharpeRatio", { exchangeName: "binance", frameName: "1d" });
   * console.log(markdown);
   * ```
   */
  public getReport = async (
    walkerName: WalkerName,
    symbol: string,
    metric: WalkerMetric,
    context: {
      exchangeName: ExchangeName;
      frameName: FrameName;
    },
    strategyColumns: StrategyColumn[] = COLUMN_CONFIG.walker_strategy_columns,
    pnlColumns: PnlColumn[] = COLUMN_CONFIG.walker_pnl_columns
  ): Promise<string> => {
    this.loggerService.log("walkerMarkdownService getReport", {
      walkerName,
      symbol,
      metric,
      context,
    });
    if (!this.subscribe.hasValue()) {
      throw new Error("WalkerMarkdownService not initialized. Call subscribe() before generating reports.");
    }
    const storage = this.getStorage(walkerName);
    return storage.getReport(symbol, metric, context, strategyColumns, pnlColumns);
  };

  /**
   * Saves walker report to disk.
   * Creates directory if it doesn't exist.
   * Delegates to ReportStorage.dump().
   *
   * @param walkerName - Walker name to save report for
   * @param symbol - Trading symbol
   * @param metric - Metric being optimized
   * @param context - Context with exchangeName and frameName
   * @param path - Directory path to save report (default: "./dump/walker")
   * @param strategyColumns - Column configuration for strategy comparison table
   * @param pnlColumns - Column configuration for PNL table
   *
   * @example
   * ```typescript
   * const service = new WalkerMarkdownService();
   *
   * // Save to default path: ./dump/walker/my-walker.md
   * await service.dump("my-walker", "BTCUSDT", "sharpeRatio", { exchangeName: "binance", frameName: "1d" });
   *
   * // Save to custom path: ./custom/path/my-walker.md
   * await service.dump("my-walker", "BTCUSDT", "sharpeRatio", { exchangeName: "binance", frameName: "1d" }, "./custom/path");
   * ```
   */
  public dump = async (
    walkerName: WalkerName,
    symbol: string,
    metric: WalkerMetric,
    context: {
      exchangeName: ExchangeName;
      frameName: FrameName;
    },
    path = "./dump/walker",
    strategyColumns: StrategyColumn[] = COLUMN_CONFIG.walker_strategy_columns,
    pnlColumns: PnlColumn[] = COLUMN_CONFIG.walker_pnl_columns
  ): Promise<void> => {
    this.loggerService.log("walkerMarkdownService dump", {
      walkerName,
      symbol,
      metric,
      context,
      path,
    });
    if (!this.subscribe.hasValue()) {
      throw new Error("WalkerMarkdownService not initialized. Call subscribe() before dumping reports.");
    }
    const storage = this.getStorage(walkerName);
    await storage.dump(symbol, metric, context, path, strategyColumns, pnlColumns);
  };

  /**
   * Clears accumulated result data from storage.
   * If walkerName is provided, clears only that walker's data.
   * If walkerName is omitted, clears all walkers' data.
   *
   * @param walkerName - Optional walker name to clear specific walker data
   *
   * @example
   * ```typescript
   * const service = new WalkerMarkdownService();
   *
   * // Clear specific walker data
   * await service.clear("my-walker");
   *
   * // Clear all walkers' data
   * await service.clear();
   * ```
   */
  public clear = async (walkerName?: WalkerName) => {
    this.loggerService.log("walkerMarkdownService clear", {
      walkerName,
    });
    this.getStorage.clear(walkerName);
  };

}

export default WalkerMarkdownService;

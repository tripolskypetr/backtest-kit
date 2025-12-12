import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import {
  WalkerName,
  WalkerMetric,
  IWalkerResults,
} from "../../../interfaces/Walker.interface";
import { StrategyName } from "../../../interfaces/Strategy.interface";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { memoize, singleshot } from "functools-kit";
import { walkerEmitter } from "../../../config/emitters";
import { WalkerContract } from "../../../contract/Walker.contract";
import { BacktestStatistics } from "./BacktestMarkdownService";

/**
 * Alias for walker statistics result interface.
 * Used for clarity in markdown service context.
 *
 * Extends IWalkerResults with additional strategy comparison data.
 */
export interface WalkerStatistics extends IWalkerResults {
  /** Array of all strategy results for comparison and analysis */
  strategyResults: IStrategyResult[];
};

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
 * Strategy result entry for comparison table.
 * Contains strategy name, full statistics, and metric value for ranking.
 */
interface IStrategyResult {
  /** Strategy name */
  strategyName: StrategyName;
  /** Complete backtest statistics for this strategy */
  stats: BacktestStatistics;
  /** Value of the optimization metric (null if invalid) */
  metricValue: number | null;
}

/**
 * Signal data for PNL table.
 * Represents a single closed signal with essential trading information.
 */
interface SignalData {
  /** Strategy that generated this signal */
  strategyName: StrategyName;
  /** Unique signal identifier */
  signalId: string;
  /** Trading pair symbol */
  symbol: string;
  /** Position type (long/short) */
  position: string;
  /** PNL as percentage */
  pnl: number;
  /** Reason why signal was closed */
  closeReason: string;
  /** Timestamp when signal opened */
  openTime: number;
  /** Timestamp when signal closed */
  closeTime: number;
}

/**
 * Column configuration for strategy comparison table generation.
 * Defines how to extract and format data from strategy results.
 */
interface StrategyColumn {
  /** Unique column identifier */
  key: string;
  /** Display label for column header */
  label: string;
  /** Formatting function to convert strategy result data to string */
  format: (data: IStrategyResult, index: number) => string;
}

/**
 * Column configuration for PNL table generation.
 * Defines how to extract and format data from signal data.
 */
interface SignalColumn {
  /** Unique column identifier */
  key: string;
  /** Display label for column header */
  label: string;
  /** Formatting function to convert signal data to string */
  format: (data: SignalData) => string;
}

/**
 * Creates strategy comparison columns based on metric name.
 * Dynamically builds column configuration with metric-specific header.
 *
 * @param metric - Metric being optimized
 * @returns Array of column configurations for strategy comparison table
 */
function createStrategyColumns(metric: WalkerMetric): StrategyColumn[] {
  return [
    {
      key: "rank",
      label: "Rank",
      format: (data, index) => `${index + 1}`,
    },
    {
      key: "strategy",
      label: "Strategy",
      format: (data) => data.strategyName,
    },
    {
      key: "metric",
      label: metric,
      format: (data) => formatMetric(data.metricValue),
    },
    {
      key: "totalSignals",
      label: "Total Signals",
      format: (data) => `${data.stats.totalSignals}`,
    },
    {
      key: "winRate",
      label: "Win Rate",
      format: (data) =>
        data.stats.winRate !== null
          ? `${data.stats.winRate.toFixed(2)}%`
          : "N/A",
    },
    {
      key: "avgPnl",
      label: "Avg PNL",
      format: (data) =>
        data.stats.avgPnl !== null
          ? `${data.stats.avgPnl > 0 ? "+" : ""}${data.stats.avgPnl.toFixed(2)}%`
          : "N/A",
    },
    {
      key: "totalPnl",
      label: "Total PNL",
      format: (data) =>
        data.stats.totalPnl !== null
          ? `${data.stats.totalPnl > 0 ? "+" : ""}${data.stats.totalPnl.toFixed(2)}%`
          : "N/A",
    },
    {
      key: "sharpeRatio",
      label: "Sharpe Ratio",
      format: (data) =>
        data.stats.sharpeRatio !== null
          ? `${data.stats.sharpeRatio.toFixed(3)}`
          : "N/A",
    },
    {
      key: "stdDev",
      label: "Std Dev",
      format: (data) =>
        data.stats.stdDev !== null
          ? `${data.stats.stdDev.toFixed(3)}%`
          : "N/A",
    },
  ];
}

/**
 * Column configuration for PNL table.
 * Defines all columns for displaying closed signals across strategies.
 */
const pnlColumns: SignalColumn[] = [
  {
    key: "strategy",
    label: "Strategy",
    format: (data) => data.strategyName,
  },
  {
    key: "signalId",
    label: "Signal ID",
    format: (data) => data.signalId,
  },
  {
    key: "symbol",
    label: "Symbol",
    format: (data) => data.symbol,
  },
  {
    key: "position",
    label: "Position",
    format: (data) => data.position.toUpperCase(),
  },
  {
    key: "pnl",
    label: "PNL (net)",
    format: (data) => `${data.pnl > 0 ? "+" : ""}${data.pnl.toFixed(2)}%`,
  },
  {
    key: "closeReason",
    label: "Close Reason",
    format: (data) => data.closeReason,
  },
  {
    key: "openTime",
    label: "Open Time",
    format: (data) => new Date(data.openTime).toISOString(),
  },
  {
    key: "closeTime",
    label: "Close Time",
    format: (data) => new Date(data.closeTime).toISOString(),
  },
];

/**
 * Storage class for accumulating walker results.
 * Maintains a list of all strategy results and provides methods to generate reports.
 */
class ReportStorage {

  /** Walker metadata (set from first addResult call) */
  private _totalStrategies: number | null = null;
  private _bestStats: BacktestStatistics | null = null;
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

    {
      this._bestMetric = data.bestMetric;
      this._bestStrategy = data.bestStrategy;
      this._totalStrategies = data.totalStrategies;
    }

    // Update best stats only if this strategy is the current best
    if (data.strategyName === data.bestStrategy) {
      this._bestStats = data.stats;
    }

    // Add strategy result to comparison list
    this._strategyResults.unshift({
      strategyName: data.strategyName,
      stats: data.stats,
      metricValue: data.metricValue,
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
      exchangeName: string;
      frameName: string;
    }
  ): Promise<WalkerStatistics> {
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
   * @param metric - Metric being optimized
   * @param topN - Number of top strategies to include (default: 10)
   * @returns Markdown formatted comparison table
   */
  private getComparisonTable(metric: WalkerMetric, topN: number = 10): string {
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
    const columns = createStrategyColumns(metric);

    // Build table header
    const header = columns.map((col) => col.label);
    const separator = columns.map(() => "---");

    // Build table rows
    const rows = topStrategies.map((result, index) =>
      columns.map((col) => col.format(result, index))
    );

    const tableData = [header, separator, ...rows];
    return tableData.map((row) => `| ${row.join(" | ")} |`).join("\n");
  }

  /**
   * Generates PNL table showing all closed signals across all strategies (View).
   * Collects all signals from all strategies and formats as markdown table.
   *
   * @returns Markdown formatted PNL table
   */
  private getPnlTable(): string {
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
    const header = pnlColumns.map((col) => col.label);
    const separator = pnlColumns.map(() => "---");

    // Build table rows
    const rows = allSignals.map((signal) =>
      pnlColumns.map((col) => col.format(signal))
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
   * @returns Markdown formatted report with all results
   */
  public async getReport(
    symbol: string,
    metric: WalkerMetric,
    context: {
      exchangeName: string;
      frameName: string;
    }
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
      this.getComparisonTable(metric, 10),
      "",
      "## All Signals (PNL Table)",
      "",
      this.getPnlTable(),
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
   */
  public async dump(
    symbol: string,
    metric: WalkerMetric,
    context: {
      exchangeName: string;
      frameName: string;
    },
    path = "./dump/walker"
  ): Promise<void> {
    const markdown = await this.getReport(symbol, metric, context);

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
      exchangeName: string;
      frameName: string;
    }
  ): Promise<IWalkerResults> => {
    this.loggerService.log("walkerMarkdownService getData", {
      walkerName,
      symbol,
      metric,
      context,
    });
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
      exchangeName: string;
      frameName: string;
    }
  ): Promise<string> => {
    this.loggerService.log("walkerMarkdownService getReport", {
      walkerName,
      symbol,
      metric,
      context,
    });
    const storage = this.getStorage(walkerName);
    return storage.getReport(symbol, metric, context);
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
      exchangeName: string;
      frameName: string;
    },
    path = "./dump/walker"
  ): Promise<void> => {
    this.loggerService.log("walkerMarkdownService dump", {
      walkerName,
      symbol,
      metric,
      context,
      path,
    });
    const storage = this.getStorage(walkerName);
    await storage.dump(symbol, metric, context, path);
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

  /**
   * Initializes the service by subscribing to walker events.
   * Uses singleshot to ensure initialization happens only once.
   * Automatically called on first use.
   *
   * @example
   * ```typescript
   * const service = new WalkerMarkdownService();
   * await service.init(); // Subscribe to walker events
   * ```
   */
  protected init = singleshot(async () => {
    this.loggerService.log("walkerMarkdownService init");
    walkerEmitter.subscribe(this.tick);
  });
}

export default WalkerMarkdownService;

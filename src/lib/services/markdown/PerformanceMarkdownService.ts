import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import {
  PerformanceContract,
  PerformanceMetricType,
} from "../../../contract/Performance.contract";
import { StrategyName } from "../../../interfaces/Strategy.interface";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { memoize, singleshot } from "functools-kit";
import { performanceEmitter } from "../../../config/emitters";
import { PerformanceStatisticsModel, MetricStats } from "../../../model/PerformanceStatistics.model";
import { ColumnModel } from "../../../model/Column.model";
import { COLUMN_CONFIG } from "../../../config/columns";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";

/**
 * Type alias for column configuration used in performance metrics markdown reports.
 * 
 * Represents a column model specifically designed to format and display
 * performance statistics for various trading metrics in markdown tables.
 * 
 * @typeParam MetricStats - The performance metric statistics data type containing
 *   aggregated statistics for a specific performance metric
 * 
 * @example
 * ```typescript
 * // Column to display metric name
 * const metricColumn: Columns = {
 *   key: "metric",
 *   label: "Metric",
 *   format: (stat) => stat.metric,
 *   isVisible: () => true
 * };
 * 
 * // Column to display average value
 * const avgColumn: Columns = {
 *   key: "average",
 *   label: "Average",
 *   format: (stat) => stat.average.toFixed(2),
 *   isVisible: () => true
 * };
 * ```
 * 
 * @see ColumnModel for the base interface
 * @see MetricStats for the metric data structure
 */
export type Columns = ColumnModel<MetricStats>;

/**
 * Creates a unique key for memoizing PerformanceStorage instances.
 * Key format: "symbol:strategyName:exchangeName:frameName:backtest" or "symbol:strategyName:exchangeName:live"
 * @param symbol - Trading pair symbol
 * @param strategyName - Name of the strategy
 * @param exchangeName - Exchange name
 * @param frameName - Frame name
 * @param backtest - Whether running in backtest mode
 * @returns Unique string key for memoization
 */
const CREATE_KEY_FN = (
  symbol: string,
  strategyName: StrategyName,
  exchangeName: ExchangeName,
  frameName: FrameName,
  backtest: boolean
): string => {
  const parts = [symbol, strategyName, exchangeName];
  if (frameName) parts.push(frameName);
  parts.push(backtest ? "backtest" : "live");
  return parts.join(":");
};

/**
 * Checks if a value is unsafe for display (not a number, NaN, or Infinity).
 */
function isUnsafe(value: number): boolean {
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
 * Calculates percentile value from sorted array.
 */
function percentile(sortedArray: number[], p: number): number {
  if (sortedArray.length === 0) return 0;
  const index = Math.ceil((sortedArray.length * p) / 100) - 1;
  return sortedArray[Math.max(0, index)];
}

/** Maximum number of performance events to store per strategy */
const MAX_EVENTS = 10000;

/**
 * Storage class for accumulating performance metrics per strategy.
 * Maintains a list of all performance events and provides aggregated statistics.
 */
class PerformanceStorage {
  /** Internal list of all performance events for this strategy */
  private _events: PerformanceContract[] = [];

  /**
   * Adds a performance event to the storage.
   *
   * @param event - Performance event with timing data
   */
  public addEvent(event: PerformanceContract) {
    this._events.unshift(event);

    // Trim queue if exceeded MAX_EVENTS (keep most recent)
    if (this._events.length > MAX_EVENTS) {
      this._events.pop();
    }
  }

  /**
   * Calculates aggregated statistics from all performance events.
   *
   * @returns Performance statistics with metrics grouped by type
   */
  public async getData(strategyName: StrategyName): Promise<PerformanceStatisticsModel> {
    if (this._events.length === 0) {
      return {
        strategyName,
        totalEvents: 0,
        totalDuration: 0,
        metricStats: {},
        events: [],
      };
    }

    // Group events by metric type
    const eventsByType = new Map<PerformanceMetricType, PerformanceContract[]>();
    for (const event of this._events) {
      if (!eventsByType.has(event.metricType)) {
        eventsByType.set(event.metricType, []);
      }
      eventsByType.get(event.metricType)!.push(event);
    }

    // Calculate statistics for each metric type
    const metricStats: Record<string, MetricStats> = {};

    for (const [metricType, events] of eventsByType.entries()) {
      const durations = events.map((e) => e.duration).sort((a, b) => a - b);
      const totalDuration = durations.reduce((sum, d) => sum + d, 0);
      const avgDuration = totalDuration / durations.length;

      // Calculate standard deviation
      const variance =
        durations.reduce((sum, d) => sum + Math.pow(d - avgDuration, 2), 0) /
        durations.length;
      const stdDev = Math.sqrt(variance);

      // Calculate wait times between events
      const waitTimes: number[] = [];
      for (let i = 0; i < events.length; i++) {
        if (events[i].previousTimestamp !== null) {
          const waitTime = events[i].timestamp - events[i].previousTimestamp!;
          waitTimes.push(waitTime);
        }
      }

      const sortedWaitTimes = waitTimes.sort((a, b) => a - b);
      const avgWaitTime =
        sortedWaitTimes.length > 0
          ? sortedWaitTimes.reduce((sum, w) => sum + w, 0) /
            sortedWaitTimes.length
          : 0;
      const minWaitTime = sortedWaitTimes.length > 0 ? sortedWaitTimes[0] : 0;
      const maxWaitTime =
        sortedWaitTimes.length > 0
          ? sortedWaitTimes[sortedWaitTimes.length - 1]
          : 0;

      metricStats[metricType] = {
        metricType,
        count: events.length,
        totalDuration,
        avgDuration,
        minDuration: durations[0],
        maxDuration: durations[durations.length - 1],
        stdDev,
        median: percentile(durations, 50),
        p95: percentile(durations, 95),
        p99: percentile(durations, 99),
        avgWaitTime,
        minWaitTime,
        maxWaitTime,
      };
    }

    const totalDuration = this._events.reduce((sum, e) => sum + e.duration, 0);

    return {
      strategyName,
      totalEvents: this._events.length,
      totalDuration,
      metricStats,
      events: this._events,
    };
  }

  /**
   * Generates markdown report with performance statistics.
   *
   * @param strategyName - Strategy name
   * @param columns - Column configuration for formatting the table
   * @returns Markdown formatted report
   */
  public async getReport(
    strategyName: StrategyName,
    columns: Columns[] = COLUMN_CONFIG.performance_columns
  ): Promise<string> {
    const stats = await this.getData(strategyName);

    if (stats.totalEvents === 0) {
      return [
        `# Performance Report: ${strategyName}`,
        "",
        "No performance metrics recorded yet."
      ].join("\n");
    }

    // Sort metrics by total duration (descending) to show bottlenecks first
    const sortedMetrics = Object.values(stats.metricStats).sort(
      (a, b) => b.totalDuration - a.totalDuration
    );

    // Generate summary table using Column interface
    const visibleColumns = [];
    for (const col of columns) {
      if (await col.isVisible()) {
        visibleColumns.push(col);
      }
    }
    const header = visibleColumns.map((col) => col.label);
    const separator = visibleColumns.map(() => "---");
    const rows = await Promise.all(
      sortedMetrics.map(async (metric, index) =>
        Promise.all(visibleColumns.map((col) => col.format(metric, index)))
      )
    );

    const tableData = [header, separator, ...rows];
    const summaryTable = tableData.map((row) => `| ${row.join(" | ")} |`).join("\n");

    // Calculate percentage of total time for each metric
    const percentages = sortedMetrics.map((metric) => {
      const pct = (metric.totalDuration / stats.totalDuration) * 100;
      return `- **${metric.metricType}**: ${pct.toFixed(1)}% (${metric.totalDuration.toFixed(2)}ms total)`;
    });

    return [
      `# Performance Report: ${strategyName}`,
      "",
      `**Total events:** ${stats.totalEvents}`,
      `**Total execution time:** ${stats.totalDuration.toFixed(2)}ms`,
      `**Number of metric types:** ${Object.keys(stats.metricStats).length}`,
      "",
      "## Time Distribution",
      "",
      percentages.join("\n"),
      "",
      "## Detailed Metrics",
      "",
      summaryTable,
      "",
      "**Note:** All durations are in milliseconds. P95/P99 represent 95th and 99th percentile response times. Wait times show the interval between consecutive events of the same type."
    ].join("\n");
  }

  /**
   * Saves performance report to disk.
   *
   * @param strategyName - Strategy name
   * @param path - Directory path to save report
   * @param columns - Column configuration for formatting the table
   */
  public async dump(
    strategyName: StrategyName,
    path = "./dump/performance",
    columns: Columns[] = COLUMN_CONFIG.performance_columns
  ): Promise<void> {
    const markdown = await this.getReport(strategyName, columns);

    try {
      const dir = join(process.cwd(), path);
      await mkdir(dir, { recursive: true });

      const filename = `${strategyName}.md`;
      const filepath = join(dir, filename);

      await writeFile(filepath, markdown, "utf-8");
      console.log(`Performance report saved: ${filepath}`);
    } catch (error) {
      console.error(`Failed to save performance report:`, error);
    }
  }
}

/**
 * Service for collecting and analyzing performance metrics.
 *
 * Features:
 * - Listens to performance events via performanceEmitter
 * - Accumulates metrics per strategy
 * - Calculates aggregated statistics (avg, min, max, percentiles)
 * - Generates markdown reports with bottleneck analysis
 * - Saves reports to disk in logs/performance/{strategyName}.md
 *
 * @example
 * ```typescript
 * import { listenPerformance } from "backtest-kit";
 *
 * // Subscribe to performance events
 * listenPerformance((event) => {
 *   console.log(`${event.metricType}: ${event.duration.toFixed(2)}ms`);
 * });
 *
 * // After execution, generate report
 * const stats = await Performance.getData("my-strategy");
 * console.log("Bottlenecks:", stats.metricStats);
 *
 * // Save report to disk
 * await Performance.dump("BTCUSDT", "my-strategy");
 * ```
 */
export class PerformanceMarkdownService {
  /** Logger service for debug output */
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * Memoized function to get or create PerformanceStorage for a symbol-strategy-exchange-frame-backtest combination.
   * Each combination gets its own isolated storage instance.
   */
  private getStorage = memoize<(symbol: string, strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean) => PerformanceStorage>(
    ([symbol, strategyName, exchangeName, frameName, backtest]) => CREATE_KEY_FN(symbol, strategyName, exchangeName, frameName, backtest),
    () => new PerformanceStorage()
  );

  /**
   * Subscribes to performance emitter to receive performance events.
   * Protected against multiple subscriptions.
   * Returns an unsubscribe function to stop receiving events.
   *
   * @example
   * ```typescript
   * const service = new PerformanceMarkdownService();
   * const unsubscribe = service.subscribe();
   * // ... later
   * unsubscribe();
   * ```
   */
  public subscribe = singleshot(() => {
    this.loggerService.log("performanceMarkdownService init");
    const unsubscribe = performanceEmitter.subscribe(this.track);
    return () => {
      this.subscribe.clear();
      this.clear();
      unsubscribe();
    }
  });

  /**
   * Unsubscribes from performance emitter to stop receiving events.
   * Calls the unsubscribe function returned by subscribe().
   * If not subscribed, does nothing.
   *
   * @example
   * ```typescript
   * const service = new PerformanceMarkdownService();
   * service.subscribe();
   * // ... later
   * service.unsubscribe();
   * ```
   */
  public unsubscribe = async () => {
    this.loggerService.log("performanceMarkdownService unsubscribe");
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };

  /**
   * Processes performance events and accumulates metrics.
   * Should be called from performance tracking code.
   *
   * @param event - Performance event with timing data
   */
  private track = async (event: PerformanceContract) => {
    this.loggerService.log("performanceMarkdownService track", {
      event,
    });

    const symbol = event.symbol || "global";
    const strategyName = event.strategyName || "global";
    const exchangeName = event.exchangeName || "global";
    const storage = this.getStorage(symbol, strategyName, exchangeName, event.frameName, event.backtest);
    storage.addEvent(event);
  };

  /**
   * Gets aggregated performance statistics for a symbol-strategy pair.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to get data for
   * @param exchangeName - Exchange name
   * @param frameName - Frame name
   * @param backtest - True if backtest mode, false if live mode
   * @returns Performance statistics with aggregated metrics
   *
   * @example
   * ```typescript
   * const stats = await performanceService.getData("BTCUSDT", "my-strategy", "binance", "1h", false);
   * console.log("Total time:", stats.totalDuration);
   * console.log("Slowest operation:", Object.values(stats.metricStats)
   *   .sort((a, b) => b.avgDuration - a.avgDuration)[0]);
   * ```
   */
  public getData = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean
  ): Promise<PerformanceStatisticsModel> => {
    this.loggerService.log("performanceMarkdownService getData", {
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
    });
    if (!this.subscribe.hasValue()) {
      throw new Error("PerformanceMarkdownService not initialized. Call subscribe() before getting data.");
    }
    const storage = this.getStorage(symbol, strategyName, exchangeName, frameName, backtest);
    return storage.getData(strategyName);
  };

  /**
   * Generates markdown report with performance analysis.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to generate report for
   * @param exchangeName - Exchange name
   * @param frameName - Frame name
   * @param backtest - True if backtest mode, false if live mode
   * @param columns - Column configuration for formatting the table
   * @returns Markdown formatted report string
   *
   * @example
   * ```typescript
   * const markdown = await performanceService.getReport("BTCUSDT", "my-strategy", "binance", "1h", false);
   * console.log(markdown);
   * ```
   */
  public getReport = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
    columns: Columns[] = COLUMN_CONFIG.performance_columns
  ): Promise<string> => {
    this.loggerService.log("performanceMarkdownService getReport", {
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
    });
    if (!this.subscribe.hasValue()) {
      throw new Error("PerformanceMarkdownService not initialized. Call subscribe() before generating reports.");
    }
    const storage = this.getStorage(symbol, strategyName, exchangeName, frameName, backtest);
    return storage.getReport(strategyName, columns);
  };

  /**
   * Saves performance report to disk.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to save report for
   * @param exchangeName - Exchange name
   * @param frameName - Frame name
   * @param backtest - True if backtest mode, false if live mode
   * @param path - Directory path to save report
   * @param columns - Column configuration for formatting the table
   *
   * @example
   * ```typescript
   * // Save to default path: ./dump/performance/my-strategy.md
   * await performanceService.dump("BTCUSDT", "my-strategy", "binance", "1h", false);
   *
   * // Save to custom path
   * await performanceService.dump("BTCUSDT", "my-strategy", "binance", "1h", false, "./custom/path");
   * ```
   */
  public dump = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
    path = "./dump/performance",
    columns: Columns[] = COLUMN_CONFIG.performance_columns
  ): Promise<void> => {
    this.loggerService.log("performanceMarkdownService dump", {
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
      path,
    });
    if (!this.subscribe.hasValue()) {
      throw new Error("PerformanceMarkdownService not initialized. Call subscribe() before dumping reports.");
    }
    const storage = this.getStorage(symbol, strategyName, exchangeName, frameName, backtest);
    await storage.dump(strategyName, path, columns);
  };

  /**
   * Clears accumulated performance data from storage.
   *
   * @param payload - Optional payload with symbol, strategyName, exchangeName, frameName, backtest
   */
  public clear = async (payload?: { symbol: string; strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName; backtest: boolean }) => {
    this.loggerService.log("performanceMarkdownService clear", {
      payload,
    });
    if (payload) {
      const key = CREATE_KEY_FN(payload.symbol, payload.strategyName, payload.exchangeName, payload.frameName, payload.backtest);
      this.getStorage.clear(key);
    } else {
      this.getStorage.clear();
    }
  };

}

export default PerformanceMarkdownService;

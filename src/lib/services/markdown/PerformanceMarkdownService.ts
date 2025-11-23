import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import {
  PerformanceContract,
  PerformanceMetricType,
} from "../../../contract/Performance.contract";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { memoize, singleshot, str } from "functools-kit";
import { performanceEmitter } from "../../../config/emitters";

/**
 * Aggregated statistics for a specific metric type.
 */
interface MetricStats {
  /** Type of metric */
  metricType: PerformanceMetricType;

  /** Number of recorded samples */
  count: number;

  /** Total duration across all samples (ms) */
  totalDuration: number;

  /** Average duration (ms) */
  avgDuration: number;

  /** Minimum duration (ms) */
  minDuration: number;

  /** Maximum duration (ms) */
  maxDuration: number;

  /** Standard deviation of duration (ms) */
  stdDev: number;

  /** Median duration (ms) */
  median: number;

  /** 95th percentile duration (ms) */
  p95: number;

  /** 99th percentile duration (ms) */
  p99: number;
}

/**
 * Performance statistics aggregated by strategy.
 */
export interface PerformanceStatistics {
  /** Strategy name */
  strategyName: string;

  /** Total number of performance events recorded */
  totalEvents: number;

  /** Total execution time across all metrics (ms) */
  totalDuration: number;

  /** Statistics grouped by metric type */
  metricStats: Record<string, MetricStats>;

  /** All raw performance events */
  events: PerformanceContract[];
}

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
    this._events.push(event);

    // Trim queue if exceeded MAX_EVENTS (keep most recent)
    if (this._events.length > MAX_EVENTS) {
      this._events.shift();
    }
  }

  /**
   * Calculates aggregated statistics from all performance events.
   *
   * @returns Performance statistics with metrics grouped by type
   */
  public async getData(strategyName: string): Promise<PerformanceStatistics> {
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
   * @returns Markdown formatted report
   */
  public async getReport(strategyName: string): Promise<string> {
    const stats = await this.getData(strategyName);

    if (stats.totalEvents === 0) {
      return str.newline(
        `# Performance Report: ${strategyName}`,
        "",
        "No performance metrics recorded yet."
      );
    }

    // Sort metrics by total duration (descending) to show bottlenecks first
    const sortedMetrics = Object.values(stats.metricStats).sort(
      (a, b) => b.totalDuration - a.totalDuration
    );

    // Generate summary table
    const summaryHeader = [
      "Metric Type",
      "Count",
      "Total (ms)",
      "Avg (ms)",
      "Min (ms)",
      "Max (ms)",
      "Std Dev (ms)",
      "Median (ms)",
      "P95 (ms)",
      "P99 (ms)",
    ];
    const summarySeparator = summaryHeader.map(() => "---");
    const summaryRows = sortedMetrics.map((metric) => [
      metric.metricType,
      metric.count.toString(),
      metric.totalDuration.toFixed(2),
      metric.avgDuration.toFixed(2),
      metric.minDuration.toFixed(2),
      metric.maxDuration.toFixed(2),
      metric.stdDev.toFixed(2),
      metric.median.toFixed(2),
      metric.p95.toFixed(2),
      metric.p99.toFixed(2),
    ]);

    const summaryTableData = [summaryHeader, summarySeparator, ...summaryRows];
    const summaryTable = str.newline(
      summaryTableData.map((row) => `| ${row.join(" | ")} |`)
    );

    // Calculate percentage of total time for each metric
    const percentages = sortedMetrics.map((metric) => {
      const pct = (metric.totalDuration / stats.totalDuration) * 100;
      return `- **${metric.metricType}**: ${pct.toFixed(1)}% (${metric.totalDuration.toFixed(2)}ms total)`;
    });

    return str.newline(
      `# Performance Report: ${strategyName}`,
      "",
      `**Total events:** ${stats.totalEvents}`,
      `**Total execution time:** ${stats.totalDuration.toFixed(2)}ms`,
      `**Number of metric types:** ${Object.keys(stats.metricStats).length}`,
      "",
      "## Time Distribution",
      "",
      str.newline(percentages),
      "",
      "## Detailed Metrics",
      "",
      summaryTable,
      "",
      "**Note:** All durations are in milliseconds. P95/P99 represent 95th and 99th percentile response times."
    );
  }

  /**
   * Saves performance report to disk.
   *
   * @param strategyName - Strategy name
   * @param path - Directory path to save report
   */
  public async dump(
    strategyName: string,
    path = "./logs/performance"
  ): Promise<void> {
    const markdown = await this.getReport(strategyName);

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
 * await Performance.dump("my-strategy");
 * ```
 */
export class PerformanceMarkdownService {
  /** Logger service for debug output */
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * Memoized function to get or create PerformanceStorage for a strategy.
   * Each strategy gets its own isolated storage instance.
   */
  private getStorage = memoize<(strategyName: string) => PerformanceStorage>(
    ([strategyName]) => `${strategyName}`,
    () => new PerformanceStorage()
  );

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

    const strategyName = event.strategyName || "global";
    const storage = this.getStorage(strategyName);
    storage.addEvent(event);
  };

  /**
   * Gets aggregated performance statistics for a strategy.
   *
   * @param strategyName - Strategy name to get data for
   * @returns Performance statistics with aggregated metrics
   *
   * @example
   * ```typescript
   * const stats = await performanceService.getData("my-strategy");
   * console.log("Total time:", stats.totalDuration);
   * console.log("Slowest operation:", Object.values(stats.metricStats)
   *   .sort((a, b) => b.avgDuration - a.avgDuration)[0]);
   * ```
   */
  public getData = async (
    strategyName: string
  ): Promise<PerformanceStatistics> => {
    this.loggerService.log("performanceMarkdownService getData", {
      strategyName,
    });
    const storage = this.getStorage(strategyName);
    return storage.getData(strategyName);
  };

  /**
   * Generates markdown report with performance analysis.
   *
   * @param strategyName - Strategy name to generate report for
   * @returns Markdown formatted report string
   *
   * @example
   * ```typescript
   * const markdown = await performanceService.getReport("my-strategy");
   * console.log(markdown);
   * ```
   */
  public getReport = async (strategyName: string): Promise<string> => {
    this.loggerService.log("performanceMarkdownService getReport", {
      strategyName,
    });
    const storage = this.getStorage(strategyName);
    return storage.getReport(strategyName);
  };

  /**
   * Saves performance report to disk.
   *
   * @param strategyName - Strategy name to save report for
   * @param path - Directory path to save report
   *
   * @example
   * ```typescript
   * // Save to default path: ./logs/performance/my-strategy.md
   * await performanceService.dump("my-strategy");
   *
   * // Save to custom path
   * await performanceService.dump("my-strategy", "./custom/path");
   * ```
   */
  public dump = async (
    strategyName: string,
    path = "./logs/performance"
  ): Promise<void> => {
    this.loggerService.log("performanceMarkdownService dump", {
      strategyName,
      path,
    });
    const storage = this.getStorage(strategyName);
    await storage.dump(strategyName, path);
  };

  /**
   * Clears accumulated performance data from storage.
   *
   * @param strategyName - Optional strategy name to clear specific strategy data
   */
  public clear = async (strategyName?: string) => {
    this.loggerService.log("performanceMarkdownService clear", {
      strategyName,
    });
    this.getStorage.clear(strategyName);
  };

  /**
   * Initializes the service by subscribing to performance events.
   * Uses singleshot to ensure initialization happens only once.
   */
  protected init = singleshot(async () => {
    this.loggerService.log("performanceMarkdownService init");
    performanceEmitter.subscribe(this.track);
  });
}

export default PerformanceMarkdownService;

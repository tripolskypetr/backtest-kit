import backtest from "../lib";
import { PerformanceStatistics } from "../lib/services/markdown/PerformanceMarkdownService";

/**
 * Performance class provides static methods for performance metrics analysis.
 *
 * Features:
 * - Get aggregated performance statistics by strategy
 * - Generate markdown reports with bottleneck analysis
 * - Save reports to disk
 * - Clear accumulated metrics
 *
 * @example
 * ```typescript
 * import { Performance, listenPerformance } from "backtest-kit";
 *
 * // Subscribe to performance events
 * listenPerformance((event) => {
 *   console.log(`${event.metricType}: ${event.duration.toFixed(2)}ms`);
 * });
 *
 * // Run backtest...
 *
 * // Get aggregated statistics
 * const stats = await Performance.getData("my-strategy");
 * console.log("Total time:", stats.totalDuration);
 * console.log("Slowest operations:", Object.values(stats.metricStats)
 *   .sort((a, b) => b.avgDuration - a.avgDuration)
 *   .slice(0, 5));
 *
 * // Generate and save report
 * await Performance.dump("my-strategy");
 * ```
 */
export class Performance {
  /**
   * Gets aggregated performance statistics for a strategy.
   *
   * Returns detailed metrics grouped by operation type:
   * - Count, total duration, average, min, max
   * - Standard deviation for volatility
   * - Percentiles (median, P95, P99) for outlier detection
   *
   * @param strategyName - Strategy name to analyze
   * @returns Performance statistics with aggregated metrics
   *
   * @example
   * ```typescript
   * const stats = await Performance.getData("my-strategy");
   *
   * // Find slowest operation type
   * const slowest = Object.values(stats.metricStats)
   *   .sort((a, b) => b.avgDuration - a.avgDuration)[0];
   * console.log(`Slowest: ${slowest.metricType} (${slowest.avgDuration.toFixed(2)}ms avg)`);
   *
   * // Check for outliers
   * for (const metric of Object.values(stats.metricStats)) {
   *   if (metric.p99 > metric.avgDuration * 5) {
   *     console.warn(`High variance in ${metric.metricType}: P99=${metric.p99}ms, Avg=${metric.avgDuration}ms`);
   *   }
   * }
   * ```
   */
  public static async getData(
    strategyName: string
  ): Promise<PerformanceStatistics> {
    return backtest.performanceMarkdownService.getData(strategyName);
  }

  /**
   * Generates markdown report with performance analysis.
   *
   * Report includes:
   * - Time distribution across operation types
   * - Detailed metrics table with statistics
   * - Percentile analysis for bottleneck detection
   *
   * @param strategyName - Strategy name to generate report for
   * @returns Markdown formatted report string
   *
   * @example
   * ```typescript
   * const markdown = await Performance.getReport("my-strategy");
   * console.log(markdown);
   *
   * // Or save to file
   * import fs from "fs/promises";
   * await fs.writeFile("performance-report.md", markdown);
   * ```
   */
  public static async getReport(strategyName: string): Promise<string> {
    return backtest.performanceMarkdownService.getReport(strategyName);
  }

  /**
   * Saves performance report to disk.
   *
   * Creates directory if it doesn't exist.
   * Default path: ./logs/performance/{strategyName}.md
   *
   * @param strategyName - Strategy name to save report for
   * @param path - Optional custom directory path
   *
   * @example
   * ```typescript
   * // Save to default path: ./logs/performance/my-strategy.md
   * await Performance.dump("my-strategy");
   *
   * // Save to custom path: ./reports/perf/my-strategy.md
   * await Performance.dump("my-strategy", "./reports/perf");
   * ```
   */
  public static async dump(
    strategyName: string,
    path = "./logs/performance"
  ): Promise<void> {
    return backtest.performanceMarkdownService.dump(strategyName, path);
  }

  /**
   * Clears accumulated performance metrics from memory.
   *
   * @param strategyName - Optional strategy name to clear specific strategy's metrics
   *
   * @example
   * ```typescript
   * // Clear specific strategy metrics
   * await Performance.clear("my-strategy");
   *
   * // Clear all metrics for all strategies
   * await Performance.clear();
   * ```
   */
  public static async clear(strategyName?: string): Promise<void> {
    return backtest.performanceMarkdownService.clear(strategyName);
  }
}

export default Performance;

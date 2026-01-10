import bt from "../lib";
import { PerformanceStatisticsModel } from "../model/PerformanceStatistics.model";
import { Columns } from "../lib/services/markdown/PerformanceMarkdownService";
import { StrategyName } from "../interfaces/Strategy.interface";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";

const PERFORMANCE_METHOD_NAME_GET_DATA = "Performance.getData";
const PERFORMANCE_METHOD_NAME_GET_REPORT = "Performance.getReport";
const PERFORMANCE_METHOD_NAME_DUMP = "Performance.dump";

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
 * // Run bt...
 *
 * // Get aggregated statistics
 * const stats = await Performance.getData("my-strategy");
 * console.log("Total time:", stats.totalDuration);
 * console.log("Slowest operations:", Object.values(stats.metricStats)
 *   .sort((a, b) => b.avgDuration - a.avgDuration)
 *   .slice(0, 5));
 *
 * // Generate and save report
 * await Performance.dump("BTCUSDT", "my-strategy");
 * ```
 */
export class Performance {
  /**
   * Gets aggregated performance statistics for a symbol-strategy pair.
   *
   * Returns detailed metrics grouped by operation type:
   * - Count, total duration, average, min, max
   * - Standard deviation for volatility
   * - Percentiles (median, P95, P99) for outlier detection
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to analyze
   * @returns Performance statistics with aggregated metrics
   *
   * @example
   * ```typescript
   * const stats = await Performance.getData("BTCUSDT", "my-strategy");
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
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    },
    backtest = false,
  ): Promise<PerformanceStatisticsModel> {
    bt.strategyValidationService.validate(context.strategyName, PERFORMANCE_METHOD_NAME_GET_DATA);
    bt.exchangeValidationService.validate(context.exchangeName, PERFORMANCE_METHOD_NAME_GET_DATA);

    {
      const { riskName, riskList } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, PERFORMANCE_METHOD_NAME_GET_DATA);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, PERFORMANCE_METHOD_NAME_GET_DATA));
    }

    return bt.performanceMarkdownService.getData(symbol, context.strategyName, context.exchangeName, context.frameName, backtest);
  }

  /**
   * Generates markdown report with performance analysis.
   *
   * Report includes:
   * - Time distribution across operation types
   * - Detailed metrics table with statistics
   * - Percentile analysis for bottleneck detection
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to generate report for
   * @param columns - Optional columns configuration for the report
   * @returns Markdown formatted report string
   *
   * @example
   * ```typescript
   * const markdown = await Performance.getReport("BTCUSDT", "my-strategy");
   * console.log(markdown);
   *
   * // Or save to file
   * import fs from "fs/promises";
   * await fs.writeFile("performance-report.md", markdown);
   * ```
   */
  public static async getReport(
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    },
    backtest = false,
    columns?: Columns[]
  ): Promise<string> {
    bt.strategyValidationService.validate(context.strategyName, PERFORMANCE_METHOD_NAME_GET_REPORT);
    bt.exchangeValidationService.validate(context.exchangeName, PERFORMANCE_METHOD_NAME_GET_REPORT);

    {
      const { riskName, riskList } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, PERFORMANCE_METHOD_NAME_GET_REPORT);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, PERFORMANCE_METHOD_NAME_GET_REPORT));
    }

    return bt.performanceMarkdownService.getReport(symbol, context.strategyName, context.exchangeName, context.frameName, backtest, columns);
  }

  /**
   * Saves performance report to disk.
   *
   * Creates directory if it doesn't exist.
   * Default path: ./dump/performance/{strategyName}.md
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to save report for
   * @param path - Optional custom directory path
   * @param columns - Optional columns configuration for the report
   *
   * @example
   * ```typescript
   * // Save to default path: ./dump/performance/my-strategy.md
   * await Performance.dump("BTCUSDT", "my-strategy");
   *
   * // Save to custom path: ./reports/perf/my-strategy.md
   * await Performance.dump("BTCUSDT", "my-strategy", "./reports/perf");
   * ```
   */
  public static async dump(
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    },
    backtest = false,
    path = "./dump/performance",
    columns?: Columns[]
  ): Promise<void> {
    bt.strategyValidationService.validate(context.strategyName, PERFORMANCE_METHOD_NAME_DUMP);
    bt.exchangeValidationService.validate(context.exchangeName, PERFORMANCE_METHOD_NAME_DUMP);

    {
      const { riskName, riskList } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, PERFORMANCE_METHOD_NAME_DUMP);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, PERFORMANCE_METHOD_NAME_DUMP));
    }

    return bt.performanceMarkdownService.dump(symbol, context.strategyName, context.exchangeName, context.frameName, backtest, path, columns);
  }
}

export default Performance;

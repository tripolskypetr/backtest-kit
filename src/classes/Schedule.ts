import { StrategyName } from "../interfaces/Strategy.interface";
import backtest from "../lib";

const SCHEDULE_METHOD_NAME_GET_DATA = "ScheduleUtils.getData";
const SCHEDULE_METHOD_NAME_GET_REPORT = "ScheduleUtils.getReport";
const SCHEDULE_METHOD_NAME_DUMP = "ScheduleUtils.dump";
const SCHEDULE_METHOD_NAME_CLEAR = "ScheduleUtils.clear";

/**
 * Utility class for scheduled signals reporting operations.
 *
 * Provides simplified access to scheduleMarkdownService with logging.
 * Exported as singleton instance for convenient usage.
 *
 * Features:
 * - Track scheduled signals in queue
 * - Track cancelled signals
 * - Calculate cancellation rate and average wait time
 * - Generate markdown reports
 *
 * @example
 * ```typescript
 * import { Schedule } from "./classes/Schedule";
 *
 * // Get scheduled signals statistics
 * const stats = await Schedule.getData("my-strategy");
 * console.log(`Cancellation rate: ${stats.cancellationRate}%`);
 * console.log(`Average wait time: ${stats.avgWaitTime} minutes`);
 *
 * // Generate and save report
 * await Schedule.dump("my-strategy");
 * ```
 */
export class ScheduleUtils {
  /**
   * Gets statistical data from all scheduled signal events for a strategy.
   *
   * @param strategyName - Strategy name to get data for
   * @returns Promise resolving to statistical data object
   *
   * @example
   * ```typescript
   * const stats = await Schedule.getData("my-strategy");
   * console.log(stats.cancellationRate, stats.avgWaitTime);
   * ```
   */
  public getData = async (strategyName: StrategyName) => {
    backtest.loggerService.info(SCHEDULE_METHOD_NAME_GET_DATA, {
      strategyName,
    });
    return await backtest.scheduleMarkdownService.getData(strategyName);
  };

  /**
   * Generates markdown report with all scheduled events for a strategy.
   *
   * @param strategyName - Strategy name to generate report for
   * @returns Promise resolving to markdown formatted report string
   *
   * @example
   * ```typescript
   * const markdown = await Schedule.getReport("my-strategy");
   * console.log(markdown);
   * ```
   */
  public getReport = async (strategyName: StrategyName): Promise<string> => {
    backtest.loggerService.info(SCHEDULE_METHOD_NAME_GET_REPORT, {
      strategyName,
    });
    return await backtest.scheduleMarkdownService.getReport(strategyName);
  };

  /**
   * Saves strategy report to disk.
   *
   * @param strategyName - Strategy name to save report for
   * @param path - Optional directory path to save report (default: "./logs/schedule")
   *
   * @example
   * ```typescript
   * // Save to default path: ./logs/schedule/my-strategy.md
   * await Schedule.dump("my-strategy");
   *
   * // Save to custom path: ./custom/path/my-strategy.md
   * await Schedule.dump("my-strategy", "./custom/path");
   * ```
   */
  public dump = async (
    strategyName: StrategyName,
    path?: string
  ): Promise<void> => {
    backtest.loggerService.info(SCHEDULE_METHOD_NAME_DUMP, {
      strategyName,
      path,
    });
    await backtest.scheduleMarkdownService.dump(strategyName, path);
  };

  /**
   * Clears accumulated scheduled signal data from storage.
   * If strategyName is provided, clears only that strategy's data.
   * If strategyName is omitted, clears all strategies' data.
   *
   * @param strategyName - Optional strategy name to clear specific strategy data
   *
   * @example
   * ```typescript
   * // Clear specific strategy data
   * await Schedule.clear("my-strategy");
   *
   * // Clear all strategies' data
   * await Schedule.clear();
   * ```
   */
  public clear = async (strategyName?: StrategyName): Promise<void> => {
    backtest.loggerService.info(SCHEDULE_METHOD_NAME_CLEAR, {
      strategyName,
    });
    await backtest.scheduleMarkdownService.clear(strategyName);
  };
}

/**
 * Singleton instance of ScheduleUtils for convenient scheduled signals reporting.
 *
 * @example
 * ```typescript
 * import { Schedule } from "./classes/Schedule";
 *
 * const stats = await Schedule.getData("my-strategy");
 * console.log("Cancellation rate:", stats.cancellationRate);
 * ```
 */
export const Schedule = new ScheduleUtils();

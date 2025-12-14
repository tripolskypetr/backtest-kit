import { StrategyName } from "../interfaces/Strategy.interface";
import backtest from "../lib";

const SCHEDULE_METHOD_NAME_GET_DATA = "ScheduleUtils.getData";
const SCHEDULE_METHOD_NAME_GET_REPORT = "ScheduleUtils.getReport";
const SCHEDULE_METHOD_NAME_DUMP = "ScheduleUtils.dump";

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
 * await Schedule.dump("BTCUSDT", "my-strategy");
 * ```
 */
export class ScheduleUtils {
  /**
   * Gets statistical data from all scheduled signal events for a symbol-strategy pair.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to get data for
   * @returns Promise resolving to statistical data object
   *
   * @example
   * ```typescript
   * const stats = await Schedule.getData("BTCUSDT", "my-strategy");
   * console.log(stats.cancellationRate, stats.avgWaitTime);
   * ```
   */
  public getData = async (symbol: string, strategyName: StrategyName) => {
    backtest.loggerService.info(SCHEDULE_METHOD_NAME_GET_DATA, {
      symbol,
      strategyName,
    });

    backtest.strategyValidationService.validate(strategyName, SCHEDULE_METHOD_NAME_GET_DATA);

    {
      const { riskName, riskList } = backtest.strategySchemaService.get(strategyName);
      riskName && backtest.riskValidationService.validate(riskName, SCHEDULE_METHOD_NAME_GET_DATA);
      riskList && riskList.forEach((riskName) => backtest.riskValidationService.validate(riskName, SCHEDULE_METHOD_NAME_GET_DATA));
    }

    return await backtest.scheduleMarkdownService.getData(symbol, strategyName);
  };

  /**
   * Generates markdown report with all scheduled events for a symbol-strategy pair.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to generate report for
   * @returns Promise resolving to markdown formatted report string
   *
   * @example
   * ```typescript
   * const markdown = await Schedule.getReport("BTCUSDT", "my-strategy");
   * console.log(markdown);
   * ```
   */
  public getReport = async (symbol: string, strategyName: StrategyName): Promise<string> => {
    backtest.loggerService.info(SCHEDULE_METHOD_NAME_GET_REPORT, {
      symbol,
      strategyName,
    });

    backtest.strategyValidationService.validate(strategyName, SCHEDULE_METHOD_NAME_GET_REPORT);

    {
      const { riskName, riskList } = backtest.strategySchemaService.get(strategyName);
      riskName && backtest.riskValidationService.validate(riskName, SCHEDULE_METHOD_NAME_GET_REPORT);
      riskList && riskList.forEach((riskName) => backtest.riskValidationService.validate(riskName, SCHEDULE_METHOD_NAME_GET_REPORT));
    }

    return await backtest.scheduleMarkdownService.getReport(symbol, strategyName);
  };

  /**
   * Saves strategy report to disk.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to save report for
   * @param path - Optional directory path to save report (default: "./dump/schedule")
   *
   * @example
   * ```typescript
   * // Save to default path: ./dump/schedule/my-strategy.md
   * await Schedule.dump("BTCUSDT", "my-strategy");
   *
   * // Save to custom path: ./custom/path/my-strategy.md
   * await Schedule.dump("BTCUSDT", "my-strategy", "./custom/path");
   * ```
   */
  public dump = async (
    symbol: string,
    strategyName: StrategyName,
    path?: string
  ): Promise<void> => {
    backtest.loggerService.info(SCHEDULE_METHOD_NAME_DUMP, {
      symbol,
      strategyName,
      path,
    });

    backtest.strategyValidationService.validate(strategyName, SCHEDULE_METHOD_NAME_DUMP);

    {
      const { riskName, riskList } = backtest.strategySchemaService.get(strategyName);
      riskName && backtest.riskValidationService.validate(riskName, SCHEDULE_METHOD_NAME_DUMP);
      riskList && riskList.forEach((riskName) => backtest.riskValidationService.validate(riskName, SCHEDULE_METHOD_NAME_DUMP));
    }

    await backtest.scheduleMarkdownService.dump(symbol, strategyName, path);
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

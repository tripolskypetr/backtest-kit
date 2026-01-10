import { StrategyName } from "../interfaces/Strategy.interface";
import bt from "../lib";
import { Columns } from "../lib/services/markdown/ScheduleMarkdownService";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";

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
  public getData = async (
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    },
    backtest = false
  ) => {
    bt.loggerService.info(SCHEDULE_METHOD_NAME_GET_DATA, {
      symbol,
      strategyName: context.strategyName,
      backtest,
    });

    bt.strategyValidationService.validate(context.strategyName, SCHEDULE_METHOD_NAME_GET_DATA);
    bt.exchangeValidationService.validate(context.exchangeName, SCHEDULE_METHOD_NAME_GET_DATA);

    {
      const { riskName, riskList } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, SCHEDULE_METHOD_NAME_GET_DATA);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, SCHEDULE_METHOD_NAME_GET_DATA));
    }

    return await bt.scheduleMarkdownService.getData(symbol, context.strategyName, context.exchangeName, context.frameName, backtest);
  };

  /**
   * Generates markdown report with all scheduled events for a symbol-strategy pair.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to generate report for
   * @param columns - Optional columns configuration for the report
   * @returns Promise resolving to markdown formatted report string
   *
   * @example
   * ```typescript
   * const markdown = await Schedule.getReport("BTCUSDT", "my-strategy");
   * console.log(markdown);
   * ```
   */
  public getReport = async (
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    },
    backtest = false,
    columns?: Columns[]
  ): Promise<string> => {
    bt.loggerService.info(SCHEDULE_METHOD_NAME_GET_REPORT, {
      symbol,
      strategyName: context.strategyName,
      backtest,
    });

    bt.strategyValidationService.validate(context.strategyName, SCHEDULE_METHOD_NAME_GET_REPORT);
    bt.exchangeValidationService.validate(context.exchangeName, SCHEDULE_METHOD_NAME_GET_REPORT);

    {
      const { riskName, riskList } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, SCHEDULE_METHOD_NAME_GET_REPORT);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, SCHEDULE_METHOD_NAME_GET_REPORT));
    }

    return await bt.scheduleMarkdownService.getReport(symbol, context.strategyName, context.exchangeName, context.frameName, backtest, columns);
  };

  /**
   * Saves strategy report to disk.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to save report for
   * @param path - Optional directory path to save report (default: "./dump/schedule")
   * @param columns - Optional columns configuration for the report
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
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    },
    backtest = false,
    path?: string,
    columns?: Columns[]
  ): Promise<void> => {
    bt.loggerService.info(SCHEDULE_METHOD_NAME_DUMP, {
      symbol,
      strategyName: context.strategyName,
      backtest,
      path,
    });

    bt.strategyValidationService.validate(context.strategyName, SCHEDULE_METHOD_NAME_DUMP);
    bt.exchangeValidationService.validate(context.exchangeName, SCHEDULE_METHOD_NAME_DUMP);

    {
      const { riskName, riskList } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, SCHEDULE_METHOD_NAME_DUMP);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, SCHEDULE_METHOD_NAME_DUMP));
    }

    await bt.scheduleMarkdownService.dump(symbol, context.strategyName, context.exchangeName, context.frameName, backtest, path, columns);
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

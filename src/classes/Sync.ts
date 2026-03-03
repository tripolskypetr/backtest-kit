import bt from "../lib";
import { Columns } from "../lib/services/markdown/SyncMarkdownService";
import { StrategyName } from "../interfaces/Strategy.interface";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";

const SYNC_METHOD_NAME_GET_DATA = "SyncUtils.getData";
const SYNC_METHOD_NAME_GET_REPORT = "SyncUtils.getReport";
const SYNC_METHOD_NAME_DUMP = "SyncUtils.dump";

/**
 * Utility class for accessing signal sync lifecycle reports and statistics.
 *
 * Provides methods to retrieve data accumulated by SyncMarkdownService
 * from signal-open and signal-close events emitted via syncSubject.
 *
 * Features:
 * - Statistical data extraction (total events, opens, closes)
 * - Markdown report generation with event tables
 * - File export to disk
 *
 * Data source:
 * - SyncMarkdownService listens to syncSubject
 * - Accumulates sync events in ReportStorage (max 250 events per combination)
 * - Events include: signal-open (limit order filled) and signal-close (position exited)
 *
 * @example
 * ```typescript
 * import { Sync } from "backtest-kit";
 *
 * // Get statistical data
 * const stats = await Sync.getData("BTCUSDT", {
 *   strategyName: "my-strategy",
 *   exchangeName: "binance",
 *   frameName: "1h",
 * });
 * console.log(`Total sync events: ${stats.totalEvents}`);
 * console.log(`Opens: ${stats.openCount}`);
 * console.log(`Closes: ${stats.closeCount}`);
 *
 * // Generate markdown report
 * const markdown = await Sync.getReport("BTCUSDT", {
 *   strategyName: "my-strategy",
 *   exchangeName: "binance",
 *   frameName: "1h",
 * });
 * console.log(markdown);
 *
 * // Export report to file
 * await Sync.dump("BTCUSDT", {
 *   strategyName: "my-strategy",
 *   exchangeName: "binance",
 *   frameName: "1h",
 * });
 * ```
 */
export class SyncUtils {
  /**
   * Retrieves statistical data from accumulated signal sync events.
   *
   * Delegates to SyncMarkdownService.getData() which reads from ReportStorage.
   * Returns aggregated metrics calculated from all sync events.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param context - Context with strategyName, exchangeName, frameName
   * @param backtest - Whether to query backtest data (default: false = live)
   * @returns Promise resolving to SyncStatisticsModel with event list and counts
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
    bt.loggerService.info(SYNC_METHOD_NAME_GET_DATA, {
      symbol,
      strategyName: context.strategyName,
    });

    bt.strategyValidationService.validate(
      context.strategyName,
      SYNC_METHOD_NAME_GET_DATA
    );
    bt.exchangeValidationService.validate(
      context.exchangeName,
      SYNC_METHOD_NAME_GET_DATA
    );
    context.frameName &&
      bt.frameValidationService.validate(
        context.frameName,
        SYNC_METHOD_NAME_GET_DATA
      );

    return await bt.syncMarkdownService.getData(
      symbol,
      context.strategyName,
      context.exchangeName,
      context.frameName,
      backtest
    );
  };

  /**
   * Generates markdown report with all signal sync events for a symbol-strategy pair.
   *
   * Creates formatted table containing:
   * - Symbol, strategy, signal ID
   * - Action (signal-open / signal-close)
   * - Position direction, current price, entry price
   * - Take profit and stop loss levels
   * - DCA entry count, partial close count
   * - PNL percentage, close reason (for signal-close)
   * - Timestamp and mode (backtest/live)
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param context - Context with strategyName, exchangeName, frameName
   * @param backtest - Whether to query backtest data (default: false = live)
   * @param columns - Optional column configuration for the report table
   * @returns Promise resolving to markdown formatted report string
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
    bt.loggerService.info(SYNC_METHOD_NAME_GET_REPORT, {
      symbol,
      strategyName: context.strategyName,
    });

    bt.strategyValidationService.validate(
      context.strategyName,
      SYNC_METHOD_NAME_GET_REPORT
    );
    bt.exchangeValidationService.validate(
      context.exchangeName,
      SYNC_METHOD_NAME_GET_REPORT
    );
    context.frameName &&
      bt.frameValidationService.validate(
        context.frameName,
        SYNC_METHOD_NAME_GET_REPORT
      );

    return await bt.syncMarkdownService.getReport(
      symbol,
      context.strategyName,
      context.exchangeName,
      context.frameName,
      backtest,
      columns
    );
  };

  /**
   * Generates and saves markdown report to file.
   *
   * Creates directory if it doesn't exist.
   * Filename format: {symbol}_{strategyName}_{exchangeName}[_{frameName}_backtest|_live]-{timestamp}.md
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param context - Context with strategyName, exchangeName, frameName
   * @param backtest - Whether to query backtest data (default: false = live)
   * @param path - Output directory path (default: "./dump/sync")
   * @param columns - Optional column configuration for the report table
   * @returns Promise that resolves when file is written
   *
   * @example
   * ```typescript
   * // Save to default path: ./dump/sync/
   * await Sync.dump("BTCUSDT", { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" });
   *
   * // Save to custom path
   * await Sync.dump("BTCUSDT", { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" }, false, "./reports/sync");
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
    bt.loggerService.info(SYNC_METHOD_NAME_DUMP, {
      symbol,
      strategyName: context.strategyName,
      path,
    });

    bt.strategyValidationService.validate(
      context.strategyName,
      SYNC_METHOD_NAME_DUMP
    );
    bt.exchangeValidationService.validate(
      context.exchangeName,
      SYNC_METHOD_NAME_DUMP
    );
    context.frameName &&
      bt.frameValidationService.validate(
        context.frameName,
        SYNC_METHOD_NAME_DUMP
      );

    await bt.syncMarkdownService.dump(
      symbol,
      context.strategyName,
      context.exchangeName,
      context.frameName,
      backtest,
      path,
      columns
    );
  };
}

/**
 * Global singleton instance of SyncUtils.
 * Provides static-like access to signal sync reporting methods.
 *
 * @example
 * ```typescript
 * import { Sync } from "backtest-kit";
 *
 * const stats = await Sync.getData("BTCUSDT", { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" });
 * const report = await Sync.getReport("BTCUSDT", { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" });
 * await Sync.dump("BTCUSDT", { strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" });
 * ```
 */
export const Sync = new SyncUtils();

import backtest from "../lib";

const PARTIAL_METHOD_NAME_GET_DATA = "PartialUtils.getData";
const PARTIAL_METHOD_NAME_GET_REPORT = "PartialUtils.getReport";
const PARTIAL_METHOD_NAME_DUMP = "PartialUtils.dump";

/**
 * Utility class for accessing partial profit/loss reports and statistics.
 *
 * Provides static-like methods (via singleton instance) to retrieve data
 * accumulated by PartialMarkdownService from partial profit/loss events.
 *
 * Features:
 * - Statistical data extraction (total profit/loss events count)
 * - Markdown report generation with event tables
 * - File export to disk
 *
 * Data source:
 * - PartialMarkdownService listens to partialProfitSubject/partialLossSubject
 * - Accumulates events in ReportStorage (max 250 events per symbol-strategy pair)
 * - Events include: timestamp, action, symbol, strategyName, signalId, position, level, price, mode
 *
 * @example
 * ```typescript
 * import { Partial } from "./classes/Partial";
 *
 * // Get statistical data for BTCUSDT:my-strategy
 * const stats = await Partial.getData("BTCUSDT", "my-strategy");
 * console.log(`Total events: ${stats.totalEvents}`);
 * console.log(`Profit events: ${stats.totalProfit}`);
 * console.log(`Loss events: ${stats.totalLoss}`);
 *
 * // Generate markdown report
 * const markdown = await Partial.getReport("BTCUSDT", "my-strategy");
 * console.log(markdown); // Formatted table with all events
 *
 * // Export report to file
 * await Partial.dump("BTCUSDT", "my-strategy"); // Saves to ./dump/partial/BTCUSDT_my-strategy.md
 * await Partial.dump("BTCUSDT", "my-strategy", "./custom/path"); // Custom directory
 * ```
 */
export class PartialUtils {
  /**
   * Retrieves statistical data from accumulated partial profit/loss events.
   *
   * Delegates to PartialMarkdownService.getData() which reads from ReportStorage.
   * Returns aggregated metrics calculated from all profit and loss events.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param strategyName - Strategy name (e.g., "my-strategy")
   * @returns Promise resolving to PartialStatistics object with counts and event list
   *
   * @example
   * ```typescript
   * const stats = await Partial.getData("BTCUSDT", "my-strategy");
   *
   * console.log(`Total events: ${stats.totalEvents}`);
   * console.log(`Profit events: ${stats.totalProfit} (${(stats.totalProfit / stats.totalEvents * 100).toFixed(1)}%)`);
   * console.log(`Loss events: ${stats.totalLoss} (${(stats.totalLoss / stats.totalEvents * 100).toFixed(1)}%)`);
   *
   * // Iterate through all events
   * for (const event of stats.eventList) {
   *   console.log(`${event.action.toUpperCase()}: Signal ${event.signalId} reached ${event.level}%`);
   * }
   * ```
   */
  public getData = async (symbol: string, strategyName: string) => {
    backtest.loggerService.info(PARTIAL_METHOD_NAME_GET_DATA, { symbol, strategyName });

    backtest.strategyValidationService.validate(strategyName, PARTIAL_METHOD_NAME_GET_DATA);

    {
      const { riskName, riskList } = backtest.strategySchemaService.get(strategyName);
      riskName && backtest.riskValidationService.validate(riskName, PARTIAL_METHOD_NAME_GET_DATA);
      riskList && riskList.forEach((riskName) => backtest.riskValidationService.validate(riskName, PARTIAL_METHOD_NAME_GET_DATA));
    }

    return await backtest.partialMarkdownService.getData(symbol, strategyName);
  };

  /**
   * Generates markdown report with all partial profit/loss events for a symbol-strategy pair.
   *
   * Creates formatted table containing:
   * - Action (PROFIT/LOSS)
   * - Symbol
   * - Strategy
   * - Signal ID
   * - Position (LONG/SHORT)
   * - Level % (+10%, -20%, etc)
   * - Current Price
   * - Timestamp (ISO 8601)
   * - Mode (Backtest/Live)
   *
   * Also includes summary statistics at the end.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param strategyName - Strategy name (e.g., "my-strategy")
   * @returns Promise resolving to markdown formatted report string
   *
   * @example
   * ```typescript
   * const markdown = await Partial.getReport("BTCUSDT", "my-strategy");
   * console.log(markdown);
   *
   * // Output:
   * // # Partial Profit/Loss Report: BTCUSDT:my-strategy
   * //
   * // | Action | Symbol | Strategy | Signal ID | Position | Level % | Current Price | Timestamp | Mode |
   * // | --- | --- | --- | --- | --- | --- | --- | --- | --- |
   * // | PROFIT | BTCUSDT | my-strategy | abc123 | LONG | +10% | 51500.00000000 USD | 2024-01-15T10:30:00.000Z | Backtest |
   * // | LOSS | BTCUSDT | my-strategy | abc123 | LONG | -10% | 49000.00000000 USD | 2024-01-15T11:00:00.000Z | Backtest |
   * //
   * // **Total events:** 2
   * // **Profit events:** 1
   * // **Loss events:** 1
   * ```
   */
  public getReport = async (symbol: string, strategyName: string): Promise<string> => {
    backtest.loggerService.info(PARTIAL_METHOD_NAME_GET_REPORT, { symbol, strategyName });

    backtest.strategyValidationService.validate(strategyName, PARTIAL_METHOD_NAME_GET_REPORT);

    {
      const { riskName, riskList } = backtest.strategySchemaService.get(strategyName);
      riskName && backtest.riskValidationService.validate(riskName, PARTIAL_METHOD_NAME_GET_REPORT);
      riskList && riskList.forEach((riskName) => backtest.riskValidationService.validate(riskName, PARTIAL_METHOD_NAME_GET_REPORT));
    }

    return await backtest.partialMarkdownService.getReport(symbol, strategyName);
  };

  /**
   * Generates and saves markdown report to file.
   *
   * Creates directory if it doesn't exist.
   * Filename format: {symbol}_{strategyName}.md (e.g., "BTCUSDT_my-strategy.md")
   *
   * Delegates to PartialMarkdownService.dump() which:
   * 1. Generates markdown report via getReport()
   * 2. Creates output directory (recursive mkdir)
   * 3. Writes file with UTF-8 encoding
   * 4. Logs success/failure to console
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param strategyName - Strategy name (e.g., "my-strategy")
   * @param path - Output directory path (default: "./dump/partial")
   * @returns Promise that resolves when file is written
   *
   * @example
   * ```typescript
   * // Save to default path: ./dump/partial/BTCUSDT_my-strategy.md
   * await Partial.dump("BTCUSDT", "my-strategy");
   *
   * // Save to custom path: ./reports/partial/BTCUSDT_my-strategy.md
   * await Partial.dump("BTCUSDT", "my-strategy", "./reports/partial");
   *
   * // After multiple symbols backtested, export all reports
   * for (const symbol of ["BTCUSDT", "ETHUSDT", "BNBUSDT"]) {
   *   await Partial.dump(symbol, "my-strategy", "./backtest-results");
   * }
   * ```
   */
  public dump = async (symbol: string, strategyName: string, path?: string): Promise<void> => {
    backtest.loggerService.info(PARTIAL_METHOD_NAME_DUMP, { symbol, strategyName, path });

    backtest.strategyValidationService.validate(strategyName, PARTIAL_METHOD_NAME_DUMP);

    {
      const { riskName, riskList } = backtest.strategySchemaService.get(strategyName);
      riskName && backtest.riskValidationService.validate(riskName, PARTIAL_METHOD_NAME_DUMP);
      riskList && riskList.forEach((riskName) => backtest.riskValidationService.validate(riskName, PARTIAL_METHOD_NAME_DUMP));
    }

    await backtest.partialMarkdownService.dump(symbol, strategyName, path);
  };
}

/**
 * Global singleton instance of PartialUtils.
 * Provides static-like access to partial profit/loss reporting methods.
 *
 * @example
 * ```typescript
 * import { Partial } from "backtest-kit";
 *
 * // Usage same as PartialUtils methods
 * const stats = await Partial.getData("BTCUSDT", "my-strategy");
 * const report = await Partial.getReport("BTCUSDT", "my-strategy");
 * await Partial.dump("BTCUSDT", "my-strategy");
 * ```
 */
export const Partial = new PartialUtils();

import { StrategyName } from "../interfaces/Strategy.interface";
import bt from "../lib";
import { Columns } from "../lib/services/markdown/BreakevenMarkdownService";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";

const BREAKEVEN_METHOD_NAME_GET_DATA = "BreakevenUtils.getData";
const BREAKEVEN_METHOD_NAME_GET_REPORT = "BreakevenUtils.getReport";
const BREAKEVEN_METHOD_NAME_DUMP = "BreakevenUtils.dump";

/**
 * Utility class for accessing breakeven protection reports and statistics.
 *
 * Provides static-like methods (via singleton instance) to retrieve data
 * accumulated by BreakevenMarkdownService from breakeven events.
 *
 * Features:
 * - Statistical data extraction (total breakeven events count)
 * - Markdown report generation with event tables
 * - File export to disk
 *
 * Data source:
 * - BreakevenMarkdownService listens to breakevenSubject
 * - Accumulates events in ReportStorage (max 250 events per symbol-strategy pair)
 * - Events include: timestamp, symbol, strategyName, signalId, position, priceOpen, currentPrice, mode
 *
 * @example
 * ```typescript
 * import { Breakeven } from "./classes/Breakeven";
 *
 * // Get statistical data for BTCUSDT:my-strategy
 * const stats = await Breakeven.getData("BTCUSDT", "my-strategy");
 * console.log(`Total breakeven events: ${stats.totalEvents}`);
 *
 * // Generate markdown report
 * const markdown = await Breakeven.getReport("BTCUSDT", "my-strategy");
 * console.log(markdown); // Formatted table with all events
 *
 * // Export report to file
 * await Breakeven.dump("BTCUSDT", "my-strategy"); // Saves to ./dump/breakeven/BTCUSDT_my-strategy.md
 * await Breakeven.dump("BTCUSDT", "my-strategy", "./custom/path"); // Custom directory
 * ```
 */
export class BreakevenUtils {
  /**
   * Retrieves statistical data from accumulated breakeven events.
   *
   * Delegates to BreakevenMarkdownService.getData() which reads from ReportStorage.
   * Returns aggregated metrics calculated from all breakeven events.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param strategyName - Strategy name (e.g., "my-strategy")
   * @returns Promise resolving to BreakevenStatisticsModel object with counts and event list
   *
   * @example
   * ```typescript
   * const stats = await Breakeven.getData("BTCUSDT", "my-strategy");
   *
   * console.log(`Total breakeven events: ${stats.totalEvents}`);
   *
   * // Iterate through all events
   * for (const event of stats.eventList) {
   *   console.log(`Signal ${event.signalId} reached breakeven at ${event.currentPrice}`);
   * }
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
    bt.loggerService.info(BREAKEVEN_METHOD_NAME_GET_DATA, { symbol, strategyName: context.strategyName });

    bt.strategyValidationService.validate(context.strategyName, BREAKEVEN_METHOD_NAME_GET_DATA);

    {
      const { riskName, riskList } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, BREAKEVEN_METHOD_NAME_GET_DATA);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, BREAKEVEN_METHOD_NAME_GET_DATA));
    }

    return await bt.breakevenMarkdownService.getData(symbol, context.strategyName, context.exchangeName, context.frameName, backtest);
  };

  /**
   * Generates markdown report with all breakeven events for a symbol-strategy pair.
   *
   * Creates formatted table containing:
   * - Symbol
   * - Strategy
   * - Signal ID
   * - Position (LONG/SHORT)
   * - Entry Price
   * - Breakeven Price
   * - Timestamp (ISO 8601)
   * - Mode (Backtest/Live)
   *
   * Also includes summary statistics at the end.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param strategyName - Strategy name (e.g., "my-strategy")
   * @param columns - Optional columns configuration for the report
   * @returns Promise resolving to markdown formatted report string
   *
   * @example
   * ```typescript
   * const markdown = await Breakeven.getReport("BTCUSDT", "my-strategy");
   * console.log(markdown);
   *
   * // Output:
   * // # Breakeven Protection Report: BTCUSDT:my-strategy
   * //
   * // | Symbol | Strategy | Signal ID | Position | Entry Price | Breakeven Price | Timestamp | Mode |
   * // | --- | --- | --- | --- | --- | --- | --- | --- |
   * // | BTCUSDT | my-strategy | abc123 | LONG | 50000.00000000 USD | 50100.00000000 USD | 2024-01-15T10:30:00.000Z | Backtest |
   * //
   * // **Total events:** 1
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
    bt.loggerService.info(BREAKEVEN_METHOD_NAME_GET_REPORT, { symbol, strategyName: context.strategyName });

    bt.strategyValidationService.validate(context.strategyName, BREAKEVEN_METHOD_NAME_GET_REPORT);

    {
      const { riskName, riskList } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, BREAKEVEN_METHOD_NAME_GET_REPORT);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, BREAKEVEN_METHOD_NAME_GET_REPORT));
    }

    return await bt.breakevenMarkdownService.getReport(symbol, context.strategyName, context.exchangeName, context.frameName, backtest, columns);
  };

  /**
   * Generates and saves markdown report to file.
   *
   * Creates directory if it doesn't exist.
   * Filename format: {symbol}_{strategyName}.md (e.g., "BTCUSDT_my-strategy.md")
   *
   * Delegates to BreakevenMarkdownService.dump() which:
   * 1. Generates markdown report via getReport()
   * 2. Creates output directory (recursive mkdir)
   * 3. Writes file with UTF-8 encoding
   * 4. Logs success/failure to console
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param strategyName - Strategy name (e.g., "my-strategy")
   * @param path - Output directory path (default: "./dump/breakeven")
   * @param columns - Optional columns configuration for the report
   * @returns Promise that resolves when file is written
   *
   * @example
   * ```typescript
   * // Save to default path: ./dump/breakeven/BTCUSDT_my-strategy.md
   * await Breakeven.dump("BTCUSDT", "my-strategy");
   *
   * // Save to custom path: ./reports/breakeven/BTCUSDT_my-strategy.md
   * await Breakeven.dump("BTCUSDT", "my-strategy", "./reports/breakeven");
   *
   * // After multiple symbols backtested, export all reports
   * for (const symbol of ["BTCUSDT", "ETHUSDT", "BNBUSDT"]) {
   *   await Breakeven.dump(symbol, "my-strategy", "./backtest-results");
   * }
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
    bt.loggerService.info(BREAKEVEN_METHOD_NAME_DUMP, { symbol, strategyName: context.strategyName, path });

    bt.strategyValidationService.validate(context.strategyName, BREAKEVEN_METHOD_NAME_DUMP);

    {
      const { riskName, riskList } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, BREAKEVEN_METHOD_NAME_DUMP);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, BREAKEVEN_METHOD_NAME_DUMP));
    }

    await bt.breakevenMarkdownService.dump(symbol, context.strategyName, context.exchangeName, context.frameName, backtest, path, columns);
  };
}

/**
 * Global singleton instance of BreakevenUtils.
 * Provides static-like access to breakeven protection reporting methods.
 *
 * @example
 * ```typescript
 * import { Breakeven } from "backtest-kit";
 *
 * // Usage same as BreakevenUtils methods
 * const stats = await Breakeven.getData("BTCUSDT", "my-strategy");
 * const report = await Breakeven.getReport("BTCUSDT", "my-strategy");
 * await Breakeven.dump("BTCUSDT", "my-strategy");
 * ```
 */
export const Breakeven = new BreakevenUtils();

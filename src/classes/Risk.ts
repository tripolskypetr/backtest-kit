import { not } from "functools-kit";
import { IRisk, IRiskCheckArgs, RiskName } from "../interfaces/Risk.interface";
import bt from "../lib";
import { Columns } from "../lib/services/markdown/RiskMarkdownService";
import { StrategyName } from "../interfaces/Strategy.interface";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";

const RISK_METHOD_NAME_GET_DATA = "RiskUtils.getData";
const RISK_METHOD_NAME_GET_REPORT = "RiskUtils.getReport";
const RISK_METHOD_NAME_DUMP = "RiskUtils.dump";

/**
 * Utility class for accessing risk rejection reports and statistics.
 *
 * Provides static-like methods (via singleton instance) to retrieve data
 * accumulated by RiskMarkdownService from risk rejection events.
 *
 * Features:
 * - Statistical data extraction (total rejections count, by symbol, by strategy)
 * - Markdown report generation with event tables
 * - File export to disk
 *
 * Data source:
 * - RiskMarkdownService listens to riskSubject
 * - Accumulates rejection events in ReportStorage (max 250 events per symbol-strategy pair)
 * - Events include: timestamp, symbol, strategyName, position, exchangeName, price, activePositionCount, comment
 *
 * @example
 * ```typescript
 * import { Risk } from "./classes/Risk";
 *
 * // Get statistical data for BTCUSDT:my-strategy
 * const stats = await Risk.getData("BTCUSDT", "my-strategy");
 * console.log(`Total rejections: ${stats.totalRejections}`);
 * console.log(`By symbol:`, stats.bySymbol);
 * console.log(`By strategy:`, stats.byStrategy);
 *
 * // Generate markdown report
 * const markdown = await Risk.getReport("BTCUSDT", "my-strategy");
 * console.log(markdown); // Formatted table with all rejection events
 *
 * // Export report to file
 * await Risk.dump("BTCUSDT", "my-strategy"); // Saves to ./dump/risk/BTCUSDT_my-strategy.md
 * await Risk.dump("BTCUSDT", "my-strategy", "./custom/path"); // Custom directory
 * ```
 */
export class RiskUtils {
  /**
   * Retrieves statistical data from accumulated risk rejection events.
   *
   * Delegates to RiskMarkdownService.getData() which reads from ReportStorage.
   * Returns aggregated metrics calculated from all rejection events.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param strategyName - Strategy name (e.g., "my-strategy")
   * @returns Promise resolving to RiskStatisticsModel object with counts and event list
   *
   * @example
   * ```typescript
   * const stats = await Risk.getData("BTCUSDT", "my-strategy");
   *
   * console.log(`Total rejections: ${stats.totalRejections}`);
   * console.log(`Rejections by symbol:`, stats.bySymbol);
   * console.log(`Rejections by strategy:`, stats.byStrategy);
   *
   * // Iterate through all rejection events
   * for (const event of stats.eventList) {
   *   console.log(`REJECTED: ${event.symbol} - ${event.comment} (${event.activePositionCount} active)`);
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
    bt.loggerService.info(RISK_METHOD_NAME_GET_DATA, {
      symbol,
      strategyName: context.strategyName,
    });

    bt.strategyValidationService.validate(
      context.strategyName,
      RISK_METHOD_NAME_GET_DATA
    );
    bt.exchangeValidationService.validate(
      context.exchangeName,
      RISK_METHOD_NAME_GET_DATA
    );
    context.frameName && bt.frameValidationService.validate(
      context.frameName,
      RISK_METHOD_NAME_GET_DATA
    );

    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName &&
        bt.riskValidationService.validate(riskName, RISK_METHOD_NAME_GET_DATA);
      riskList &&
        riskList.forEach((riskName) =>
          bt.riskValidationService.validate(riskName, RISK_METHOD_NAME_GET_DATA)
        );
      actions &&
        actions.forEach((actionName) =>
          bt.actionValidationService.validate(actionName, RISK_METHOD_NAME_GET_DATA)
        );
    }

    return await bt.riskMarkdownService.getData(symbol, context.strategyName, context.exchangeName, context.frameName, backtest);
  };

  /**
   * Generates markdown report with all risk rejection events for a symbol-strategy pair.
   *
   * Creates formatted table containing:
   * - Symbol
   * - Strategy
   * - Position (LONG/SHORT)
   * - Exchange
   * - Price
   * - Active Positions (at rejection time)
   * - Reason (from validation note)
   * - Timestamp (ISO 8601)
   *
   * Also includes summary statistics at the end (total rejections, by symbol, by strategy).
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param strategyName - Strategy name (e.g., "my-strategy")
   * @param columns - Optional columns configuration for the report
   * @returns Promise resolving to markdown formatted report string
   *
   * @example
   * ```typescript
   * const markdown = await Risk.getReport("BTCUSDT", "my-strategy");
   * console.log(markdown);
   *
   * // Output:
   * // # Risk Rejection Report: BTCUSDT:my-strategy
   * //
   * // | Symbol | Strategy | Position | Exchange | Price | Active Positions | Reason | Timestamp |
   * // | --- | --- | --- | --- | --- | --- | --- | --- |
   * // | BTCUSDT | my-strategy | LONG | binance | 50000.00000000 USD | 3 | Max 3 positions allowed | 2024-01-15T10:30:00.000Z |
   * //
   * // **Total rejections:** 1
   * //
   * // ## Rejections by Symbol
   * // - BTCUSDT: 1
   * //
   * // ## Rejections by Strategy
   * // - my-strategy: 1
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
    bt.loggerService.info(RISK_METHOD_NAME_GET_REPORT, {
      symbol,
      strategyName: context.strategyName,
    });

    bt.strategyValidationService.validate(
      context.strategyName,
      RISK_METHOD_NAME_GET_REPORT
    );
    bt.exchangeValidationService.validate(
      context.exchangeName,
      RISK_METHOD_NAME_GET_REPORT
    );
    context.frameName && bt.frameValidationService.validate(
      context.frameName,
      RISK_METHOD_NAME_GET_REPORT
    );

    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName &&
        bt.riskValidationService.validate(
          riskName,
          RISK_METHOD_NAME_GET_REPORT
        );
      riskList &&
        riskList.forEach((riskName) =>
          bt.riskValidationService.validate(
            riskName,
            RISK_METHOD_NAME_GET_REPORT
          )
        );
      actions &&
        actions.forEach((actionName) =>
          bt.actionValidationService.validate(
            actionName,
            RISK_METHOD_NAME_GET_REPORT
          )
        );
    }

    return await bt.riskMarkdownService.getReport(
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
   * Filename format: {symbol}_{strategyName}.md (e.g., "BTCUSDT_my-strategy.md")
   *
   * Delegates to RiskMarkdownService.dump() which:
   * 1. Generates markdown report via getReport()
   * 2. Creates output directory (recursive mkdir)
   * 3. Writes file with UTF-8 encoding
   * 4. Logs success/failure to console
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param strategyName - Strategy name (e.g., "my-strategy")
   * @param path - Output directory path (default: "./dump/risk")
   * @param columns - Optional columns configuration for the report
   * @returns Promise that resolves when file is written
   *
   * @example
   * ```typescript
   * // Save to default path: ./dump/risk/BTCUSDT_my-strategy.md
   * await Risk.dump("BTCUSDT", "my-strategy");
   *
   * // Save to custom path: ./reports/risk/BTCUSDT_my-strategy.md
   * await Risk.dump("BTCUSDT", "my-strategy", "./reports/risk");
   *
   * // After multiple symbols backtested, export all risk reports
   * for (const symbol of ["BTCUSDT", "ETHUSDT", "BNBUSDT"]) {
   *   await Risk.dump(symbol, "my-strategy", "./backtest-results");
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
    bt.loggerService.info(RISK_METHOD_NAME_DUMP, {
      symbol,
      strategyName: context.strategyName,
      path,
    });

    bt.strategyValidationService.validate(context.strategyName, RISK_METHOD_NAME_DUMP);
    bt.exchangeValidationService.validate(context.exchangeName, RISK_METHOD_NAME_DUMP);
    context.frameName && bt.frameValidationService.validate(context.frameName, RISK_METHOD_NAME_DUMP);

    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName &&
        bt.riskValidationService.validate(riskName, RISK_METHOD_NAME_DUMP);
      riskList &&
        riskList.forEach((riskName) =>
          bt.riskValidationService.validate(riskName, RISK_METHOD_NAME_DUMP)
        );
      actions &&
        actions.forEach((actionName) =>
          bt.actionValidationService.validate(actionName, RISK_METHOD_NAME_DUMP)
        );
    }

    await bt.riskMarkdownService.dump(
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
 * Global singleton instance of RiskUtils.
 * Provides static-like access to risk rejection reporting methods.
 *
 * @example
 * ```typescript
 * import { Risk } from "backtest-kit";
 *
 * // Usage same as RiskUtils methods
 * const stats = await Risk.getData("BTCUSDT", "my-strategy");
 * const report = await Risk.getReport("BTCUSDT", "my-strategy");
 * await Risk.dump("BTCUSDT", "my-strategy");
 * ```
 */
export const Risk = new RiskUtils();

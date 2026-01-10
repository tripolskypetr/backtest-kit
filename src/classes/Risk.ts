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
 * Composite risk management class that combines multiple risk profiles.
 *
 * Implements the Composite pattern to merge multiple IRisk instances into a single
 * risk checker. All risk checks must pass (logical AND) for a signal to be allowed.
 *
 * Features:
 * - Combines multiple risk profiles into one
 * - Signal is allowed only if ALL risks approve (checkSignal returns true for all)
 * - Propagates addSignal/removeSignal to all child risks
 * - Used internally when strategy has both riskName and riskList
 *
 * @example
 * ```typescript
 * import { MergeRisk } from "./classes/Risk";
 *
 * // Combine multiple risk profiles
 * const maxPositionsRisk = new MaxPositionsRisk(3);
 * const correlationRisk = new CorrelationRisk(0.7);
 * const mergedRisk = new MergeRisk([maxPositionsRisk, correlationRisk]);
 *
 * // Check if signal passes all risks
 * const canTrade = await mergedRisk.checkSignal({
 *   symbol: "BTCUSDT",
 *   strategyName: "my-strategy",
 *   position: PositionEnum.LONG,
 *   exchangeName: "binance"
 * });
 *
 * // If canTrade is true, all risks approved
 * // If false, at least one risk rejected the signal
 * ```
 */
export class MergeRisk implements IRisk {
  /**
   * Creates a merged risk profile from multiple risk instances.
   *
   * @param _riskList - Array of IRisk instances to combine
   */
  constructor(readonly _riskList: IRisk[]) {}

  /**
   * Checks if signal passes all combined risk profiles.
   *
   * Executes checkSignal on all child risks in parallel and returns true only
   * if ALL risks approve the signal (logical AND operation).
   *
   * @param params - Risk check parameters (symbol, strategy, position, exchange)
   * @returns Promise resolving to true if all risks approve, false if any risk rejects
   */
  public async checkSignal(params: IRiskCheckArgs): Promise<boolean> {
    bt.loggerService.info("MergeRisk checkSignal", {
      params,
    });
    for (const risk of this._riskList) {
      if (await not(risk.checkSignal(params))) {
        return false;
      }
    }
    return true;
  }

  /**
   * Registers a signal with all child risk profiles.
   *
   * Propagates the addSignal call to all child risks in parallel.
   * Used to track active positions across all risk management systems.
   *
   * @param symbol - Trading pair symbol
   * @param context - Context with strategyName, riskName, exchangeName and frameName
   * @returns Promise that resolves when all risks have registered the signal
   */
  public async addSignal(
    symbol: string,
    context: { strategyName: StrategyName; riskName: RiskName; exchangeName: ExchangeName; frameName: FrameName }
  ) {
    bt.loggerService.info("MergeRisk addSignal", {
      symbol,
      context,
    });
    await Promise.all(
      this._riskList.map(async (risk) => await risk.addSignal(symbol, context))
    );
  }

  /**
   * Removes a signal from all child risk profiles.
   *
   * Propagates the removeSignal call to all child risks in parallel.
   * Used to update risk state when a position closes.
   *
   * @param symbol - Trading pair symbol
   * @param context - Context with strategyName, riskName, exchangeName and frameName
   * @returns Promise that resolves when all risks have removed the signal
   */
  public async removeSignal(
    symbol: string,
    context: { strategyName: StrategyName; riskName: RiskName; exchangeName: ExchangeName; frameName: FrameName }
  ) {
    bt.loggerService.info("MergeRisk removeSignal", {
      symbol,
      context,
    });
    await Promise.all(
      this._riskList.map(
        async (risk) => await risk.removeSignal(symbol, context)
      )
    );
  }
}

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
      const { riskName, riskList } = bt.strategySchemaService.get(context.strategyName);
      riskName &&
        bt.riskValidationService.validate(riskName, RISK_METHOD_NAME_GET_DATA);
      riskList &&
        riskList.forEach((riskName) =>
          bt.riskValidationService.validate(riskName, RISK_METHOD_NAME_GET_DATA)
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
      const { riskName, riskList } = bt.strategySchemaService.get(context.strategyName);
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
      const { riskName, riskList } = bt.strategySchemaService.get(context.strategyName);
      riskName &&
        bt.riskValidationService.validate(riskName, RISK_METHOD_NAME_DUMP);
      riskList &&
        riskList.forEach((riskName) =>
          bt.riskValidationService.validate(riskName, RISK_METHOD_NAME_DUMP)
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

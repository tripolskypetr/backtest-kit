import bt from "../lib";
import { HeatmapStatisticsModel } from "../model/HeatmapStatistics.model";
import { Columns } from "../lib/services/markdown/HeatMarkdownService";
import { StrategyName } from "../interfaces/Strategy.interface";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";

const HEAT_METHOD_NAME_GET_DATA = "HeatUtils.getData";
const HEAT_METHOD_NAME_GET_REPORT = "HeatUtils.getReport";
const HEAT_METHOD_NAME_DUMP = "HeatUtils.dump";

/**
 * Utility class for portfolio heatmap operations.
 *
 * Provides simplified access to heatMarkdownService with logging.
 * Automatically aggregates statistics across all symbols per strategy.
 * Exported as singleton instance for convenient usage.
 *
 * @example
 * ```typescript
 * import { Heat } from "backtest-kit";
 *
 * // Get raw heatmap data for a strategy
 * const stats = await Heat.getData({
 *   strategyName: "my-strategy",
 *   exchangeName: "binance",
 *   frameName: "frame1"
 * });
 * console.log(`Portfolio PNL: ${stats.portfolioTotalPnl}%`);
 *
 * // Generate markdown report
 * const markdown = await Heat.getReport({
 *   strategyName: "my-strategy",
 *   exchangeName: "binance",
 *   frameName: "frame1"
 * });
 * console.log(markdown);
 *
 * // Save to disk
 * await Heat.dump({
 *   strategyName: "my-strategy",
 *   exchangeName: "binance",
 *   frameName: "frame1"
 * }, false, "./reports");
 * ```
 */
export class HeatUtils {
  /**
   * Gets aggregated portfolio heatmap statistics for a strategy.
   *
   * Returns per-symbol breakdown and portfolio-wide metrics.
   * Data is automatically collected from all closed signals for the strategy.
   *
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @returns Promise resolving to heatmap statistics object
   *
   * @example
   * ```typescript
   * const stats = await Heat.getData({
   *   strategyName: "my-strategy",
   *   exchangeName: "binance",
   *   frameName: "frame1"
   * });
   *
   * console.log(`Total symbols: ${stats.totalSymbols}`);
   * console.log(`Portfolio Total PNL: ${stats.portfolioTotalPnl}%`);
   * console.log(`Portfolio Sharpe Ratio: ${stats.portfolioSharpeRatio}`);
   *
   * // Iterate through per-symbol statistics
   * stats.symbols.forEach(row => {
   *   console.log(`${row.symbol}: ${row.totalPnl}% (${row.totalTrades} trades)`);
   * });
   * ```
   */
  public getData = async (
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    },
    backtest = false
  ): Promise<HeatmapStatisticsModel> => {
    bt.loggerService.info(HEAT_METHOD_NAME_GET_DATA, { strategyName: context.strategyName });

    bt.strategyValidationService.validate(context.strategyName, HEAT_METHOD_NAME_GET_DATA);
    bt.exchangeValidationService.validate(context.exchangeName, HEAT_METHOD_NAME_GET_DATA);
    context.frameName && bt.frameValidationService.validate(context.frameName, HEAT_METHOD_NAME_GET_DATA);

    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, HEAT_METHOD_NAME_GET_DATA);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, HEAT_METHOD_NAME_GET_DATA));
      actions && actions.forEach((actionName) => bt.actionValidationService.validate(actionName, HEAT_METHOD_NAME_GET_DATA));
    }

    return await bt.heatMarkdownService.getData(context.exchangeName, context.frameName, backtest);
  };

  /**
   * Generates markdown report with portfolio heatmap table for a strategy.
   *
   * Table includes: Symbol, Total PNL, Sharpe Ratio, Max Drawdown, Trades.
   * Symbols are sorted by Total PNL descending.
   *
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @param columns - Optional columns configuration for the report
   * @returns Promise resolving to markdown formatted report string
   *
   * @example
   * ```typescript
   * const markdown = await Heat.getReport({
   *   strategyName: "my-strategy",
   *   exchangeName: "binance",
   *   frameName: "frame1"
   * });
   * console.log(markdown);
   * // Output:
   * // # Portfolio Heatmap: my-strategy
   * //
   * // **Total Symbols:** 5 | **Portfolio PNL:** +45.3% | **Portfolio Sharpe:** 1.85 | **Total Trades:** 120
   * //
   * // | Symbol | Total PNL | Sharpe | Max DD | Trades |
   * // |--------|-----------|--------|--------|--------|
   * // | BTCUSDT | +15.5% | 2.10 | -2.5% | 45 |
   * // | ETHUSDT | +12.3% | 1.85 | -3.1% | 38 |
   * // ...
   * ```
   */
  public getReport = async (
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    },
    backtest = false,
    columns?: Columns[]
  ): Promise<string> => {
    bt.loggerService.info(HEAT_METHOD_NAME_GET_REPORT, { strategyName: context.strategyName });

    bt.strategyValidationService.validate(context.strategyName, HEAT_METHOD_NAME_GET_REPORT);
    bt.exchangeValidationService.validate(context.exchangeName, HEAT_METHOD_NAME_GET_REPORT);
    context.frameName && bt.frameValidationService.validate(context.frameName, HEAT_METHOD_NAME_GET_REPORT);

    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, HEAT_METHOD_NAME_GET_REPORT);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, HEAT_METHOD_NAME_GET_REPORT));
      actions && actions.forEach((actionName) => bt.actionValidationService.validate(actionName, HEAT_METHOD_NAME_GET_REPORT));
    }

    return await bt.heatMarkdownService.getReport(context.strategyName, context.exchangeName, context.frameName, backtest, columns);
  };

  /**
   * Saves heatmap report to disk for a strategy.
   *
   * Creates directory if it doesn't exist.
   * Default filename: {strategyName}.md
   *
   * @param context - Execution context with strategyName, exchangeName and frameName
   * @param backtest - True if backtest mode, false if live mode (default: false)
   * @param path - Optional directory path to save report (default: "./dump/heatmap")
   * @param columns - Optional columns configuration for the report
   *
   * @example
   * ```typescript
   * // Save to default path: ./dump/heatmap/my-strategy.md
   * await Heat.dump({
   *   strategyName: "my-strategy",
   *   exchangeName: "binance",
   *   frameName: "frame1"
   * });
   *
   * // Save to custom path: ./reports/my-strategy.md
   * await Heat.dump({
   *   strategyName: "my-strategy",
   *   exchangeName: "binance",
   *   frameName: "frame1"
   * }, false, "./reports");
   * ```
   */
  public dump = async (
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    },
    backtest = false,
    path?: string,
    columns?: Columns[]
  ): Promise<void> => {
    bt.loggerService.info(HEAT_METHOD_NAME_DUMP, { strategyName: context.strategyName, path });

    bt.strategyValidationService.validate(context.strategyName, HEAT_METHOD_NAME_DUMP);
    bt.exchangeValidationService.validate(context.exchangeName, HEAT_METHOD_NAME_DUMP);
    context.frameName && bt.frameValidationService.validate(context.frameName, HEAT_METHOD_NAME_DUMP);

    {
      const { riskName, riskList, actions } = bt.strategySchemaService.get(context.strategyName);
      riskName && bt.riskValidationService.validate(riskName, HEAT_METHOD_NAME_DUMP);
      riskList && riskList.forEach((riskName) => bt.riskValidationService.validate(riskName, HEAT_METHOD_NAME_DUMP));
      actions && actions.forEach((actionName) => bt.actionValidationService.validate(actionName, HEAT_METHOD_NAME_DUMP));
    }

    await bt.heatMarkdownService.dump(context.strategyName, context.exchangeName, context.frameName, backtest, path, columns);
  };
}

/**
 * Singleton instance of HeatUtils for convenient heatmap operations.
 *
 * @example
 * ```typescript
 * import { Heat } from "backtest-kit";
 *
 * // Strategy-specific heatmap
 * const stats = await Heat.getData({
 *   strategyName: "my-strategy",
 *   exchangeName: "binance",
 *   frameName: "frame1"
 * });
 * console.log(`Portfolio PNL: ${stats.portfolioTotalPnl}%`);
 * console.log(`Total Symbols: ${stats.totalSymbols}`);
 *
 * // Per-symbol breakdown
 * stats.symbols.forEach(row => {
 *   console.log(`${row.symbol}:`);
 *   console.log(`  Total PNL: ${row.totalPnl}%`);
 *   console.log(`  Sharpe Ratio: ${row.sharpeRatio}`);
 *   console.log(`  Max Drawdown: ${row.maxDrawdown}%`);
 *   console.log(`  Trades: ${row.totalTrades}`);
 * });
 *
 * // Generate and save report
 * await Heat.dump({
 *   strategyName: "my-strategy",
 *   exchangeName: "binance",
 *   frameName: "frame1"
 * }, false, "./reports");
 * ```
 */
export const Heat = new HeatUtils();

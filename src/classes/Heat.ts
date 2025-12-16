import backtest from "../lib";
import { HeatmapStatisticsModel } from "../model/HeatmapStatistics.model";
import { StrategyName } from "../interfaces/Strategy.interface";

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
 * const stats = await Heat.getData("my-strategy");
 * console.log(`Portfolio PNL: ${stats.portfolioTotalPnl}%`);
 *
 * // Generate markdown report
 * const markdown = await Heat.getReport("my-strategy");
 * console.log(markdown);
 *
 * // Save to disk
 * await Heat.dump("my-strategy", "./reports");
 * ```
 */
export class HeatUtils {
  /**
   * Gets aggregated portfolio heatmap statistics for a strategy.
   *
   * Returns per-symbol breakdown and portfolio-wide metrics.
   * Data is automatically collected from all closed signals for the strategy.
   *
   * @param strategyName - Strategy name to get heatmap data for
   * @returns Promise resolving to heatmap statistics object
   *
   * @example
   * ```typescript
   * const stats = await Heat.getData("my-strategy");
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
  public getData = async (strategyName: StrategyName): Promise<HeatmapStatisticsModel> => {
    backtest.loggerService.info(HEAT_METHOD_NAME_GET_DATA, { strategyName });

    backtest.strategyValidationService.validate(strategyName, HEAT_METHOD_NAME_GET_DATA);

    {
      const { riskName, riskList } = backtest.strategySchemaService.get(strategyName);
      riskName && backtest.riskValidationService.validate(riskName, HEAT_METHOD_NAME_GET_DATA);
      riskList && riskList.forEach((riskName) => backtest.riskValidationService.validate(riskName, HEAT_METHOD_NAME_GET_DATA));
    }

    return await backtest.heatMarkdownService.getData(strategyName);
  };

  /**
   * Generates markdown report with portfolio heatmap table for a strategy.
   *
   * Table includes: Symbol, Total PNL, Sharpe Ratio, Max Drawdown, Trades.
   * Symbols are sorted by Total PNL descending.
   *
   * @param strategyName - Strategy name to generate heatmap report for
   * @returns Promise resolving to markdown formatted report string
   *
   * @example
   * ```typescript
   * const markdown = await Heat.getReport("my-strategy");
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
  public getReport = async (strategyName: StrategyName): Promise<string> => {
    backtest.loggerService.info(HEAT_METHOD_NAME_GET_REPORT, { strategyName });

    backtest.strategyValidationService.validate(strategyName, HEAT_METHOD_NAME_GET_REPORT);

    {
      const { riskName, riskList } = backtest.strategySchemaService.get(strategyName);
      riskName && backtest.riskValidationService.validate(riskName, HEAT_METHOD_NAME_GET_REPORT);
      riskList && riskList.forEach((riskName) => backtest.riskValidationService.validate(riskName, HEAT_METHOD_NAME_GET_REPORT));
    }

    return await backtest.heatMarkdownService.getReport(strategyName);
  };

  /**
   * Saves heatmap report to disk for a strategy.
   *
   * Creates directory if it doesn't exist.
   * Default filename: {strategyName}.md
   *
   * @param strategyName - Strategy name to save heatmap report for
   * @param path - Optional directory path to save report (default: "./dump/heatmap")
   *
   * @example
   * ```typescript
   * // Save to default path: ./dump/heatmap/my-strategy.md
   * await Heat.dump("my-strategy");
   *
   * // Save to custom path: ./reports/my-strategy.md
   * await Heat.dump("my-strategy", "./reports");
   * ```
   */
  public dump = async (strategyName: StrategyName, path?: string): Promise<void> => {
    backtest.loggerService.info(HEAT_METHOD_NAME_DUMP, { strategyName, path });

    backtest.strategyValidationService.validate(strategyName, HEAT_METHOD_NAME_DUMP);

    {
      const { riskName, riskList } = backtest.strategySchemaService.get(strategyName);
      riskName && backtest.riskValidationService.validate(riskName, HEAT_METHOD_NAME_DUMP);
      riskList && riskList.forEach((riskName) => backtest.riskValidationService.validate(riskName, HEAT_METHOD_NAME_DUMP));
    }

    await backtest.heatMarkdownService.dump(strategyName, path);
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
 * const stats = await Heat.getData("my-strategy");
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
 * await Heat.dump("my-strategy", "./reports");
 * ```
 */
export const Heat = new HeatUtils();

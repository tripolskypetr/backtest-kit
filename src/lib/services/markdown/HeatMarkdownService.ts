import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import {
  IStrategyTickResult,
  IStrategyTickResultClosed,
  StrategyName,
} from "../../../interfaces/Strategy.interface";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { memoize, singleshot, str } from "functools-kit";
import { signalEmitter } from "../../../config/emitters";
import { IHeatmapRow } from "../../../interfaces/Heatmap.interface";
import { HeatmapStatisticsModel } from "../../../model/HeatmapStatistics.model";
import { ColumnModel } from "../../../model/Column.model";
import { COLUMN_CONFIG } from "../../../config/columns";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";

/**
 * Type alias for column configuration used in heatmap markdown reports.
 * 
 * Represents a column model specifically designed to format and display
 * per-symbol portfolio statistics in markdown tables.
 * 
 * @typeParam IHeatmapRow - The heatmap row data type containing aggregated
 *   statistics per symbol (PNL, Sharpe Ratio, Max Drawdown, trade counts)
 * 
 * @example
 * ```typescript
 * // Column to display symbol name
 * const symbolColumn: Columns = {
 *   key: "symbol",
 *   label: "Symbol",
 *   format: (row) => row.symbol,
 *   isVisible: () => true
 * };
 * 
 * // Column to display portfolio PNL
 * const pnlColumn: Columns = {
 *   key: "totalPnl",
 *   label: "Total PNL %",
 *   format: (row) => row.totalPnl !== null ? row.totalPnl.toFixed(2) + '%' : 'N/A',
 *   isVisible: () => true
 * };
 * ```
 * 
 * @see ColumnModel for the base interface
 * @see IHeatmapRow for the row data structure
 */
export type Columns = ColumnModel<IHeatmapRow>;

/**
 * Creates a unique key for memoizing HeatmapStorage instances.
 * Key format: "exchangeName:frameName:backtest" or "exchangeName:live"
 * @param exchangeName - Exchange name
 * @param frameName - Frame name
 * @param backtest - Whether running in backtest mode
 * @returns Unique string key for memoization
 */
const CREATE_KEY_FN = (
  exchangeName: ExchangeName,
  frameName: FrameName,
  backtest: boolean
): string => {
  const parts = [exchangeName];
  if (frameName) parts.push(frameName);
  parts.push(backtest ? "backtest" : "live");
  return parts.join(":");
};

const HEATMAP_METHOD_NAME_GET_DATA = "HeatMarkdownService.getData";
const HEATMAP_METHOD_NAME_GET_REPORT = "HeatMarkdownService.getReport";
const HEATMAP_METHOD_NAME_DUMP = "HeatMarkdownService.dump";
const HEATMAP_METHOD_NAME_CLEAR = "HeatMarkdownService.clear";

/**
 * Checks if a value is unsafe for display (not a number, NaN, or Infinity).
 *
 * @param value - Value to check
 * @returns true if value is unsafe, false otherwise
 */
function isUnsafe(value: number | null): boolean {
  if (typeof value !== "number") {
    return true;
  }
  if (isNaN(value)) {
    return true;
  }
  if (!isFinite(value)) {
    return true;
  }
  return false;
}

/** Maximum number of signals to store per symbol in heatmap reports */
const MAX_EVENTS = 250;

/**
 * Storage class for accumulating closed signals per strategy and generating heatmap.
 * Maintains symbol-level statistics and provides portfolio-wide metrics.
 */
class HeatmapStorage {
  /** Internal storage of closed signals per symbol */
  private symbolData: Map<string, IStrategyTickResultClosed[]> = new Map();

  /**
   * Adds a closed signal to the storage.
   *
   * @param data - Closed signal data with PNL and symbol
   */
  public addSignal(data: IStrategyTickResultClosed) {
    const { symbol } = data;

    if (!this.symbolData.has(symbol)) {
      this.symbolData.set(symbol, []);
    }

    const signals = this.symbolData.get(symbol)!;
    signals.unshift(data);

    // Trim queue if exceeded MAX_EVENTS per symbol
    if (signals.length > MAX_EVENTS) {
      signals.pop();
    }
  }


  /**
   * Calculates statistics for a single symbol.
   *
   * @param symbol - Trading pair symbol
   * @param signals - Array of closed signals for this symbol
   * @returns Heatmap row with aggregated statistics
   */
  private calculateSymbolStats(
    symbol: string,
    signals: IStrategyTickResultClosed[]
  ): IHeatmapRow {
    const totalTrades = signals.length;
    const winCount = signals.filter((s) => s.pnl.pnlPercentage > 0).length;
    const lossCount = signals.filter((s) => s.pnl.pnlPercentage < 0).length;

    // Calculate win rate
    let winRate: number | null = null;
    if (totalTrades > 0) {
      winRate = (winCount / totalTrades) * 100;
    }

    // Calculate total PNL
    let totalPnl: number | null = null;
    if (signals.length > 0) {
      totalPnl = signals.reduce((acc, s) => acc + s.pnl.pnlPercentage, 0);
    }

    // Calculate average PNL
    let avgPnl: number | null = null;
    if (signals.length > 0) {
      avgPnl = totalPnl! / signals.length;
    }

    // Calculate standard deviation
    let stdDev: number | null = null;
    if (signals.length > 1 && avgPnl !== null) {
      const variance =
        signals.reduce(
          (acc, s) => acc + Math.pow(s.pnl.pnlPercentage - avgPnl!, 2),
          0
        ) / signals.length;
      stdDev = Math.sqrt(variance);
    }

    // Calculate Sharpe Ratio
    let sharpeRatio: number | null = null;
    if (avgPnl !== null && stdDev !== null && stdDev !== 0) {
      sharpeRatio = avgPnl / stdDev;
    }

    // Calculate Maximum Drawdown
    let maxDrawdown: number | null = null;
    if (signals.length > 0) {
      let peak = 0;
      let currentDrawdown = 0;
      let maxDD = 0;

      for (const signal of signals) {
        peak += signal.pnl.pnlPercentage;
        if (peak > 0) {
          currentDrawdown = 0;
        } else {
          currentDrawdown = Math.abs(peak);
          if (currentDrawdown > maxDD) {
            maxDD = currentDrawdown;
          }
        }
      }

      maxDrawdown = maxDD;
    }

    // Calculate Profit Factor
    let profitFactor: number | null = null;
    if (winCount > 0 && lossCount > 0) {
      const sumWins = signals
        .filter((s) => s.pnl.pnlPercentage > 0)
        .reduce((acc, s) => acc + s.pnl.pnlPercentage, 0);
      const sumLosses = Math.abs(
        signals
          .filter((s) => s.pnl.pnlPercentage < 0)
          .reduce((acc, s) => acc + s.pnl.pnlPercentage, 0)
      );
      if (sumLosses > 0) {
        profitFactor = sumWins / sumLosses;
      }
    }

    // Calculate Average Win / Average Loss
    let avgWin: number | null = null;
    let avgLoss: number | null = null;
    if (winCount > 0) {
      avgWin =
        signals
          .filter((s) => s.pnl.pnlPercentage > 0)
          .reduce((acc, s) => acc + s.pnl.pnlPercentage, 0) / winCount;
    }
    if (lossCount > 0) {
      avgLoss =
        signals
          .filter((s) => s.pnl.pnlPercentage < 0)
          .reduce((acc, s) => acc + s.pnl.pnlPercentage, 0) / lossCount;
    }

    // Calculate Win/Loss Streaks
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let currentWinStreak = 0;
    let currentLossStreak = 0;

    for (const signal of signals) {
      if (signal.pnl.pnlPercentage > 0) {
        currentWinStreak++;
        currentLossStreak = 0;
        if (currentWinStreak > maxWinStreak) {
          maxWinStreak = currentWinStreak;
        }
      } else if (signal.pnl.pnlPercentage < 0) {
        currentLossStreak++;
        currentWinStreak = 0;
        if (currentLossStreak > maxLossStreak) {
          maxLossStreak = currentLossStreak;
        }
      }
    }

    // Calculate Expectancy
    let expectancy: number | null = null;
    if (winRate !== null && avgWin !== null && avgLoss !== null) {
      const lossRate = 100 - winRate;
      expectancy = (winRate / 100) * avgWin + (lossRate / 100) * avgLoss;
    }

    // Apply safe math checks
    if (isUnsafe(winRate)) winRate = null;
    if (isUnsafe(totalPnl)) totalPnl = null;
    if (isUnsafe(avgPnl)) avgPnl = null;
    if (isUnsafe(stdDev)) stdDev = null;
    if (isUnsafe(sharpeRatio)) sharpeRatio = null;
    if (isUnsafe(maxDrawdown)) maxDrawdown = null;
    if (isUnsafe(profitFactor)) profitFactor = null;
    if (isUnsafe(avgWin)) avgWin = null;
    if (isUnsafe(avgLoss)) avgLoss = null;
    if (isUnsafe(expectancy)) expectancy = null;

    return {
      symbol,
      totalPnl,
      sharpeRatio,
      maxDrawdown,
      totalTrades,
      winCount,
      lossCount,
      winRate,
      avgPnl,
      stdDev,
      profitFactor,
      avgWin,
      avgLoss,
      maxWinStreak,
      maxLossStreak,
      expectancy,
    };
  }

  /**
   * Gets aggregated portfolio heatmap statistics (Controller).
   *
   * @returns Promise resolving to heatmap statistics with per-symbol and portfolio-wide metrics
   */
  public async getData(): Promise<HeatmapStatisticsModel> {
    const symbols: IHeatmapRow[] = [];

    // Calculate per-symbol statistics
    for (const [symbol, signals] of this.symbolData.entries()) {
      const row = this.calculateSymbolStats(symbol, signals);
      symbols.push(row);
    }

    // Sort by Sharpe Ratio descending (best performers first, nulls last)
    symbols.sort((a, b) => {
      if (a.sharpeRatio === null && b.sharpeRatio === null) return 0;
      if (a.sharpeRatio === null) return 1;
      if (b.sharpeRatio === null) return -1;
      return b.sharpeRatio - a.sharpeRatio;
    });

    // Calculate portfolio-wide metrics
    const totalSymbols = symbols.length;
    let portfolioTotalPnl: number | null = null;
    let portfolioTotalTrades = 0;

    if (symbols.length > 0) {
      portfolioTotalPnl = symbols.reduce(
        (acc, s) => acc + (s.totalPnl || 0),
        0
      );
      portfolioTotalTrades = symbols.reduce((acc, s) => acc + s.totalTrades, 0);
    }

    // Calculate portfolio Sharpe Ratio (weighted by number of trades)
    let portfolioSharpeRatio: number | null = null;
    const validSharpes = symbols.filter((s) => s.sharpeRatio !== null);
    if (validSharpes.length > 0 && portfolioTotalTrades > 0) {
      const weightedSum = validSharpes.reduce(
        (acc, s) => acc + s.sharpeRatio! * s.totalTrades,
        0
      );
      portfolioSharpeRatio = weightedSum / portfolioTotalTrades;
    }

    // Apply safe math
    if (isUnsafe(portfolioTotalPnl)) portfolioTotalPnl = null;
    if (isUnsafe(portfolioSharpeRatio)) portfolioSharpeRatio = null;

    return {
      symbols,
      totalSymbols,
      portfolioTotalPnl,
      portfolioSharpeRatio,
      portfolioTotalTrades,
    };
  }

  /**
   * Generates markdown report with portfolio heatmap table (View).
   *
   * @param strategyName - Strategy name for report title
   * @param columns - Column configuration for formatting the table
   * @returns Promise resolving to markdown formatted report string
   */
  public async getReport(
    strategyName: StrategyName,
    columns: Columns[] = COLUMN_CONFIG.heat_columns
  ): Promise<string> {
    const data = await this.getData();

    if (data.symbols.length === 0) {
      return [
        `# Portfolio Heatmap: ${strategyName}`,
        "",
        "*No data available*"
      ].join("\n");
    }

    const visibleColumns = [];
    for (const col of columns) {
      if (await col.isVisible()) {
        visibleColumns.push(col);
      }
    }
    const header = visibleColumns.map((col) => col.label);
    const separator = visibleColumns.map(() => "---");
    const rows = await Promise.all(
      data.symbols.map(async (row, index) =>
        Promise.all(visibleColumns.map((col) => col.format(row, index)))
      )
    );

    const tableData = [header, separator, ...rows];
    const table = tableData.map((row) => `| ${row.join(" | ")} |`).join("\n");

    return [
      `# Portfolio Heatmap: ${strategyName}`,
      "",
      `**Total Symbols:** ${data.totalSymbols} | **Portfolio PNL:** ${data.portfolioTotalPnl !== null ? str(data.portfolioTotalPnl, "%") : "N/A"} | **Portfolio Sharpe:** ${data.portfolioSharpeRatio !== null ? str(data.portfolioSharpeRatio) : "N/A"} | **Total Trades:** ${data.portfolioTotalTrades}`,
      "",
      table
    ].join("\n");
  }

  /**
   * Saves heatmap report to disk.
   *
   * @param strategyName - Strategy name for filename
   * @param path - Directory path to save report (default: "./dump/heatmap")
   * @param columns - Column configuration for formatting the table
   */
  public async dump(
    strategyName: StrategyName,
    path = "./dump/heatmap",
    columns: Columns[] = COLUMN_CONFIG.heat_columns
  ): Promise<void> {
    const markdown = await this.getReport(strategyName, columns);

    try {
      const dir = join(process.cwd(), path);
      await mkdir(dir, { recursive: true });

      const filename = `${strategyName}.md`;
      const filepath = join(dir, filename);

      await writeFile(filepath, markdown, "utf-8");
      console.log(`Heatmap report saved: ${filepath}`);
    } catch (error) {
      console.error(`Failed to save heatmap report:`, error);
    }
  }
}

/**
 * Portfolio Heatmap Markdown Service.
 *
 * Subscribes to signalEmitter and aggregates statistics across all symbols per strategy.
 * Provides portfolio-wide metrics and per-symbol breakdowns.
 *
 * Features:
 * - Real-time aggregation of closed signals
 * - Per-symbol statistics (Total PNL, Sharpe Ratio, Max Drawdown, Trades)
 * - Portfolio-wide aggregated metrics per strategy
 * - Markdown table report generation
 * - Safe math (handles NaN/Infinity gracefully)
 * - Strategy-based navigation using memoized storage
 *
 * @example
 * ```typescript
 * const service = new HeatMarkdownService();
 *
 * // Service automatically tracks all closed signals per strategy
 * const stats = await service.getData("my-strategy");
 * console.log(`Portfolio Total PNL: ${stats.portfolioTotalPnl}%`);
 *
 * // Generate and save report
 * await service.dump("my-strategy", "./reports");
 * ```
 */
export class HeatMarkdownService {
  /** Logger service for debug output */
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * Memoized function to get or create HeatmapStorage for exchange, frame and backtest mode.
   * Each exchangeName + frameName + backtest mode combination gets its own isolated heatmap storage instance.
   */
  private getStorage = memoize<(exchangeName: ExchangeName, frameName: FrameName, backtest: boolean) => HeatmapStorage>(
    ([exchangeName, frameName, backtest]) => CREATE_KEY_FN(exchangeName, frameName, backtest),
    () => new HeatmapStorage()
  );

  /**
   * Subscribes to signal emitter to receive tick events.
   * Protected against multiple subscriptions.
   * Returns an unsubscribe function to stop receiving events.
   *
   * @example
   * ```typescript
   * const service = new HeatMarkdownService();
   * const unsubscribe = service.subscribe();
   * // ... later
   * unsubscribe();
   * ```
   */
  public subscribe = singleshot(() => {
    this.loggerService.log("heatMarkdownService init");
    const unsubscribe = signalEmitter.subscribe(this.tick);
    return () => {
      this.subscribe.clear();
      this.clear();
      unsubscribe();
    }
  });

  /**
   * Unsubscribes from signal emitter to stop receiving tick events.
   * Calls the unsubscribe function returned by subscribe().
   * If not subscribed, does nothing.
   *
   * @example
   * ```typescript
   * const service = new HeatMarkdownService();
   * service.subscribe();
   * // ... later
   * service.unsubscribe();
   * ```
   */
  public unsubscribe = async () => {
    this.loggerService.log("heatMarkdownService unsubscribe");
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };

  /**
   * Processes tick events and accumulates closed signals.
   * Should be called from signal emitter subscription.
   *
   * Only processes closed signals - opened signals are ignored.
   *
   * @param data - Tick result from strategy execution (closed signals only)
   */
  private tick = async (data: IStrategyTickResult) => {
    this.loggerService.log("heatMarkdownService tick", {
      data,
    });

    if (data.action !== "closed") {
      return;
    }

    const storage = this.getStorage(data.exchangeName, data.frameName, data.backtest);
    storage.addSignal(data);
  };

  /**
   * Gets aggregated portfolio heatmap statistics.
   *
   * @param exchangeName - Exchange name
   * @param frameName - Frame name
   * @param backtest - True if backtest mode, false if live mode
   * @returns Promise resolving to heatmap statistics with per-symbol and portfolio-wide metrics
   *
   * @example
   * ```typescript
   * const service = new HeatMarkdownService();
   * const stats = await service.getData("binance", "frame1", true);
   *
   * console.log(`Total symbols: ${stats.totalSymbols}`);
   * console.log(`Portfolio PNL: ${stats.portfolioTotalPnl}%`);
   *
   * stats.symbols.forEach(row => {
   *   console.log(`${row.symbol}: ${row.totalPnl}% (${row.totalTrades} trades)`);
   * });
   * ```
   */
  public getData = async (
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean
  ): Promise<HeatmapStatisticsModel> => {
    this.loggerService.log(HEATMAP_METHOD_NAME_GET_DATA, {
      exchangeName,
      frameName,
      backtest,
    });
    if (!this.subscribe.hasValue()) {
      throw new Error("HeatMarkdownService not initialized. Call subscribe() before getting data.");
    }
    const storage = this.getStorage(exchangeName, frameName, backtest);
    return storage.getData();
  };

  /**
   * Generates markdown report with portfolio heatmap table.
   *
   * @param strategyName - Strategy name for report title
   * @param exchangeName - Exchange name
   * @param frameName - Frame name
   * @param backtest - True if backtest mode, false if live mode
   * @param columns - Column configuration for formatting the table
   * @returns Promise resolving to markdown formatted report string
   *
   * @example
   * ```typescript
   * const service = new HeatMarkdownService();
   * const markdown = await service.getReport("my-strategy", "binance", "frame1", true);
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
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
    columns: Columns[] = COLUMN_CONFIG.heat_columns
  ): Promise<string> => {
    this.loggerService.log(HEATMAP_METHOD_NAME_GET_REPORT, {
      strategyName,
      exchangeName,
      frameName,
      backtest,
    });
    if (!this.subscribe.hasValue()) {
      throw new Error("HeatMarkdownService not initialized. Call subscribe() before generating reports.");
    }
    const storage = this.getStorage(exchangeName, frameName, backtest);
    return storage.getReport(strategyName, columns);
  };

  /**
   * Saves heatmap report to disk.
   *
   * Creates directory if it doesn't exist.
   * Default filename: {strategyName}.md
   *
   * @param strategyName - Strategy name for report filename
   * @param exchangeName - Exchange name
   * @param frameName - Frame name
   * @param backtest - True if backtest mode, false if live mode
   * @param path - Optional directory path to save report (default: "./dump/heatmap")
   * @param columns - Column configuration for formatting the table
   *
   * @example
   * ```typescript
   * const service = new HeatMarkdownService();
   *
   * // Save to default path: ./dump/heatmap/my-strategy.md
   * await service.dump("my-strategy", "binance", "frame1", true);
   *
   * // Save to custom path: ./reports/my-strategy.md
   * await service.dump("my-strategy", "binance", "frame1", true, "./reports");
   * ```
   */
  public dump = async (
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
    path = "./dump/heatmap",
    columns: Columns[] = COLUMN_CONFIG.heat_columns
  ): Promise<void> => {
    this.loggerService.log(HEATMAP_METHOD_NAME_DUMP, {
      strategyName,
      exchangeName,
      frameName,
      backtest,
      path,
    });
    if (!this.subscribe.hasValue()) {
      throw new Error("HeatMarkdownService not initialized. Call subscribe() before dumping reports.");
    }
    const storage = this.getStorage(exchangeName, frameName, backtest);
    await storage.dump(strategyName, path, columns);
  };

  /**
   * Clears accumulated heatmap data from storage.
   * If payload is provided, clears only that exchangeName+frameName+backtest combination's data.
   * If payload is omitted, clears all data.
   *
   * @param payload - Optional payload with exchangeName, frameName, backtest to clear specific data
   *
   * @example
   * ```typescript
   * const service = new HeatMarkdownService();
   *
   * // Clear specific exchange+frame+backtest data
   * await service.clear({ exchangeName: "binance", frameName: "frame1", backtest: true });
   *
   * // Clear all data
   * await service.clear();
   * ```
   */
  public clear = async (payload?: { exchangeName: ExchangeName; frameName: FrameName; backtest: boolean }) => {
    this.loggerService.log(HEATMAP_METHOD_NAME_CLEAR, {
      payload,
    });
    if (payload) {
      const key = CREATE_KEY_FN(payload.exchangeName, payload.frameName, payload.backtest);
      this.getStorage.clear(key);
    } else {
      this.getStorage.clear();
    }
  };

}

export default HeatMarkdownService;

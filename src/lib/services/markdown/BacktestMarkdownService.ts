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
import { memoize, singleshot } from "functools-kit";
import { signalBacktestEmitter } from "../../../config/emitters";
import { BacktestStatisticsModel } from "../../../model/BacktestStatistics.model";
import { ColumnModel } from "../../../model/Column.model";
import { COLUMN_CONFIG } from "../../../config/columns";

/**
 * Type alias for column configuration used in backtest markdown reports.
 * 
 * Represents a column model specifically designed to format and display
 * closed backtest signals in markdown tables.
 * 
 * @typeParam IStrategyTickResultClosed - The closed signal data type containing
 *   PNL information, close reason, timestamps, and other trade details
 * 
 * @example
 * ```typescript
 * // Column to display signal ID
 * const signalIdColumn: Columns = {
 *   key: "signalId",
 *   label: "Signal ID",
 *   format: (signal) => signal.signal.id,
 *   isVisible: () => true
 * };
 * 
 * // Column to display PNL percentage
 * const pnlColumn: Columns = {
 *   key: "pnl",
 *   label: "PNL %",
 *   format: (signal) => `${signal.pnl.pnlPercentage.toFixed(2)}%`,
 *   isVisible: () => true
 * };
 * ```
 * 
 * @see ColumnModel for the base interface
 * @see IStrategyTickResultClosed for the signal data structure
 */
export type Columns = ColumnModel<IStrategyTickResultClosed>;

/**
 * Creates a unique key for memoizing ReportStorage instances.
 * Key format: "symbol:strategyName:exchangeName:frameName:backtest" or "symbol:strategyName:exchangeName:live"
 * @param symbol - Trading pair symbol
 * @param strategyName - Name of the strategy
 * @param exchangeName - Exchange name
 * @param frameName - Frame name
 * @param backtest - Whether running in backtest mode
 * @returns Unique string key for memoization
 */
const CREATE_KEY_FN = (
  symbol: string,
  strategyName: StrategyName,
  exchangeName: string,
  frameName: string,
  backtest: boolean
): string => {
  const parts = [symbol, strategyName, exchangeName];
  if (frameName) parts.push(frameName);
  parts.push(backtest ? "backtest" : "live");
  return parts.join(":");
};

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

/** Maximum number of signals to store in backtest reports */
const MAX_EVENTS = 250;

/**
 * Storage class for accumulating closed signals per strategy.
 * Maintains a list of all closed signals and provides methods to generate reports.
 */
class ReportStorage {
  /** Internal list of all closed signals for this strategy */
  private _signalList: IStrategyTickResultClosed[] = [];

  /**
   * Adds a closed signal to the storage.
   *
   * @param data - Closed signal data with PNL and close reason
   */
  public addSignal(data: IStrategyTickResultClosed) {
    this._signalList.unshift(data);

    // Trim queue if exceeded MAX_EVENTS
    if (this._signalList.length > MAX_EVENTS) {
      this._signalList.pop();
    }
  }

  /**
   * Calculates statistical data from closed signals (Controller).
   * Returns null for any unsafe numeric values (NaN, Infinity, etc).
   *
   * @returns Statistical data (empty object if no signals)
   */
  public async getData(): Promise<BacktestStatisticsModel> {
    if (this._signalList.length === 0) {
      return {
        signalList: [],
        totalSignals: 0,
        winCount: 0,
        lossCount: 0,
        winRate: null,
        avgPnl: null,
        totalPnl: null,
        stdDev: null,
        sharpeRatio: null,
        annualizedSharpeRatio: null,
        certaintyRatio: null,
        expectedYearlyReturns: null,
      };
    }

    const totalSignals = this._signalList.length;
    const winCount = this._signalList.filter((s) => s.pnl.pnlPercentage > 0).length;
    const lossCount = this._signalList.filter((s) => s.pnl.pnlPercentage < 0).length;

    // Calculate basic statistics
    const avgPnl = this._signalList.reduce((sum, s) => sum + s.pnl.pnlPercentage, 0) / totalSignals;
    const totalPnl = this._signalList.reduce((sum, s) => sum + s.pnl.pnlPercentage, 0);
    const winRate = (winCount / totalSignals) * 100;

    // Calculate Sharpe Ratio (risk-free rate = 0)
    const returns = this._signalList.map((s) => s.pnl.pnlPercentage);
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgPnl, 2), 0) / totalSignals;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? avgPnl / stdDev : 0;
    const annualizedSharpeRatio = sharpeRatio * Math.sqrt(365);

    // Calculate Certainty Ratio
    const wins = this._signalList.filter((s) => s.pnl.pnlPercentage > 0);
    const losses = this._signalList.filter((s) => s.pnl.pnlPercentage < 0);
    const avgWin = wins.length > 0
      ? wins.reduce((sum, s) => sum + s.pnl.pnlPercentage, 0) / wins.length
      : 0;
    const avgLoss = losses.length > 0
      ? losses.reduce((sum, s) => sum + s.pnl.pnlPercentage, 0) / losses.length
      : 0;
    const certaintyRatio = avgLoss < 0 ? avgWin / Math.abs(avgLoss) : 0;

    // Calculate Expected Yearly Returns
    const avgDurationMs = this._signalList.reduce(
      (sum, s) => sum + (s.closeTimestamp - s.signal.pendingAt),
      0
    ) / totalSignals;
    const avgDurationDays = avgDurationMs / (1000 * 60 * 60 * 24);
    const tradesPerYear = avgDurationDays > 0 ? 365 / avgDurationDays : 0;
    const expectedYearlyReturns = avgPnl * tradesPerYear;

    return {
      signalList: this._signalList,
      totalSignals,
      winCount,
      lossCount,
      winRate: isUnsafe(winRate) ? null : winRate,
      avgPnl: isUnsafe(avgPnl) ? null : avgPnl,
      totalPnl: isUnsafe(totalPnl) ? null : totalPnl,
      stdDev: isUnsafe(stdDev) ? null : stdDev,
      sharpeRatio: isUnsafe(sharpeRatio) ? null : sharpeRatio,
      annualizedSharpeRatio: isUnsafe(annualizedSharpeRatio) ? null : annualizedSharpeRatio,
      certaintyRatio: isUnsafe(certaintyRatio) ? null : certaintyRatio,
      expectedYearlyReturns: isUnsafe(expectedYearlyReturns) ? null : expectedYearlyReturns,
    };
  }

  /**
   * Generates markdown report with all closed signals for a strategy (View).
   *
   * @param strategyName - Strategy name
   * @param columns - Column configuration for formatting the table
   * @returns Markdown formatted report with all signals
   */
  public async getReport(
    strategyName: StrategyName,
    columns: Columns[] = COLUMN_CONFIG.backtest_columns
  ): Promise<string> {
    const stats = await this.getData();

    if (stats.totalSignals === 0) {
      return [
        `# Backtest Report: ${strategyName}`,
        "",
        "No signals closed yet."
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
      this._signalList.map(async (closedSignal, index) =>
        Promise.all(visibleColumns.map((col) => col.format(closedSignal, index)))
      )
    );

    const tableData = [header, separator, ...rows];
    const table = tableData.map(row => `| ${row.join(" | ")} |`).join("\n");

    return [
      `# Backtest Report: ${strategyName}`,
      "",
      table,
      "",
      `**Total signals:** ${stats.totalSignals}`,
      `**Closed signals:** ${stats.totalSignals}`,
      `**Win rate:** ${stats.winRate === null ? "N/A" : `${stats.winRate.toFixed(2)}% (${stats.winCount}W / ${stats.lossCount}L) (higher is better)`}`,
      `**Average PNL:** ${stats.avgPnl === null ? "N/A" : `${stats.avgPnl > 0 ? "+" : ""}${stats.avgPnl.toFixed(2)}% (higher is better)`}`,
      `**Total PNL:** ${stats.totalPnl === null ? "N/A" : `${stats.totalPnl > 0 ? "+" : ""}${stats.totalPnl.toFixed(2)}% (higher is better)`}`,
      `**Standard Deviation:** ${stats.stdDev === null ? "N/A" : `${stats.stdDev.toFixed(3)}% (lower is better)`}`,
      `**Sharpe Ratio:** ${stats.sharpeRatio === null ? "N/A" : `${stats.sharpeRatio.toFixed(3)} (higher is better)`}`,
      `**Annualized Sharpe Ratio:** ${stats.annualizedSharpeRatio === null ? "N/A" : `${stats.annualizedSharpeRatio.toFixed(3)} (higher is better)`}`,
      `**Certainty Ratio:** ${stats.certaintyRatio === null ? "N/A" : `${stats.certaintyRatio.toFixed(3)} (higher is better)`}`,
      `**Expected Yearly Returns:** ${stats.expectedYearlyReturns === null ? "N/A" : `${stats.expectedYearlyReturns > 0 ? "+" : ""}${stats.expectedYearlyReturns.toFixed(2)}% (higher is better)`}`,
    ].join("\n");
  }

  /**
   * Saves strategy report to disk.
   *
   * @param strategyName - Strategy name
   * @param path - Directory path to save report (default: "./dump/backtest")
   * @param columns - Column configuration for formatting the table
   */
  public async dump(
    strategyName: StrategyName,
    path = "./dump/backtest",
    columns: Columns[] = COLUMN_CONFIG.backtest_columns
  ): Promise<void> {
    const markdown = await this.getReport(strategyName, columns);

    try {
      const dir = join(process.cwd(), path);
      await mkdir(dir, { recursive: true });

      const filename = `${strategyName}.md`;
      const filepath = join(dir, filename);

      await writeFile(filepath, markdown, "utf-8");
      console.log(`Backtest report saved: ${filepath}`);
    } catch (error) {
      console.error(`Failed to save markdown report:`, error);
    }
  }
}

/**
 * Service for generating and saving backtest markdown reports.
 *
 * Features:
 * - Listens to signal events via onTick callback
 * - Accumulates closed signals per strategy using memoized storage
 * - Generates markdown tables with detailed signal information
 * - Saves reports to disk in logs/backtest/{strategyName}.md
 *
 * @example
 * ```typescript
 * const service = new BacktestMarkdownService();
 *
 * // Add to strategy callbacks
 * addStrategy({
 *   strategyName: "my-strategy",
 *   callbacks: {
 *     onTick: (symbol, result, backtest) => {
 *       service.tick(result);
 *     }
 *   }
 * });
 *
 * // After backtest, generate and save report
 * await service.saveReport("my-strategy");
 * ```
 */
export class BacktestMarkdownService {
  /** Logger service for debug output */
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * Memoized function to get or create ReportStorage for a symbol-strategy-exchange-frame-backtest combination.
   * Each combination gets its own isolated storage instance.
   */
  private getStorage = memoize<(symbol: string, strategyName: StrategyName, exchangeName: string, frameName: string, backtest: boolean) => ReportStorage>(
    ([symbol, strategyName, exchangeName, frameName, backtest]) => CREATE_KEY_FN(symbol, strategyName, exchangeName, frameName, backtest),
    () => new ReportStorage()
  );

  /**
   * Processes tick events and accumulates closed signals.
   * Should be called from IStrategyCallbacks.onTick.
   *
   * Only processes closed signals - opened signals are ignored.
   *
   * @param data - Tick result from strategy execution (opened or closed) with frameName wrapper
   *
   * @example
   * ```typescript
   * const service = new BacktestMarkdownService();
   *
   * callbacks: {
   *   onTick: (symbol, result, backtest) => {
   *     service.tick(result);
   *   }
   * }
   * ```
   */
  private tick = async (data: IStrategyTickResult & { frameName: string }) => {
    this.loggerService.log("backtestMarkdownService tick", {
      data,
    });

    if (data.action !== "closed") {
      return;
    }

    const storage = this.getStorage(data.symbol, data.strategyName, data.exchangeName, data.frameName, true);
    storage.addSignal(data);
  };

  /**
   * Gets statistical data from all closed signals for a symbol-strategy pair.
   * Delegates to ReportStorage.getData().
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to get data for
   * @param exchangeName - Exchange name
   * @param frameName - Frame name
   * @param backtest - True if backtest mode, false if live mode
   * @returns Statistical data object with all metrics
   *
   * @example
   * ```typescript
   * const service = new BacktestMarkdownService();
   * const stats = await service.getData("BTCUSDT", "my-strategy", "binance", "1h", true);
   * console.log(stats.sharpeRatio, stats.winRate);
   * ```
   */
  public getData = async (symbol: string, strategyName: StrategyName, exchangeName: string, frameName: string, backtest: boolean): Promise<BacktestStatisticsModel> => {
    this.loggerService.log("backtestMarkdownService getData", {
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
    });
    const storage = this.getStorage(symbol, strategyName, exchangeName, frameName, backtest);
    return storage.getData();
  };

  /**
   * Generates markdown report with all closed signals for a symbol-strategy pair.
   * Delegates to ReportStorage.generateReport().
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to generate report for
   * @param exchangeName - Exchange name
   * @param frameName - Frame name
   * @param backtest - True if backtest mode, false if live mode
   * @param columns - Column configuration for formatting the table
   * @returns Markdown formatted report string with table of all closed signals
   *
   * @example
   * ```typescript
   * const service = new BacktestMarkdownService();
   * const markdown = await service.getReport("BTCUSDT", "my-strategy", "binance", "1h", true);
   * console.log(markdown);
   * ```
   */
  public getReport = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: string,
    frameName: string,
    backtest: boolean,
    columns: Columns[] = COLUMN_CONFIG.backtest_columns
  ): Promise<string> => {
    this.loggerService.log("backtestMarkdownService getReport", {
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
    });
    const storage = this.getStorage(symbol, strategyName, exchangeName, frameName, backtest);
    return storage.getReport(strategyName, columns);
  };

  /**
   * Saves symbol-strategy report to disk.
   * Creates directory if it doesn't exist.
   * Delegates to ReportStorage.dump().
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to save report for
   * @param exchangeName - Exchange name
   * @param frameName - Frame name
   * @param backtest - True if backtest mode, false if live mode
   * @param path - Directory path to save report (default: "./dump/backtest")
   * @param columns - Column configuration for formatting the table
   *
   * @example
   * ```typescript
   * const service = new BacktestMarkdownService();
   *
   * // Save to default path: ./dump/backtest/my-strategy.md
   * await service.dump("BTCUSDT", "my-strategy", "binance", "1h", true);
   *
   * // Save to custom path: ./custom/path/my-strategy.md
   * await service.dump("BTCUSDT", "my-strategy", "binance", "1h", true, "./custom/path");
   * ```
   */
  public dump = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: string,
    frameName: string,
    backtest: boolean,
    path = "./dump/backtest",
    columns: Columns[] = COLUMN_CONFIG.backtest_columns
  ): Promise<void> => {
    this.loggerService.log("backtestMarkdownService dump", {
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
      path,
    });
    const storage = this.getStorage(symbol, strategyName, exchangeName, frameName, backtest);
    await storage.dump(strategyName, path, columns);
  };

  /**
   * Clears accumulated signal data from storage.
   * If ctx is provided, clears only that specific symbol-strategy-exchange-frame-backtest combination's data.
   * If nothing is provided, clears all data.
   *
   * @param backtest - Backtest mode flag
   * @param ctx - Optional context with symbol, strategyName, exchangeName, frameName
   *
   * @example
   * ```typescript
   * const service = new BacktestMarkdownService();
   *
   * // Clear specific combination
   * await service.clear(true, { symbol: "BTCUSDT", strategyName: "my-strategy", exchangeName: "binance", frameName: "1h" });
   *
   * // Clear all data
   * await service.clear();
   * ```
   */
  public clear = async (backtest: boolean, ctx?: { symbol: string; strategyName: StrategyName; exchangeName: string; frameName: string }) => {
    this.loggerService.log("backtestMarkdownService clear", {
      backtest,
      ctx,
    });
    if (ctx) {
      const key = CREATE_KEY_FN(ctx.symbol, ctx.strategyName, ctx.exchangeName, ctx.frameName, backtest);
      this.getStorage.clear(key);
    } else {
      this.getStorage.clear();
    }
  };

  /**
   * Initializes the service by subscribing to backtest signal events.
   * Uses singleshot to ensure initialization happens only once.
   * Automatically called on first use.
   *
   * @example
   * ```typescript
   * const service = new BacktestMarkdownService();
   * await service.init(); // Subscribe to backtest events
   * ```
   */
  protected init = singleshot(async () => {
    this.loggerService.log("backtestMarkdownService init");
    signalBacktestEmitter.subscribe(this.tick);
  });
}

export default BacktestMarkdownService;

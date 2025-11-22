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
import { signalBacktestEmitter } from "../../../config/emitters";

/**
 * Column configuration for markdown table generation.
 * Defines how to extract and format data from closed signals.
 */
interface Column {
  /** Unique column identifier */
  key: string;
  /** Display label for column header */
  label: string;
  /** Formatting function to convert signal data to string */
  format: (data: IStrategyTickResultClosed) => string;
}

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

const columns: Column[] = [
  {
    key: "signalId",
    label: "Signal ID",
    format: (data) => data.signal.id,
  },
  {
    key: "symbol",
    label: "Symbol",
    format: (data) => data.signal.symbol,
  },
  {
    key: "position",
    label: "Position",
    format: (data) => data.signal.position.toUpperCase(),
  },
  {
    key: "note",
    label: "Note",
    format: (data) => data.signal.note ?? "N/A",
  },
  {
    key: "openPrice",
    label: "Open Price",
    format: (data) => `${data.signal.priceOpen.toFixed(8)} USD`,
  },
  {
    key: "closePrice",
    label: "Close Price",
    format: (data) => `${data.currentPrice.toFixed(8)} USD`,
  },
  {
    key: "takeProfit",
    label: "Take Profit",
    format: (data) => `${data.signal.priceTakeProfit.toFixed(8)} USD`,
  },
  {
    key: "stopLoss",
    label: "Stop Loss",
    format: (data) => `${data.signal.priceStopLoss.toFixed(8)} USD`,
  },
  {
    key: "pnl",
    label: "PNL (net)",
    format: (data) => {
      const pnlPercentage = data.pnl.pnlPercentage;
      return `${pnlPercentage > 0 ? "+" : ""}${pnlPercentage.toFixed(2)}%`;
    },
  },
  {
    key: "closeReason",
    label: "Close Reason",
    format: (data) => data.closeReason,
  },
  {
    key: "duration",
    label: "Duration (min)",
    format: (data) => {
      const durationMs = data.closeTimestamp - data.signal.timestamp;
      const durationMin = Math.round(durationMs / 60000);
      return `${durationMin}`;
    },
  },
  {
    key: "openTimestamp",
    label: "Open Time",
    format: (data) => new Date(data.signal.timestamp).toISOString(),
  },
  {
    key: "closeTimestamp",
    label: "Close Time",
    format: (data) => new Date(data.closeTimestamp).toISOString(),
  },
];

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
    this._signalList.push(data);
  }

  /**
   * Generates markdown report with all closed signals for a strategy.
   *
   * @param strategyName - Strategy name
   * @returns Markdown formatted report with all signals
   */
  public getReport(strategyName: StrategyName): string {
    if (this._signalList.length === 0) {
      return str.newline(
        `# Backtest Report: ${strategyName}`,
        "",
        "No signals closed yet."
      );
    }

    const header = columns.map((col) => col.label);
    const separator = columns.map(() => "---");
    const rows = this._signalList.map((closedSignal) =>
      columns.map((col) => col.format(closedSignal))
    );

    const tableData = [header, separator, ...rows];
    const table = str.newline(tableData.map(row => `| ${row.join(" | ")} |`));

    // Calculate statistics
    const totalSignals = this._signalList.length;
    const winCount = this._signalList.filter((s) => s.pnl.pnlPercentage > 0).length;
    const lossCount = this._signalList.filter((s) => s.pnl.pnlPercentage < 0).length;
    const avgPnl = this._signalList.reduce((sum, s) => sum + s.pnl.pnlPercentage, 0) / totalSignals;
    const totalPnl = this._signalList.reduce((sum, s) => sum + s.pnl.pnlPercentage, 0);

    // Calculate Sharpe Ratio (risk-free rate = 0)
    // Sharpe = Mean Return / Std Dev of Returns
    const returns = this._signalList.map((s) => s.pnl.pnlPercentage);
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgPnl, 2), 0) / totalSignals;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? avgPnl / stdDev : 0;

    // Calculate Certainty Ratio
    // Certainty Ratio = Average Win / |Average Loss|
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
    // Based on average trade duration and average PNL
    const avgDurationMs = this._signalList.reduce(
      (sum, s) => sum + (s.closeTimestamp - s.signal.timestamp),
      0
    ) / totalSignals;
    const avgDurationDays = avgDurationMs / (1000 * 60 * 60 * 24);
    const tradesPerYear = avgDurationDays > 0 ? 365 / avgDurationDays : 0;
    const expectedYearlyReturns = avgPnl * tradesPerYear;

    const winRate = (winCount / totalSignals) * 100;

    return str.newline(
      `# Backtest Report: ${strategyName}`,
      "",
      table,
      "",
      `**Total signals:** ${totalSignals}`,
      `**Closed signals:** ${totalSignals}`,
      `**Win rate:** ${isUnsafe(winRate) ? "N/A" : `${winRate.toFixed(2)}% (${winCount}W / ${lossCount}L) (higher is better)`}`,
      `**Average PNL:** ${isUnsafe(avgPnl) ? "N/A" : `${avgPnl > 0 ? "+" : ""}${avgPnl.toFixed(2)}% (higher is better)`}`,
      `**Total PNL:** ${isUnsafe(totalPnl) ? "N/A" : `${totalPnl > 0 ? "+" : ""}${totalPnl.toFixed(2)}% (higher is better)`}`,
      `**Standard Deviation:** ${isUnsafe(stdDev) ? "N/A" : `${stdDev.toFixed(3)}% (lower is better)`}`,
      `**Sharpe Ratio:** ${isUnsafe(sharpeRatio) ? "N/A" : `${sharpeRatio.toFixed(3)} (higher is better)`}`,
      `**Certainty Ratio:** ${isUnsafe(certaintyRatio) ? "N/A" : `${certaintyRatio.toFixed(3)} (higher is better)`}`,
      `**Expected Yearly Returns:** ${isUnsafe(expectedYearlyReturns) ? "N/A" : `${expectedYearlyReturns > 0 ? "+" : ""}${expectedYearlyReturns.toFixed(2)}% (higher is better)`}`,
    );
  }

  /**
   * Saves strategy report to disk.
   *
   * @param strategyName - Strategy name
   * @param path - Directory path to save report (default: "./logs/backtest")
   */
  public async dump(
    strategyName: StrategyName,
    path = "./logs/backtest"
  ): Promise<void> {
    const markdown = this.getReport(strategyName);

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
   * Memoized function to get or create ReportStorage for a strategy.
   * Each strategy gets its own isolated storage instance.
   */
  private getStorage = memoize<(strategyName: string) => ReportStorage>(
    ([strategyName]) => `${strategyName}`,
    () => new ReportStorage()
  );

  /**
   * Processes tick events and accumulates closed signals.
   * Should be called from IStrategyCallbacks.onTick.
   *
   * Only processes closed signals - opened signals are ignored.
   *
   * @param data - Tick result from strategy execution (opened or closed)
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
  private tick = async (data: IStrategyTickResult) => {
    this.loggerService.log("backtestMarkdownService tick", {
      data,
    });

    if (data.action !== "closed") {
      return;
    }

    const storage = this.getStorage(data.strategyName);
    storage.addSignal(data);
  };

  /**
   * Generates markdown report with all closed signals for a strategy.
   * Delegates to ReportStorage.generateReport().
   *
   * @param strategyName - Strategy name to generate report for
   * @returns Markdown formatted report string with table of all closed signals
   *
   * @example
   * ```typescript
   * const service = new BacktestMarkdownService();
   * const markdown = service.generateReport("my-strategy");
   * console.log(markdown);
   * ```
   */
  public getReport = async (strategyName: StrategyName): Promise<string> => {
    this.loggerService.log("backtestMarkdownService getReport", {
      strategyName,
    });
    const storage = this.getStorage(strategyName);
    return storage.getReport(strategyName);
  };

  /**
   * Saves strategy report to disk.
   * Creates directory if it doesn't exist.
   * Delegates to ReportStorage.dump().
   *
   * @param strategyName - Strategy name to save report for
   * @param path - Directory path to save report (default: "./logs/backtest")
   *
   * @example
   * ```typescript
   * const service = new BacktestMarkdownService();
   *
   * // Save to default path: ./logs/backtest/my-strategy.md
   * await service.dump("my-strategy");
   *
   * // Save to custom path: ./custom/path/my-strategy.md
   * await service.dump("my-strategy", "./custom/path");
   * ```
   */
  public dump = async (
    strategyName: StrategyName,
    path = "./logs/backtest"
  ): Promise<void> => {
    this.loggerService.log("backtestMarkdownService dump", {
      strategyName,
      path,
    });
    const storage = this.getStorage(strategyName);
    await storage.dump(strategyName, path);
  };

  /**
   * Clears accumulated signal data from storage.
   * If strategyName is provided, clears only that strategy's data.
   * If strategyName is omitted, clears all strategies' data.
   *
   * @param strategyName - Optional strategy name to clear specific strategy data
   *
   * @example
   * ```typescript
   * const service = new BacktestMarkdownService();
   *
   * // Clear specific strategy data
   * await service.clear("my-strategy");
   *
   * // Clear all strategies' data
   * await service.clear();
   * ```
   */
  public clear = async (strategyName?: StrategyName) => {
    this.loggerService.log("backtestMarkdownService clear", {
      strategyName,
    });
    this.getStorage.clear(strategyName);
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

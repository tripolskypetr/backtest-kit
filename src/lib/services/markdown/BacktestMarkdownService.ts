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
import { memoize, str } from "functools-kit";

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
    const rows = this._signalList.map((closedSignal) =>
      columns.map((col) => col.format(closedSignal))
    );

    const tableData = [header, ...rows];
    const table = str.table(tableData);

    return str.newline(
      `# Backtest Report: ${strategyName}`,
      "",
      `Total signals: ${this._signalList.length}`,
      "",
      table,
      "",
      "",
      `*Generated: ${new Date().toISOString()}*`
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
  public tick = async (data: IStrategyTickResult) => {
    this.loggerService.log("backtestMarkdownService tick", {
      data,
    });

    const storage = this.getStorage(data.signal.strategyName);

    if (data.action !== "closed") {
      return;
    }

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
    const storage = this.getStorage(strategyName);
    await storage.dump(strategyName, path);
  };
}

export default BacktestMarkdownService;

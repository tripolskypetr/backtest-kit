import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { ISignalRow } from "../../../interfaces/Strategy.interface";
import { PartialLevel } from "../../../interfaces/Partial.interface";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { memoize, singleshot } from "functools-kit";
import {
  partialProfitSubject,
  partialLossSubject,
} from "../../../config/emitters";
import { PartialStatisticsContract, PartialEvent } from "../../../model/PartialStatistics.model";

/**
 * Column configuration for markdown table generation.
 * Defines how to extract and format data from partial events.
 */
interface Column {
  /** Unique column identifier */
  key: string;
  /** Display label for column header */
  label: string;
  /** Formatting function to convert event data to string */
  format: (data: PartialEvent) => string;
  /** Function to determine if column should be visible */
  isVisible: () => boolean;
}

const columns: Column[] = [
  {
    key: "action",
    label: "Action",
    format: (data) => data.action.toUpperCase(),
    isVisible: () => true,
  },
  {
    key: "symbol",
    label: "Symbol",
    format: (data) => data.symbol,
    isVisible: () => true,
  },
  {
    key: "strategyName",
    label: "Strategy",
    format: (data) => data.strategyName,
    isVisible: () => true,
  },
  {
    key: "signalId",
    label: "Signal ID",
    format: (data) => data.signalId,
    isVisible: () => true,
  },
  {
    key: "position",
    label: "Position",
    format: (data) => data.position.toUpperCase(),
    isVisible: () => true,
  },
  {
    key: "level",
    label: "Level %",
    format: (data) =>
      data.action === "profit" ? `+${data.level}%` : `-${data.level}%`,
    isVisible: () => true,
  },
  {
    key: "currentPrice",
    label: "Current Price",
    format: (data) => `${data.currentPrice.toFixed(8)} USD`,
    isVisible: () => true,
  },
  {
    key: "timestamp",
    label: "Timestamp",
    format: (data) => new Date(data.timestamp).toISOString(),
    isVisible: () => true,
  },
  {
    key: "mode",
    label: "Mode",
    format: (data) => (data.backtest ? "Backtest" : "Live"),
    isVisible: () => true,
  },
];

/** Maximum number of events to store in partial reports */
const MAX_EVENTS = 250;

/**
 * Storage class for accumulating partial profit/loss events per symbol-strategy pair.
 * Maintains a chronological list of profit and loss level events.
 */
class ReportStorage {
  /** Internal list of all partial events for this symbol */
  private _eventList: PartialEvent[] = [];

  /**
   * Adds a profit event to the storage.
   *
   * @param data - Signal row data
   * @param currentPrice - Current market price
   * @param level - Profit level reached
   * @param backtest - True if backtest mode
   */
  public addProfitEvent(
    data: ISignalRow,
    currentPrice: number,
    level: PartialLevel,
    backtest: boolean,
    timestamp: number
  ) {
    this._eventList.unshift({
      timestamp,
      action: "profit",
      symbol: data.symbol,
      strategyName: data.strategyName,
      signalId: data.id,
      position: data.position,
      currentPrice,
      level,
      backtest,
    });

    // Trim queue if exceeded MAX_EVENTS
    if (this._eventList.length > MAX_EVENTS) {
      this._eventList.pop();
    }
  }

  /**
   * Adds a loss event to the storage.
   *
   * @param data - Signal row data
   * @param currentPrice - Current market price
   * @param level - Loss level reached
   * @param backtest - True if backtest mode
   */
  public addLossEvent(
    data: ISignalRow,
    currentPrice: number,
    level: PartialLevel,
    backtest: boolean,
    timestamp: number
  ) {
    this._eventList.unshift({
      timestamp,
      action: "loss",
      symbol: data.symbol,
      strategyName: data.strategyName,
      signalId: data.id,
      position: data.position,
      currentPrice,
      level,
      backtest,
    });

    // Trim queue if exceeded MAX_EVENTS
    if (this._eventList.length > MAX_EVENTS) {
      this._eventList.pop();
    }
  }

  /**
   * Calculates statistical data from partial profit/loss events (Controller).
   *
   * @returns Statistical data (empty object if no events)
   */
  public async getData(): Promise<PartialStatisticsContract> {
    if (this._eventList.length === 0) {
      return {
        eventList: [],
        totalEvents: 0,
        totalProfit: 0,
        totalLoss: 0,
      };
    }

    const profitEvents = this._eventList.filter((e) => e.action === "profit");
    const lossEvents = this._eventList.filter((e) => e.action === "loss");

    return {
      eventList: this._eventList,
      totalEvents: this._eventList.length,
      totalProfit: profitEvents.length,
      totalLoss: lossEvents.length,
    };
  }

  /**
   * Generates markdown report with all partial events for a symbol-strategy pair (View).
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name
   * @returns Markdown formatted report with all events
   */
  public async getReport(symbol: string, strategyName: string): Promise<string> {
    const stats = await this.getData();

    if (stats.totalEvents === 0) {
      return [
        `# Partial Profit/Loss Report: ${symbol}:${strategyName}`,
        "",
        "No partial profit/loss events recorded yet."
      ].join("\n");
    }

    const visibleColumns = columns.filter((col) => col.isVisible());
    const header = visibleColumns.map((col) => col.label);
    const separator = visibleColumns.map(() => "---");
    const rows = this._eventList.map((event) =>
      visibleColumns.map((col) => col.format(event))
    );

    const tableData = [header, separator, ...rows];
    const table = tableData.map((row) => `| ${row.join(" | ")} |`).join("\n");

    return [
      `# Partial Profit/Loss Report: ${symbol}:${strategyName}`,
      "",
      table,
      "",
      `**Total events:** ${stats.totalEvents}`,
      `**Profit events:** ${stats.totalProfit}`,
      `**Loss events:** ${stats.totalLoss}`
    ].join("\n");
  }

  /**
   * Saves symbol-strategy report to disk.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name
   * @param path - Directory path to save report (default: "./dump/partial")
   */
  public async dump(symbol: string, strategyName: string, path = "./dump/partial"): Promise<void> {
    const markdown = await this.getReport(symbol, strategyName);

    try {
      const dir = join(process.cwd(), path);
      await mkdir(dir, { recursive: true });

      const filename = `${symbol}_${strategyName}.md`;
      const filepath = join(dir, filename);

      await writeFile(filepath, markdown, "utf-8");
      console.log(`Partial profit/loss report saved: ${filepath}`);
    } catch (error) {
      console.error(`Failed to save markdown report:`, error);
    }
  }
}

/**
 * Service for generating and saving partial profit/loss markdown reports.
 *
 * Features:
 * - Listens to partial profit and loss events via partialProfitSubject/partialLossSubject
 * - Accumulates all events (profit, loss) per symbol-strategy pair
 * - Generates markdown tables with detailed event information
 * - Provides statistics (total profit/loss events)
 * - Saves reports to disk in dump/partial/{symbol}_{strategyName}.md
 *
 * @example
 * ```typescript
 * const service = new PartialMarkdownService();
 *
 * // Service automatically subscribes to subjects on init
 * // No manual callback setup needed
 *
 * // Later: generate and save report
 * await service.dump("BTCUSDT", "my-strategy");
 * ```
 */
export class PartialMarkdownService {
  /** Logger service for debug output */
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * Memoized function to get or create ReportStorage for a symbol-strategy pair.
   * Each symbol-strategy combination gets its own isolated storage instance.
   */
  private getStorage = memoize<(symbol: string, strategyName: string) => ReportStorage>(
    ([symbol, strategyName]) => `${symbol}:${strategyName}`,
    () => new ReportStorage()
  );

  /**
   * Processes profit events and accumulates them.
   * Should be called from partialProfitSubject subscription.
   *
   * @param data - Profit event data
   *
   * @example
   * ```typescript
   * const service = new PartialMarkdownService();
   * // Service automatically subscribes in init()
   * ```
   */
  private tickProfit = async (data: {
    symbol: string;
    data: ISignalRow;
    currentPrice: number;
    level: PartialLevel;
    backtest: boolean;
    timestamp: number;
  }) => {
    this.loggerService.log("partialMarkdownService tickProfit", {
      data,
    });

    const storage = this.getStorage(data.symbol, data.data.strategyName);
    storage.addProfitEvent(
      data.data,
      data.currentPrice,
      data.level,
      data.backtest,
      data.timestamp
    );
  };

  /**
   * Processes loss events and accumulates them.
   * Should be called from partialLossSubject subscription.
   *
   * @param data - Loss event data
   *
   * @example
   * ```typescript
   * const service = new PartialMarkdownService();
   * // Service automatically subscribes in init()
   * ```
   */
  private tickLoss = async (data: {
    symbol: string;
    data: ISignalRow;
    currentPrice: number;
    level: PartialLevel;
    backtest: boolean;
    timestamp: number;
  }) => {
    this.loggerService.log("partialMarkdownService tickLoss", {
      data,
    });

    const storage = this.getStorage(data.symbol, data.data.strategyName);
    storage.addLossEvent(
      data.data,
      data.currentPrice,
      data.level,
      data.backtest,
      data.timestamp
    );
  };

  /**
   * Gets statistical data from all partial profit/loss events for a symbol-strategy pair.
   * Delegates to ReportStorage.getData().
   *
   * @param symbol - Trading pair symbol to get data for
   * @param strategyName - Strategy name to get data for
   * @returns Statistical data object with all metrics
   *
   * @example
   * ```typescript
   * const service = new PartialMarkdownService();
   * const stats = await service.getData("BTCUSDT", "my-strategy");
   * console.log(stats.totalProfit, stats.totalLoss);
   * ```
   */
  public getData = async (symbol: string, strategyName: string): Promise<PartialStatisticsContract> => {
    this.loggerService.log("partialMarkdownService getData", {
      symbol,
      strategyName,
    });
    const storage = this.getStorage(symbol, strategyName);
    return storage.getData();
  };

  /**
   * Generates markdown report with all partial events for a symbol-strategy pair.
   * Delegates to ReportStorage.getReport().
   *
   * @param symbol - Trading pair symbol to generate report for
   * @param strategyName - Strategy name to generate report for
   * @returns Markdown formatted report string with table of all events
   *
   * @example
   * ```typescript
   * const service = new PartialMarkdownService();
   * const markdown = await service.getReport("BTCUSDT", "my-strategy");
   * console.log(markdown);
   * ```
   */
  public getReport = async (symbol: string, strategyName: string): Promise<string> => {
    this.loggerService.log("partialMarkdownService getReport", {
      symbol,
      strategyName,
    });
    const storage = this.getStorage(symbol, strategyName);
    return storage.getReport(symbol, strategyName);
  };

  /**
   * Saves symbol-strategy report to disk.
   * Creates directory if it doesn't exist.
   * Delegates to ReportStorage.dump().
   *
   * @param symbol - Trading pair symbol to save report for
   * @param strategyName - Strategy name to save report for
   * @param path - Directory path to save report (default: "./dump/partial")
   *
   * @example
   * ```typescript
   * const service = new PartialMarkdownService();
   *
   * // Save to default path: ./dump/partial/BTCUSDT_my-strategy.md
   * await service.dump("BTCUSDT", "my-strategy");
   *
   * // Save to custom path: ./custom/path/BTCUSDT_my-strategy.md
   * await service.dump("BTCUSDT", "my-strategy", "./custom/path");
   * ```
   */
  public dump = async (
    symbol: string,
    strategyName: string,
    path = "./dump/partial"
  ): Promise<void> => {
    this.loggerService.log("partialMarkdownService dump", {
      symbol,
      strategyName,
      path,
    });
    const storage = this.getStorage(symbol, strategyName);
    await storage.dump(symbol, strategyName, path);
  };

  /**
   * Clears accumulated event data from storage.
   * If ctx is provided, clears only that specific symbol-strategy pair's data.
   * If nothing is provided, clears all data.
   *
   * @param ctx - Optional context with symbol and strategyName
   *
   * @example
   * ```typescript
   * const service = new PartialMarkdownService();
   *
   * // Clear specific symbol-strategy pair
   * await service.clear({ symbol: "BTCUSDT", strategyName: "my-strategy" });
   *
   * // Clear all data
   * await service.clear();
   * ```
   */
  public clear = async (ctx?: { symbol: string; strategyName: string }) => {
    this.loggerService.log("partialMarkdownService clear", {
      ctx,
    });
    if (ctx) {
      const key = `${ctx.symbol}:${ctx.strategyName}`;
      this.getStorage.clear(key);
    } else {
      this.getStorage.clear();
    }
  };

  /**
   * Initializes the service by subscribing to partial profit/loss events.
   * Uses singleshot to ensure initialization happens only once.
   * Automatically called on first use.
   *
   * @example
   * ```typescript
   * const service = new PartialMarkdownService();
   * await service.init(); // Subscribe to profit/loss events
   * ```
   */
  protected init = singleshot(async () => {
    this.loggerService.log("partialMarkdownService init");
    partialProfitSubject.subscribe(this.tickProfit);
    partialLossSubject.subscribe(this.tickLoss);
  });
}

export default PartialMarkdownService;

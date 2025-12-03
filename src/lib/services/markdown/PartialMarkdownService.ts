import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { ISignalRow } from "../../../interfaces/Strategy.interface";
import { PartialLevel } from "../../../interfaces/Partial.interface";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { memoize, singleshot, str } from "functools-kit";
import {
  partialProfitSubject,
  partialLossSubject,
} from "../../../config/emitters";

/**
 * Unified partial profit/loss event data for report generation.
 * Contains all information about profit and loss level milestones.
 */
interface PartialEvent {
  /** Event timestamp in milliseconds */
  timestamp: number;
  /** Event action type (profit or loss) */
  action: "profit" | "loss";
  /** Trading pair symbol */
  symbol: string;
  /** Signal ID */
  signalId: string;
  /** Position type */
  position: string;
  /** Current market price */
  currentPrice: number;
  /** Profit/loss level reached (10, 20, 30, etc) */
  level: PartialLevel;
  /** True if backtest mode, false if live mode */
  backtest: boolean;
}

/**
 * Statistical data calculated from partial profit/loss events.
 *
 * Provides metrics for partial profit/loss milestone tracking.
 *
 * @example
 * ```typescript
 * const stats = await Partial.getData("my-strategy");
 *
 * console.log(`Total events: ${stats.totalEvents}`);
 * console.log(`Profit events: ${stats.totalProfit}`);
 * console.log(`Loss events: ${stats.totalLoss}`);
 * ```
 */
export interface PartialStatistics {
  /** Array of all profit/loss events with full details */
  eventList: PartialEvent[];

  /** Total number of all events (includes profit, loss) */
  totalEvents: number;

  /** Total number of profit events */
  totalProfit: number;

  /** Total number of loss events */
  totalLoss: number;
}

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
}

const columns: Column[] = [
  {
    key: "timestamp",
    label: "Timestamp",
    format: (data) => new Date(data.timestamp).toISOString(),
  },
  {
    key: "action",
    label: "Action",
    format: (data) => data.action.toUpperCase(),
  },
  {
    key: "symbol",
    label: "Symbol",
    format: (data) => data.symbol,
  },
  {
    key: "signalId",
    label: "Signal ID",
    format: (data) => data.signalId,
  },
  {
    key: "position",
    label: "Position",
    format: (data) => data.position.toUpperCase(),
  },
  {
    key: "level",
    label: "Level %",
    format: (data) =>
      data.action === "profit" ? `+${data.level}%` : `-${data.level}%`,
  },
  {
    key: "currentPrice",
    label: "Current Price",
    format: (data) => `${data.currentPrice.toFixed(8)} USD`,
  },
  {
    key: "mode",
    label: "Mode",
    format: (data) => (data.backtest ? "Backtest" : "Live"),
  },
];

/** Maximum number of events to store in partial reports */
const MAX_EVENTS = 250;

/**
 * Storage class for accumulating partial profit/loss events per symbol.
 * Maintains a chronological list of profit and loss level events.
 */
class ReportStorage {
  /** Internal list of all partial events for this symbol */
  private _eventList: PartialEvent[] = [];

  /**
   * Adds a profit event to the storage.
   *
   * @param symbol - Trading pair symbol
   * @param data - Signal row data
   * @param currentPrice - Current market price
   * @param level - Profit level reached
   * @param backtest - True if backtest mode
   */
  public addProfitEvent(
    symbol: string,
    data: ISignalRow,
    currentPrice: number,
    level: PartialLevel,
    backtest: boolean
  ) {
    this._eventList.push({
      timestamp: Date.now(),
      action: "profit",
      symbol,
      signalId: data.id,
      position: data.position,
      currentPrice,
      level,
      backtest,
    });

    // Trim queue if exceeded MAX_EVENTS
    if (this._eventList.length > MAX_EVENTS) {
      this._eventList.shift();
    }
  }

  /**
   * Adds a loss event to the storage.
   *
   * @param symbol - Trading pair symbol
   * @param data - Signal row data
   * @param currentPrice - Current market price
   * @param level - Loss level reached
   * @param backtest - True if backtest mode
   */
  public addLossEvent(
    symbol: string,
    data: ISignalRow,
    currentPrice: number,
    level: PartialLevel,
    backtest: boolean
  ) {
    this._eventList.push({
      timestamp: Date.now(),
      action: "loss",
      symbol,
      signalId: data.id,
      position: data.position,
      currentPrice,
      level,
      backtest,
    });

    // Trim queue if exceeded MAX_EVENTS
    if (this._eventList.length > MAX_EVENTS) {
      this._eventList.shift();
    }
  }

  /**
   * Calculates statistical data from partial profit/loss events (Controller).
   *
   * @returns Statistical data (empty object if no events)
   */
  public async getData(): Promise<PartialStatistics> {
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
   * Generates markdown report with all partial events for a symbol (View).
   *
   * @param symbol - Trading pair symbol
   * @returns Markdown formatted report with all events
   */
  public async getReport(symbol: string): Promise<string> {
    const stats = await this.getData();

    if (stats.totalEvents === 0) {
      return str.newline(
        `# Partial Profit/Loss Report: ${symbol}`,
        "",
        "No partial profit/loss events recorded yet."
      );
    }

    const header = columns.map((col) => col.label);
    const separator = columns.map(() => "---");
    const rows = this._eventList.map((event) =>
      columns.map((col) => col.format(event))
    );

    const tableData = [header, separator, ...rows];
    const table = str.newline(tableData.map((row) => `| ${row.join(" | ")} |`));

    return str.newline(
      `# Partial Profit/Loss Report: ${symbol}`,
      "",
      table,
      "",
      `**Total events:** ${stats.totalEvents}`,
      `**Profit events:** ${stats.totalProfit}`,
      `**Loss events:** ${stats.totalLoss}`
    );
  }

  /**
   * Saves symbol report to disk.
   *
   * @param symbol - Trading pair symbol
   * @param path - Directory path to save report (default: "./dump/partial")
   */
  public async dump(symbol: string, path = "./dump/partial"): Promise<void> {
    const markdown = await this.getReport(symbol);

    try {
      const dir = join(process.cwd(), path);
      await mkdir(dir, { recursive: true });

      const filename = `${symbol}.md`;
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
 * - Accumulates all events (profit, loss) per symbol
 * - Generates markdown tables with detailed event information
 * - Provides statistics (total profit/loss events)
 * - Saves reports to disk in dump/partial/{symbol}.md
 *
 * @example
 * ```typescript
 * const service = new PartialMarkdownService();
 *
 * // Service automatically subscribes to subjects on init
 * // No manual callback setup needed
 *
 * // Later: generate and save report
 * await service.dump("BTCUSDT");
 * ```
 */
export class PartialMarkdownService {
  /** Logger service for debug output */
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * Memoized function to get or create ReportStorage for a symbol.
   * Each symbol gets its own isolated storage instance.
   */
  private getStorage = memoize<(symbol: string) => ReportStorage>(
    ([symbol]) => `${symbol}`,
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
  }) => {
    this.loggerService.log("partialMarkdownService tickProfit", {
      data,
    });

    const storage = this.getStorage(data.symbol);
    storage.addProfitEvent(
      data.symbol,
      data.data,
      data.currentPrice,
      data.level,
      data.backtest
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
  }) => {
    this.loggerService.log("partialMarkdownService tickLoss", {
      data,
    });

    const storage = this.getStorage(data.symbol);
    storage.addLossEvent(
      data.symbol,
      data.data,
      data.currentPrice,
      data.level,
      data.backtest
    );
  };

  /**
   * Gets statistical data from all partial profit/loss events for a symbol.
   * Delegates to ReportStorage.getData().
   *
   * @param symbol - Trading pair symbol to get data for
   * @returns Statistical data object with all metrics
   *
   * @example
   * ```typescript
   * const service = new PartialMarkdownService();
   * const stats = await service.getData("BTCUSDT");
   * console.log(stats.totalProfit, stats.totalLoss);
   * ```
   */
  public getData = async (symbol: string): Promise<PartialStatistics> => {
    this.loggerService.log("partialMarkdownService getData", {
      symbol,
    });
    const storage = this.getStorage(symbol);
    return storage.getData();
  };

  /**
   * Generates markdown report with all partial events for a symbol.
   * Delegates to ReportStorage.getReport().
   *
   * @param symbol - Trading pair symbol to generate report for
   * @returns Markdown formatted report string with table of all events
   *
   * @example
   * ```typescript
   * const service = new PartialMarkdownService();
   * const markdown = await service.getReport("BTCUSDT");
   * console.log(markdown);
   * ```
   */
  public getReport = async (symbol: string): Promise<string> => {
    this.loggerService.log("partialMarkdownService getReport", {
      symbol,
    });
    const storage = this.getStorage(symbol);
    return storage.getReport(symbol);
  };

  /**
   * Saves symbol report to disk.
   * Creates directory if it doesn't exist.
   * Delegates to ReportStorage.dump().
   *
   * @param symbol - Trading pair symbol to save report for
   * @param path - Directory path to save report (default: "./dump/partial")
   *
   * @example
   * ```typescript
   * const service = new PartialMarkdownService();
   *
   * // Save to default path: ./dump/partial/BTCUSDT.md
   * await service.dump("BTCUSDT");
   *
   * // Save to custom path: ./custom/path/BTCUSDT.md
   * await service.dump("BTCUSDT", "./custom/path");
   * ```
   */
  public dump = async (
    symbol: string,
    path = "./dump/partial"
  ): Promise<void> => {
    this.loggerService.log("partialMarkdownService dump", {
      symbol,
      path,
    });
    const storage = this.getStorage(symbol);
    await storage.dump(symbol, path);
  };

  /**
   * Clears accumulated event data from storage.
   * If symbol is provided, clears only that symbol's data.
   * If symbol is omitted, clears all symbols' data.
   *
   * @param symbol - Optional symbol to clear specific symbol data
   *
   * @example
   * ```typescript
   * const service = new PartialMarkdownService();
   *
   * // Clear specific symbol data
   * await service.clear("BTCUSDT");
   *
   * // Clear all symbols' data
   * await service.clear();
   * ```
   */
  public clear = async (symbol?: string) => {
    this.loggerService.log("partialMarkdownService clear", {
      symbol,
    });
    this.getStorage.clear(symbol);
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

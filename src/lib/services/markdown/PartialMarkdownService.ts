import { ISignalRow, StrategyName } from "../../../interfaces/Strategy.interface";
import { Markdown } from "../../../classes/Markdown";
import { PartialLevel } from "../../../interfaces/Partial.interface";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { memoize, singleshot } from "functools-kit";
import {
  partialProfitSubject,
  partialLossSubject,
} from "../../../config/emitters";
import {
  PartialStatisticsModel,
  PartialEvent,
} from "../../../model/PartialStatistics.model";
import { ColumnModel } from "../../../model/Column.model";
import { COLUMN_CONFIG } from "../../../config/columns";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";

/**
 * Type alias for column configuration used in partial profit/loss markdown reports.
 * 
 * Represents a column model specifically designed to format and display
 * partial position exit events in markdown tables.
 * 
 * @typeParam PartialEvent - The partial exit event data type containing
 *   profit/loss level information, symbol, and timing details
 * 
 * @example
 * ```typescript
 * // Column to display symbol
 * const symbolColumn: Columns = {
 *   key: "symbol",
 *   label: "Symbol",
 *   format: (event) => event.symbol,
 *   isVisible: () => true
 * };
 * 
 * // Column to display profit level
 * const levelColumn: Columns = {
 *   key: "level",
 *   label: "Exit Level",
 *   format: (event) => event.level.toString(),
 *   isVisible: () => true
 * };
 * ```
 * 
 * @see ColumnModel for the base interface
 * @see PartialEvent for the event data structure
 */
export type Columns = ColumnModel<PartialEvent>;

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
  exchangeName: ExchangeName,
  frameName: FrameName,
  backtest: boolean
): string => {
  const parts = [symbol, strategyName, exchangeName];
  if (frameName) parts.push(frameName);
  parts.push(backtest ? "backtest" : "live");
  return parts.join(":");
};

/**
 * Creates a filename for markdown report based on memoization key components.
 * Filename format: "symbol_strategyName_exchangeName_frameName-timestamp.md"
 */
const CREATE_FILE_NAME_FN = (
  symbol: string,
  strategyName: StrategyName,
  exchangeName: ExchangeName,
  frameName: FrameName,
  timestamp: number
): string => {
  const parts = [symbol, strategyName, exchangeName];
  if (frameName) parts.push(frameName);
  return `${parts.join("_")}-${timestamp}.md`;
};

/** Maximum number of events to store in partial reports */
const MAX_EVENTS = 250;

/**
 * Storage class for accumulating partial profit/loss events per symbol-strategy pair.
 * Maintains a chronological list of profit and loss level events.
 */
class ReportStorage {
  /** Internal list of all partial events for this symbol */
  private _eventList: PartialEvent[] = [];

  constructor(
    readonly symbol: string,
    readonly strategyName: StrategyName,
    readonly exchangeName: ExchangeName,
    readonly frameName: FrameName
  ) {}

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
  public async getData(): Promise<PartialStatisticsModel> {
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
   * @param columns - Column configuration for formatting the table
   * @returns Markdown formatted report with all events
   */
  public async getReport(
    symbol: string,
    strategyName: StrategyName,
    columns: Columns[] = COLUMN_CONFIG.partial_columns
  ): Promise<string> {
    const stats = await this.getData();

    if (stats.totalEvents === 0) {
      return [
        `# Partial Profit/Loss Report: ${symbol}:${strategyName}`,
        "",
        "No partial profit/loss events recorded yet."
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
      this._eventList.map(async (event, index) =>
        Promise.all(visibleColumns.map((col) => col.format(event, index)))
      )
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
   * @param columns - Column configuration for formatting the table
   */
  public async dump(
    symbol: string,
    strategyName: StrategyName,
    path = "./dump/partial",
    columns: Columns[] = COLUMN_CONFIG.partial_columns
  ): Promise<void> {
    const markdown = await this.getReport(symbol, strategyName, columns);
    const timestamp = Date.now();
    const filename = CREATE_FILE_NAME_FN(this.symbol, strategyName, this.exchangeName, this.frameName, timestamp);
    await Markdown.writeData("partial", markdown, {
      path,
      file: filename,
      symbol: this.symbol,
      strategyName: this.strategyName,
      exchangeName: this.exchangeName,
      frameName: this.frameName
    });
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
   * Memoized function to get or create ReportStorage for a symbol-strategy-exchange-frame-backtest combination.
   * Each combination gets its own isolated storage instance.
   */
  private getStorage = memoize<(symbol: string, strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean) => ReportStorage>(
    ([symbol, strategyName, exchangeName, frameName, backtest]) => CREATE_KEY_FN(symbol, strategyName, exchangeName, frameName, backtest),
    (symbol, strategyName, exchangeName, frameName, backtest) => new ReportStorage(symbol, strategyName, exchangeName, frameName)
  );

  /**
   * Subscribes to partial profit/loss signal emitters to receive events.
   * Protected against multiple subscriptions.
   * Returns an unsubscribe function to stop receiving events.
   *
   * @example
   * ```typescript
   * const service = new PartialMarkdownService();
   * const unsubscribe = service.subscribe();
   * // ... later
   * unsubscribe();
   * ```
   */
  public subscribe = singleshot(() => {
    this.loggerService.log("partialMarkdownService init");
    const unProfit = partialProfitSubject.subscribe(this.tickProfit);
    const unLoss = partialLossSubject.subscribe(this.tickLoss);
    return () => {
      this.subscribe.clear();
      this.clear();
      unProfit();
      unLoss();
    }
  });

  /**
   * Unsubscribes from partial profit/loss signal emitters to stop receiving events.
   * Calls the unsubscribe function returned by subscribe().
   * If not subscribed, does nothing.
   *
   * @example
   * ```typescript
   * const service = new PartialMarkdownService();
   * service.subscribe();
   * // ... later
   * service.unsubscribe();
   * ```
   */
  public unsubscribe = async () => {
    this.loggerService.log("partialMarkdownService unsubscribe");
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };

  /**
   * Processes profit events and accumulates them.
   * Should be called from partialProfitSubject subscription.
   *
   * @param data - Profit event data with frameName wrapper
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
    exchangeName: ExchangeName;
    frameName: FrameName;
  }) => {
    this.loggerService.log("partialMarkdownService tickProfit", {
      data,
    });

    const storage = this.getStorage(data.symbol, data.data.strategyName, data.exchangeName, data.frameName, data.backtest);
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
   * @param data - Loss event data with frameName wrapper
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
    exchangeName: ExchangeName;
    frameName: FrameName;
  }) => {
    this.loggerService.log("partialMarkdownService tickLoss", {
      data,
    });

    const storage = this.getStorage(data.symbol, data.data.strategyName, data.exchangeName, data.frameName, data.backtest);
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
   * @param exchangeName - Exchange name
   * @param frameName - Frame name
   * @param backtest - True if backtest mode, false if live mode
   * @returns Statistical data object with all metrics
   *
   * @example
   * ```typescript
   * const service = new PartialMarkdownService();
   * const stats = await service.getData("BTCUSDT", "my-strategy", "binance", "1h", false);
   * console.log(stats.totalProfit, stats.totalLoss);
   * ```
   */
  public getData = async (symbol: string, strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean): Promise<PartialStatisticsModel> => {
    this.loggerService.log("partialMarkdownService getData", {
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
    });
    if (!this.subscribe.hasValue()) {
      throw new Error("PartialMarkdownService not initialized. Call subscribe() before getting data.");
    }
    const storage = this.getStorage(symbol, strategyName, exchangeName, frameName, backtest);
    return storage.getData();
  };

  /**
   * Generates markdown report with all partial events for a symbol-strategy pair.
   * Delegates to ReportStorage.getReport().
   *
   * @param symbol - Trading pair symbol to generate report for
   * @param strategyName - Strategy name to generate report for
   * @param exchangeName - Exchange name
   * @param frameName - Frame name
   * @param backtest - True if backtest mode, false if live mode
   * @param columns - Column configuration for formatting the table
   * @returns Markdown formatted report string with table of all events
   *
   * @example
   * ```typescript
   * const service = new PartialMarkdownService();
   * const markdown = await service.getReport("BTCUSDT", "my-strategy", "binance", "1h", false);
   * console.log(markdown);
   * ```
   */
  public getReport = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
    columns: Columns[] = COLUMN_CONFIG.partial_columns
  ): Promise<string> => {
    this.loggerService.log("partialMarkdownService getReport", {
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
    });
    if (!this.subscribe.hasValue()) {
      throw new Error("PartialMarkdownService not initialized. Call subscribe() before generating reports.");
    }
    const storage = this.getStorage(symbol, strategyName, exchangeName, frameName, backtest);
    return storage.getReport(symbol, strategyName, columns);
  };

  /**
   * Saves symbol-strategy report to disk.
   * Creates directory if it doesn't exist.
   * Delegates to ReportStorage.dump().
   *
   * @param symbol - Trading pair symbol to save report for
   * @param strategyName - Strategy name to save report for
   * @param exchangeName - Exchange name
   * @param frameName - Frame name
   * @param backtest - True if backtest mode, false if live mode
   * @param path - Directory path to save report (default: "./dump/partial")
   * @param columns - Column configuration for formatting the table
   *
   * @example
   * ```typescript
   * const service = new PartialMarkdownService();
   *
   * // Save to default path: ./dump/partial/BTCUSDT_my-strategy.md
   * await service.dump("BTCUSDT", "my-strategy", "binance", "1h", false);
   *
   * // Save to custom path: ./custom/path/BTCUSDT_my-strategy.md
   * await service.dump("BTCUSDT", "my-strategy", "binance", "1h", false, "./custom/path");
   * ```
   */
  public dump = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
    path = "./dump/partial",
    columns: Columns[] = COLUMN_CONFIG.partial_columns
  ): Promise<void> => {
    this.loggerService.log("partialMarkdownService dump", {
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
      path,
    });
    if (!this.subscribe.hasValue()) {
      throw new Error("PartialMarkdownService not initialized. Call subscribe() before dumping reports.");
    }
    const storage = this.getStorage(symbol, strategyName, exchangeName, frameName, backtest);
    await storage.dump(symbol, strategyName, path, columns);
  };

  /**
   * Clears accumulated event data from storage.
   * If payload is provided, clears only that specific symbol-strategy-exchange-frame-backtest combination's data.
   * If nothing is provided, clears all data.
   *
   * @param payload - Optional payload with symbol, strategyName, exchangeName, frameName, backtest
   *
   * @example
   * ```typescript
   * const service = new PartialMarkdownService();
   *
   * // Clear specific combination
   * await service.clear({ symbol: "BTCUSDT", strategyName: "my-strategy", exchangeName: "binance", frameName: "1h", backtest: false });
   *
   * // Clear all data
   * await service.clear();
   * ```
   */
  public clear = async (payload?: { symbol: string; strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName; backtest: boolean }) => {
    this.loggerService.log("partialMarkdownService clear", {
      payload,
    });
    if (payload) {
      const key = CREATE_KEY_FN(payload.symbol, payload.strategyName, payload.exchangeName, payload.frameName, payload.backtest);
      this.getStorage.clear(key);
    } else {
      this.getStorage.clear();
    }
  };

}

export default PartialMarkdownService;

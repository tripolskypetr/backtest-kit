import { StrategyName } from "../../../interfaces/Strategy.interface";
import { Markdown } from "../../../classes/Markdown";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { memoize, singleshot } from "functools-kit";
import { riskSubject } from "../../../config/emitters";
import { RiskStatisticsModel, RiskEvent } from "../../../model/RiskStatistics.model";
import { ColumnModel } from "../../../model/Column.model";
import { COLUMN_CONFIG } from "../../../config/columns";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";

/**
 * Type alias for column configuration used in risk management markdown reports.
 * 
 * Represents a column model specifically designed to format and display
 * risk rejection events in markdown tables.
 * 
 * @typeParam RiskEvent - The risk event data type containing
 *   risk rejection details, symbol, and rejection reason
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
 * // Column to display rejection reason
 * const reasonColumn: Columns = {
 *   key: "reason",
 *   label: "Rejection Reason",
 *   format: (event) => event.reason,
 *   isVisible: () => true
 * };
 * ```
 * 
 * @see ColumnModel for the base interface
 * @see RiskEvent for the event data structure
 */
export type Columns = ColumnModel<RiskEvent>;

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
  if (frameName) { parts.push(frameName); parts.push("backtest"); }
  else parts.push("live");
  return `${parts.join("_")}-${timestamp}.md`;
};

/** Maximum number of events to store in risk reports */
const MAX_EVENTS = 250;

/**
 * Storage class for accumulating risk rejection events per symbol-strategy pair.
 * Maintains a chronological list of rejected signals due to risk limits.
 */
class ReportStorage {
  /** Internal list of all risk rejection events for this symbol */
  private _eventList: RiskEvent[] = [];

  constructor(
    readonly symbol: string,
    readonly strategyName: StrategyName,
    readonly exchangeName: ExchangeName,
    readonly frameName: FrameName
  ) {}

  /**
   * Adds a risk rejection event to the storage.
   *
   * @param event - Risk rejection event data
   */
  public addRejectionEvent(event: RiskEvent) {
    this._eventList.unshift(event);

    // Trim queue if exceeded MAX_EVENTS
    if (this._eventList.length > MAX_EVENTS) {
      this._eventList.pop();
    }
  }

  /**
   * Calculates statistical data from risk rejection events (Controller).
   *
   * @returns Statistical data (empty object if no events)
   */
  public async getData(): Promise<RiskStatisticsModel> {
    if (this._eventList.length === 0) {
      return {
        eventList: [],
        totalRejections: 0,
        bySymbol: {},
        byStrategy: {},
      };
    }

    const bySymbol: Record<string, number> = {};
    const byStrategy: Record<string, number> = {};

    for (const event of this._eventList) {
      bySymbol[event.symbol] = (bySymbol[event.symbol] || 0) + 1;
      byStrategy[event.strategyName] = (byStrategy[event.strategyName] || 0) + 1;
    }

    return {
      eventList: this._eventList,
      totalRejections: this._eventList.length,
      bySymbol,
      byStrategy,
    };
  }

  /**
   * Generates markdown report with all risk rejection events for a symbol-strategy pair (View).
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name
   * @param columns - Column configuration for formatting the table
   * @returns Markdown formatted report with all events
   */
  public async getReport(
    symbol: string,
    strategyName: StrategyName,
    columns: Columns[] = COLUMN_CONFIG.risk_columns
  ): Promise<string> {
    const stats = await this.getData();

    if (stats.totalRejections === 0) {
      return [
        `# Risk Rejection Report: ${symbol}:${strategyName}`,
        "",
        "No risk rejections recorded yet.",
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
      `# Risk Rejection Report: ${symbol}:${strategyName}`,
      "",
      table,
      "",
      `**Total rejections:** ${stats.totalRejections}`,
      "",
      "## Rejections by Symbol",
      ...Object.entries(stats.bySymbol).map(([sym, count]) => `- ${sym}: ${count}`),
      "",
      "## Rejections by Strategy",
      ...Object.entries(stats.byStrategy).map(([strat, count]) => `- ${strat}: ${count}`),
    ].join("\n");
  }

  /**
   * Saves symbol-strategy report to disk.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name
   * @param path - Directory path to save report (default: "./dump/risk")
   * @param columns - Column configuration for formatting the table
   */
  public async dump(
    symbol: string,
    strategyName: StrategyName,
    path = "./dump/risk",
    columns: Columns[] = COLUMN_CONFIG.risk_columns
  ): Promise<void> {
    const markdown = await this.getReport(symbol, strategyName, columns);
    const timestamp = Date.now();
    const filename = CREATE_FILE_NAME_FN(this.symbol, strategyName, this.exchangeName, this.frameName, timestamp);
    await Markdown.writeData("risk", markdown, {
      path,
      file: filename,
      symbol: this.symbol,
      signalId: "",
      strategyName: this.strategyName,
      exchangeName: this.exchangeName,
      frameName: this.frameName
    });
  }
}

/**
 * Service for generating and saving risk rejection markdown reports.
 *
 * Features:
 * - Listens to risk rejection events via riskSubject
 * - Accumulates all rejection events per symbol-strategy pair
 * - Generates markdown tables with detailed rejection information
 * - Provides statistics (total rejections, by symbol, by strategy)
 * - Saves reports to disk in dump/risk/{symbol}_{strategyName}.md
 *
 * @example
 * ```typescript
 * const service = new RiskMarkdownService();
 *
 * // Service automatically subscribes to subjects on init
 * // No manual callback setup needed
 *
 * // Later: generate and save report
 * await service.dump("BTCUSDT", "my-strategy");
 * ```
 */
export class RiskMarkdownService {
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
   * Subscribes to risk rejection emitter to receive rejection events.
   * Protected against multiple subscriptions.
   * Returns an unsubscribe function to stop receiving events.
   *
   * @example
   * ```typescript
   * const service = new RiskMarkdownService();
   * const unsubscribe = service.subscribe();
   * // ... later
   * unsubscribe();
   * ```
   */
  public subscribe = singleshot(() => {
    this.loggerService.log("riskMarkdownService init");
    const unsubscribe = riskSubject.subscribe(this.tickRejection);
    return () => {
      this.subscribe.clear();
      this.clear();
      unsubscribe();
    }
  });

  /**
   * Unsubscribes from risk rejection emitter to stop receiving events.
   * Calls the unsubscribe function returned by subscribe().
   * If not subscribed, does nothing.
   *
   * @example
   * ```typescript
   * const service = new RiskMarkdownService();
   * service.subscribe();
   * // ... later
   * service.unsubscribe();
   * ```
   */
  public unsubscribe = async () => {
    this.loggerService.log("riskMarkdownService unsubscribe");
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };

  /**
   * Processes risk rejection events and accumulates them.
   * Should be called from riskSubject subscription.
   *
   * @param data - Risk rejection event data with frameName wrapper
   *
   * @example
   * ```typescript
   * const service = new RiskMarkdownService();
   * // Service automatically subscribes in init()
   * ```
   */
  private tickRejection = async (data: RiskEvent) => {
    this.loggerService.log("riskMarkdownService tickRejection", {
      data,
    });

    const storage = this.getStorage(data.symbol, data.strategyName, data.exchangeName, data.frameName, data.backtest);
    storage.addRejectionEvent(data);
  };

  /**
   * Gets statistical data from all risk rejection events for a symbol-strategy pair.
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
   * const service = new RiskMarkdownService();
   * const stats = await service.getData("BTCUSDT", "my-strategy", "binance", "1h", false);
   * console.log(stats.totalRejections, stats.bySymbol);
   * ```
   */
  public getData = async (symbol: string, strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean): Promise<RiskStatisticsModel> => {
    this.loggerService.log("riskMarkdownService getData", {
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
    });
    if (!this.subscribe.hasValue()) {
      throw new Error("RiskMarkdownService not initialized. Call subscribe() before getting data.");
    }
    const storage = this.getStorage(symbol, strategyName, exchangeName, frameName, backtest);
    return storage.getData();
  };

  /**
   * Generates markdown report with all risk rejection events for a symbol-strategy pair.
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
   * const service = new RiskMarkdownService();
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
    columns: Columns[] = COLUMN_CONFIG.risk_columns
  ): Promise<string> => {
    this.loggerService.log("riskMarkdownService getReport", {
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
    });
    if (!this.subscribe.hasValue()) {
      throw new Error("RiskMarkdownService not initialized. Call subscribe() before generating reports.");
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
   * @param path - Directory path to save report (default: "./dump/risk")
   * @param columns - Column configuration for formatting the table
   *
   * @example
   * ```typescript
   * const service = new RiskMarkdownService();
   *
   * // Save to default path: ./dump/risk/BTCUSDT_my-strategy.md
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
    path = "./dump/risk",
    columns: Columns[] = COLUMN_CONFIG.risk_columns
  ): Promise<void> => {
    this.loggerService.log("riskMarkdownService dump", {
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
      path,
    });
    if (!this.subscribe.hasValue()) {
      throw new Error("RiskMarkdownService not initialized. Call subscribe() before dumping reports.");
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
   * const service = new RiskMarkdownService();
   *
   * // Clear specific combination
   * await service.clear({ symbol: "BTCUSDT", strategyName: "my-strategy", exchangeName: "binance", frameName: "1h", backtest: false });
   *
   * // Clear all data
   * await service.clear();
   * ```
   */
  public clear = async (payload?: { symbol: string; strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName; backtest: boolean }) => {
    this.loggerService.log("riskMarkdownService clear", {
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

export default RiskMarkdownService;

import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import {
  IStrategyTickResult,
  IStrategyTickResultOpened,
  IStrategyTickResultActive,
  IStrategyTickResultClosed,
  StrategyName,
} from "../../../interfaces/Strategy.interface";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { memoize, singleshot } from "functools-kit";
import { signalLiveEmitter } from "../../../config/emitters";
import { LiveStatisticsModel, TickEvent } from "../../../model/LiveStatistics.model";
import { ColumnModel } from "../../../model/Column.model";
import { COLUMN_CONFIG } from "../../../config/columns";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";

/**
 * Type alias for column configuration used in live trading markdown reports.
 * 
 * Represents a column model specifically designed to format and display
 * real-time trading events in markdown tables.
 * 
 * @typeParam TickEvent - The live trading event data type containing
 *   signal information, timestamps, and trade details from active positions
 * 
 * @example
 * ```typescript
 * // Column to display event timestamp
 * const timestampColumn: Columns = {
 *   key: "timestamp",
 *   label: "Time",
 *   format: (event) => new Date(event.timestamp).toISOString(),
 *   isVisible: () => true
 * };
 * 
 * // Column to display event action type
 * const actionColumn: Columns = {
 *   key: "action",
 *   label: "Action",
 *   format: (event) => event.action,
 *   isVisible: () => true
 * };
 * ```
 * 
 * @see ColumnModel for the base interface
 * @see TickEvent for the event data structure
 */
export type Columns = ColumnModel<TickEvent>;

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

/** Maximum number of events to store in live trading reports */
const MAX_EVENTS = 250;

/**
 * Storage class for accumulating all tick events per strategy.
 * Maintains a chronological list of all events (idle, opened, active, closed).
 */
class ReportStorage {
  /** Internal list of all tick events for this strategy */
  private _eventList: TickEvent[] = [];

  /**
   * Adds an idle event to the storage.
   * Replaces the last idle event only if there are no opened/active events after it.
   *
   * @param currentPrice - Current market price
   */
  public addIdleEvent(currentPrice: number) {
    const newEvent: TickEvent = {
      timestamp: Date.now(),
      action: "idle",
      currentPrice,
    };

    const lastIdleIndex = this._eventList.findLastIndex(
      (event) => event.action === "idle"
    );

    const canReplaceLastIdle = lastIdleIndex !== -1 &&
      !this._eventList
        .slice(lastIdleIndex + 1)
        .some((event) => event.action === "opened" || event.action === "active");

    if (canReplaceLastIdle) {
      this._eventList[lastIdleIndex] = newEvent;
      return;
    }
    
    {
      this._eventList.unshift(newEvent);
      if (this._eventList.length > MAX_EVENTS) {
        this._eventList.pop();
      }
    }
  }

  /**
   * Adds an opened event to the storage.
   *
   * @param data - Opened tick result
   */
  public addOpenedEvent(data: IStrategyTickResultOpened) {
    this._eventList.unshift({
      timestamp: data.signal.pendingAt,
      action: "opened",
      symbol: data.signal.symbol,
      signalId: data.signal.id,
      position: data.signal.position,
      note: data.signal.note,
      currentPrice: data.signal.priceOpen,
      openPrice: data.signal.priceOpen,
      takeProfit: data.signal.priceTakeProfit,
      stopLoss: data.signal.priceStopLoss,
    });

    // Trim queue if exceeded MAX_EVENTS
    if (this._eventList.length > MAX_EVENTS) {
      this._eventList.pop();
    }
  }

  /**
   * Adds an active event to the storage.
   * Replaces the last active event with the same signalId.
   *
   * @param data - Active tick result
   */
  public addActiveEvent(data: IStrategyTickResultActive) {
    const newEvent: TickEvent = {
      timestamp: Date.now(),
      action: "active",
      symbol: data.signal.symbol,
      signalId: data.signal.id,
      position: data.signal.position,
      note: data.signal.note,
      currentPrice: data.currentPrice,
      openPrice: data.signal.priceOpen,
      takeProfit: data.signal.priceTakeProfit,
      stopLoss: data.signal.priceStopLoss,
      percentTp: data.percentTp,
      percentSl: data.percentSl,
    };

    // Find the last active event with the same signalId
    const lastActiveIndex = this._eventList.findLastIndex(
      (event) => event.action === "active" && event.signalId === data.signal.id
    );

    // Replace the last active event with the same signalId
    if (lastActiveIndex !== -1) {
      this._eventList[lastActiveIndex] = newEvent;
      return;
    }

    // If no previous active event found, add new event
    this._eventList.unshift(newEvent);

    // Trim queue if exceeded MAX_EVENTS
    if (this._eventList.length > MAX_EVENTS) {
      this._eventList.pop();
    }
  }

  /**
   * Adds a closed event to the storage.
   *
   * @param data - Closed tick result
   */
  public addClosedEvent(data: IStrategyTickResultClosed) {
    const durationMs = data.closeTimestamp - data.signal.pendingAt;
    const durationMin = Math.round(durationMs / 60000);

    const newEvent: TickEvent = {
      timestamp: data.closeTimestamp,
      action: "closed",
      symbol: data.signal.symbol,
      signalId: data.signal.id,
      position: data.signal.position,
      note: data.signal.note,
      currentPrice: data.currentPrice,
      openPrice: data.signal.priceOpen,
      takeProfit: data.signal.priceTakeProfit,
      stopLoss: data.signal.priceStopLoss,
      pnl: data.pnl.pnlPercentage,
      closeReason: data.closeReason,
      duration: durationMin,
    };

    this._eventList.unshift(newEvent);

    // Trim queue if exceeded MAX_EVENTS
    if (this._eventList.length > MAX_EVENTS) {
      this._eventList.pop();
    }
  }

  /**
   * Calculates statistical data from live trading events (Controller).
   * Returns null for any unsafe numeric values (NaN, Infinity, etc).
   *
   * @returns Statistical data (empty object if no events)
   */
  public async getData(): Promise<LiveStatisticsModel> {
    if (this._eventList.length === 0) {
      return {
        eventList: [],
        totalEvents: 0,
        totalClosed: 0,
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

    const closedEvents = this._eventList.filter((e) => e.action === "closed");
    const totalClosed = closedEvents.length;
    const winCount = closedEvents.filter((e) => e.pnl && e.pnl > 0).length;
    const lossCount = closedEvents.filter((e) => e.pnl && e.pnl < 0).length;

    // Calculate basic statistics
    const avgPnl = totalClosed > 0
      ? closedEvents.reduce((sum, e) => sum + (e.pnl || 0), 0) / totalClosed
      : 0;
    const totalPnl = closedEvents.reduce((sum, e) => sum + (e.pnl || 0), 0);
    const winRate = (winCount / totalClosed) * 100;

    // Calculate Sharpe Ratio (risk-free rate = 0)
    let sharpeRatio = 0;
    let stdDev = 0;
    if (totalClosed > 0) {
      const returns = closedEvents.map((e) => e.pnl || 0);
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgPnl, 2), 0) / totalClosed;
      stdDev = Math.sqrt(variance);
      sharpeRatio = stdDev > 0 ? avgPnl / stdDev : 0;
    }
    const annualizedSharpeRatio = sharpeRatio * Math.sqrt(365);

    // Calculate Certainty Ratio
    let certaintyRatio = 0;
    if (totalClosed > 0) {
      const wins = closedEvents.filter((e) => e.pnl && e.pnl > 0);
      const losses = closedEvents.filter((e) => e.pnl && e.pnl < 0);
      const avgWin = wins.length > 0
        ? wins.reduce((sum, e) => sum + (e.pnl || 0), 0) / wins.length
        : 0;
      const avgLoss = losses.length > 0
        ? losses.reduce((sum, e) => sum + (e.pnl || 0), 0) / losses.length
        : 0;
      certaintyRatio = avgLoss < 0 ? avgWin / Math.abs(avgLoss) : 0;
    }

    // Calculate Expected Yearly Returns
    let expectedYearlyReturns = 0;
    if (totalClosed > 0) {
      const avgDurationMin = closedEvents.reduce(
        (sum, e) => sum + (e.duration || 0),
        0
      ) / totalClosed;
      const avgDurationDays = avgDurationMin / (60 * 24);
      const tradesPerYear = avgDurationDays > 0 ? 365 / avgDurationDays : 0;
      expectedYearlyReturns = avgPnl * tradesPerYear;
    }

    return {
      eventList: this._eventList,
      totalEvents: this._eventList.length,
      totalClosed,
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
   * Generates markdown report with all tick events for a strategy (View).
   *
   * @param strategyName - Strategy name
   * @param columns - Column configuration for formatting the table
   * @returns Markdown formatted report with all events
   */
  public async getReport(
    strategyName: StrategyName,
    columns: Columns[] = COLUMN_CONFIG.live_columns
  ): Promise<string> {
    const stats = await this.getData();

    if (stats.totalEvents === 0) {
      return [
        `# Live Trading Report: ${strategyName}`,
        "",
        "No events recorded yet."
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
    const table = tableData.map(row => `| ${row.join(" | ")} |`).join("\n");

    return [
      `# Live Trading Report: ${strategyName}`,
      "",
      table,
      "",
      `**Total events:** ${stats.totalEvents}`,
      `**Closed signals:** ${stats.totalClosed}`,
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
   * @param path - Directory path to save report (default: "./dump/live")
   * @param columns - Column configuration for formatting the table
   */
  public async dump(
    strategyName: StrategyName,
    path = "./dump/live",
    columns: Columns[] = COLUMN_CONFIG.live_columns
  ): Promise<void> {
    const markdown = await this.getReport(strategyName, columns);

    try {
      const dir = join(process.cwd(), path);
      await mkdir(dir, { recursive: true });

      const filename = `${strategyName}.md`;
      const filepath = join(dir, filename);

      await writeFile(filepath, markdown, "utf-8");
      console.log(`Live trading report saved: ${filepath}`);
    } catch (error) {
      console.error(`Failed to save markdown report:`, error);
    }
  }
}

/**
 * Service for generating and saving live trading markdown reports.
 *
 * Features:
 * - Listens to all signal events via onTick callback
 * - Accumulates all events (idle, opened, active, closed) per strategy
 * - Generates markdown tables with detailed event information
 * - Provides trading statistics (win rate, average PNL)
 * - Saves reports to disk in logs/live/{strategyName}.md
 *
 * @example
 * ```typescript
 * const service = new LiveMarkdownService();
 *
 * // Add to strategy callbacks
 * addStrategy({
 *   strategyName: "my-strategy",
 *   callbacks: {
 *     onTick: (symbol, result, backtest) => {
 *       if (!backtest) {
 *         service.tick(result);
 *       }
 *     }
 *   }
 * });
 *
 * // Later: generate and save report
 * await service.dump("my-strategy");
 * ```
 */
export class LiveMarkdownService {
  /** Logger service for debug output */
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * Memoized function to get or create ReportStorage for a symbol-strategy-exchange-frame-backtest combination.
   * Each combination gets its own isolated storage instance.
   */
  private getStorage = memoize<(symbol: string, strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean) => ReportStorage>(
    ([symbol, strategyName, exchangeName, frameName, backtest]) => CREATE_KEY_FN(symbol, strategyName, exchangeName, frameName, backtest),
    () => new ReportStorage()
  );

  /**
   * Subscribes to live signal emitter to receive tick events.
   * Protected against multiple subscriptions.
   * Returns an unsubscribe function to stop receiving events.
   *
   * @example
   * ```typescript
   * const service = new LiveMarkdownService();
   * const unsubscribe = service.subscribe();
   * // ... later
   * unsubscribe();
   * ```
   */
  public subscribe = singleshot(() => {
    this.loggerService.log("liveMarkdownService init");
    const unsubscribe = signalLiveEmitter.subscribe(this.tick);
    return () => {
      this.subscribe.clear();
      this.clear();
      unsubscribe();
    }
  });

  /**
   * Unsubscribes from live signal emitter to stop receiving tick events.
   * Calls the unsubscribe function returned by subscribe().
   * If not subscribed, does nothing.
   *
   * @example
   * ```typescript
   * const service = new LiveMarkdownService();
   * service.subscribe();
   * // ... later
   * service.unsubscribe();
   * ```
   */
  public unsubscribe = async () => {
    this.loggerService.log("liveMarkdownService unsubscribe");
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };

  /**
   * Processes tick events and accumulates all event types.
   * Should be called from IStrategyCallbacks.onTick.
   *
   * Processes all event types: idle, opened, active, closed.
   *
   * @param data - Tick result from strategy execution with frameName wrapper
   *
   * @example
   * ```typescript
   * const service = new LiveMarkdownService();
   *
   * callbacks: {
   *   onTick: (symbol, result, backtest) => {
   *     if (!backtest) {
   *       service.tick(result);
   *     }
   *   }
   * }
   * ```
   */
  private tick = async (data: IStrategyTickResult) => {
    this.loggerService.log("liveMarkdownService tick", {
      data,
    });

    const storage = this.getStorage(data.symbol, data.strategyName, data.exchangeName, data.frameName, false);

    if (data.action === "idle") {
      storage.addIdleEvent(data.currentPrice);
    } else if (data.action === "opened") {
      storage.addOpenedEvent(data);
    } else if (data.action === "active") {
      storage.addActiveEvent(data);
    } else if (data.action === "closed") {
      storage.addClosedEvent(data);
    }
  };

  /**
   * Gets statistical data from all live trading events for a symbol-strategy pair.
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
   * const service = new LiveMarkdownService();
   * const stats = await service.getData("BTCUSDT", "my-strategy", "binance", "1h", false);
   * console.log(stats.sharpeRatio, stats.winRate);
   * ```
   */
  public getData = async (symbol: string, strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean): Promise<LiveStatisticsModel> => {
    this.loggerService.log("liveMarkdownService getData", {
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
    });
    if (!this.subscribe.hasValue()) {
      throw new Error("LiveMarkdownService not initialized. Call subscribe() before getting data.");
    }
    const storage = this.getStorage(symbol, strategyName, exchangeName, frameName, backtest);
    return storage.getData();
  };

  /**
   * Generates markdown report with all events for a symbol-strategy pair.
   * Delegates to ReportStorage.getReport().
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to generate report for
   * @param exchangeName - Exchange name
   * @param frameName - Frame name
   * @param backtest - True if backtest mode, false if live mode
   * @param columns - Column configuration for formatting the table
   * @returns Markdown formatted report string with table of all events
   *
   * @example
   * ```typescript
   * const service = new LiveMarkdownService();
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
    columns: Columns[] = COLUMN_CONFIG.live_columns
  ): Promise<string> => {
    this.loggerService.log("liveMarkdownService getReport", {
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
    });
    if (!this.subscribe.hasValue()) {
      throw new Error("LiveMarkdownService not initialized. Call subscribe() before generating reports.");
    }
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
   * @param path - Directory path to save report (default: "./dump/live")
   * @param columns - Column configuration for formatting the table
   *
   * @example
   * ```typescript
   * const service = new LiveMarkdownService();
   *
   * // Save to default path: ./dump/live/my-strategy.md
   * await service.dump("BTCUSDT", "my-strategy", "binance", "1h", false);
   *
   * // Save to custom path: ./custom/path/my-strategy.md
   * await service.dump("BTCUSDT", "my-strategy", "binance", "1h", false, "./custom/path");
   * ```
   */
  public dump = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
    path = "./dump/live",
    columns: Columns[] = COLUMN_CONFIG.live_columns
  ): Promise<void> => {
    this.loggerService.log("liveMarkdownService dump", {
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
      path,
    });
    if (!this.subscribe.hasValue()) {
      throw new Error("LiveMarkdownService not initialized. Call subscribe() before dumping reports.");
    }
    const storage = this.getStorage(symbol, strategyName, exchangeName, frameName, backtest);
    await storage.dump(strategyName, path, columns);
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
   * const service = new LiveMarkdownService();
   *
   * // Clear specific combination
   * await service.clear({ symbol: "BTCUSDT", strategyName: "my-strategy", exchangeName: "binance", frameName: "1h", backtest: false });
   *
   * // Clear all data
   * await service.clear();
   * ```
   */
  public clear = async (payload?: { symbol: string; strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName; backtest: boolean }) => {
    this.loggerService.log("liveMarkdownService clear", {
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

export default LiveMarkdownService;

import { Markdown } from "../../../classes/Markdown";
import {
  IStrategyTickResult,
  IStrategyTickResultScheduled,
  IStrategyTickResultCancelled,
  IStrategyTickResultOpened,
  StrategyName,
} from "../../../interfaces/Strategy.interface";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { memoize, singleshot } from "functools-kit";
import { signalEmitter, signalLiveEmitter } from "../../../config/emitters";
import { ScheduleStatisticsModel, ScheduledEvent } from "../../../model/ScheduleStatistics.model";
import { ColumnModel } from "../../../model/Column.model";
import { COLUMN_CONFIG } from "../../../config/columns";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";

/**
 * Type alias for column configuration used in scheduled events markdown reports.
 * 
 * Represents a column model specifically designed to format and display
 * scheduled and cancelled signal events in markdown tables.
 * 
 * @typeParam ScheduledEvent - The scheduled event data type containing
 *   signal scheduling information, cancellation details, and timing
 * 
 * @example
 * ```typescript
 * // Column to display event type
 * const typeColumn: Columns = {
 *   key: "type",
 *   label: "Type",
 *   format: (event) => event.type,
 *   isVisible: () => true
 * };
 * 
 * // Column to display scheduled time
 * const timeColumn: Columns = {
 *   key: "time",
 *   label: "Scheduled Time",
 *   format: (event) => new Date(event.timestamp).toISOString(),
 *   isVisible: () => true
 * };
 * ```
 * 
 * @see ColumnModel for the base interface
 * @see ScheduledEvent for the event data structure
 */
export type Columns = ColumnModel<ScheduledEvent>;

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
 * @param symbol - Trading pair symbol
 * @param strategyName - Name of the strategy
 * @param exchangeName - Exchange name
 * @param frameName - Frame name
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Filename string
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

/** Maximum number of events to store in schedule reports */
const MAX_EVENTS = 250;

/**
 * Storage class for accumulating scheduled signal events per strategy.
 * Maintains a chronological list of scheduled and cancelled events.
 */
class ReportStorage {
  /** Internal list of all scheduled events for this strategy */
  private _eventList: ScheduledEvent[] = [];

  constructor(
    readonly symbol: string,
    readonly strategyName: StrategyName,
    readonly exchangeName: ExchangeName,
    readonly frameName: FrameName
  ) {}

  /**
   * Adds a scheduled event to the storage.
   *
   * @param data - Scheduled tick result
   */
  public addScheduledEvent(data: IStrategyTickResultScheduled) {
    this._eventList.unshift({
      timestamp: data.signal.scheduledAt,
      action: "scheduled",
      symbol: data.signal.symbol,
      signalId: data.signal.id,
      position: data.signal.position,
      note: data.signal.note,
      currentPrice: data.currentPrice,
      priceOpen: data.signal.priceOpen,
      takeProfit: data.signal.priceTakeProfit,
      stopLoss: data.signal.priceStopLoss,
      originalPriceTakeProfit: data.signal.originalPriceTakeProfit,
      originalPriceStopLoss: data.signal.originalPriceStopLoss,
      totalExecuted: data.signal.totalExecuted,
    });

    // Trim queue if exceeded MAX_EVENTS
    if (this._eventList.length > MAX_EVENTS) {
      this._eventList.pop();
    }
  }

  /**
   * Adds an opened event to the storage.
   *
   * @param data - Opened tick result
   */
  public addOpenedEvent(data: IStrategyTickResultOpened) {
    const durationMs = data.signal.pendingAt - data.signal.scheduledAt;
    const durationMin = Math.round(durationMs / 60000);

    const newEvent: ScheduledEvent = {
      timestamp: data.signal.pendingAt,
      action: "opened",
      symbol: data.signal.symbol,
      signalId: data.signal.id,
      position: data.signal.position,
      note: data.signal.note,
      currentPrice: data.currentPrice,
      priceOpen: data.signal.priceOpen,
      takeProfit: data.signal.priceTakeProfit,
      stopLoss: data.signal.priceStopLoss,
      originalPriceTakeProfit: data.signal.originalPriceTakeProfit,
      originalPriceStopLoss: data.signal.originalPriceStopLoss,
      totalExecuted: data.signal.totalExecuted,
      duration: durationMin,
    };

    this._eventList.unshift(newEvent);

    // Trim queue if exceeded MAX_EVENTS
    if (this._eventList.length > MAX_EVENTS) {
      this._eventList.pop();
    }
  }

  /**
   * Adds a cancelled event to the storage.
   *
   * @param data - Cancelled tick result
   */
  public addCancelledEvent(data: IStrategyTickResultCancelled) {
    const durationMs = data.closeTimestamp - data.signal.scheduledAt;
    const durationMin = Math.round(durationMs / 60000);

    const newEvent: ScheduledEvent = {
      timestamp: data.closeTimestamp,
      action: "cancelled",
      symbol: data.signal.symbol,
      signalId: data.signal.id,
      position: data.signal.position,
      note: data.signal.note,
      currentPrice: data.currentPrice,
      priceOpen: data.signal.priceOpen,
      takeProfit: data.signal.priceTakeProfit,
      stopLoss: data.signal.priceStopLoss,
      originalPriceTakeProfit: data.signal.originalPriceTakeProfit,
      originalPriceStopLoss: data.signal.originalPriceStopLoss,
      totalExecuted: data.signal.totalExecuted,
      closeTimestamp: data.closeTimestamp,
      duration: durationMin,
      cancelReason: data.reason,
      cancelId: data.cancelId,
    };

    this._eventList.unshift(newEvent);

    // Trim queue if exceeded MAX_EVENTS
    if (this._eventList.length > MAX_EVENTS) {
      this._eventList.pop();
    }
  }

  /**
   * Calculates statistical data from scheduled signal events (Controller).
   *
   * @returns Statistical data (empty object if no events)
   */
  public async getData(): Promise<ScheduleStatisticsModel> {
    if (this._eventList.length === 0) {
      return {
        eventList: [],
        totalEvents: 0,
        totalScheduled: 0,
        totalOpened: 0,
        totalCancelled: 0,
        cancellationRate: null,
        activationRate: null,
        avgWaitTime: null,
        avgActivationTime: null,
      };
    }

    const scheduledEvents = this._eventList.filter(
      (e) => e.action === "scheduled"
    );
    const openedEvents = this._eventList.filter(
      (e) => e.action === "opened"
    );
    const cancelledEvents = this._eventList.filter(
      (e) => e.action === "cancelled"
    );

    const totalScheduled = scheduledEvents.length;
    const totalOpened = openedEvents.length;
    const totalCancelled = cancelledEvents.length;

    // Calculate cancellation rate
    const cancellationRate =
      totalScheduled > 0 ? (totalCancelled / totalScheduled) * 100 : null;

    // Calculate activation rate
    const activationRate =
      totalScheduled > 0 ? (totalOpened / totalScheduled) * 100 : null;

    // Calculate average wait time for cancelled signals
    const avgWaitTime =
      totalCancelled > 0
        ? cancelledEvents.reduce((sum, e) => sum + (e.duration || 0), 0) /
          totalCancelled
        : null;

    // Calculate average activation time for opened signals
    const avgActivationTime =
      totalOpened > 0
        ? openedEvents.reduce((sum, e) => sum + (e.duration || 0), 0) /
          totalOpened
        : null;

    return {
      eventList: this._eventList,
      totalEvents: this._eventList.length,
      totalScheduled,
      totalOpened,
      totalCancelled,
      cancellationRate,
      activationRate,
      avgWaitTime,
      avgActivationTime,
    };
  }

  /**
   * Generates markdown report with all scheduled events for a strategy (View).
   *
   * @param strategyName - Strategy name
   * @param columns - Column configuration for formatting the table
   * @returns Markdown formatted report with all events
   */
  public async getReport(
    strategyName: StrategyName,
    columns: Columns[] = COLUMN_CONFIG.schedule_columns
  ): Promise<string> {
    const stats = await this.getData();

    if (stats.totalEvents === 0) {
      return [
        `# Scheduled Signals Report: ${strategyName}`,
        "",
        "No scheduled signals recorded yet."
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
      `# Scheduled Signals Report: ${strategyName}`,
      "",
      table,
      "",
      `**Total events:** ${stats.totalEvents}`,
      `**Scheduled signals:** ${stats.totalScheduled}`,
      `**Opened signals:** ${stats.totalOpened}`,
      `**Cancelled signals:** ${stats.totalCancelled}`,
      `**Activation rate:** ${stats.activationRate === null ? "N/A" : `${stats.activationRate.toFixed(2)}% (higher is better)`}`,
      `**Cancellation rate:** ${stats.cancellationRate === null ? "N/A" : `${stats.cancellationRate.toFixed(2)}% (lower is better)`}`,
      `**Average activation time:** ${stats.avgActivationTime === null ? "N/A" : `${stats.avgActivationTime.toFixed(2)} minutes`}`,
      `**Average wait time (cancelled):** ${stats.avgWaitTime === null ? "N/A" : `${stats.avgWaitTime.toFixed(2)} minutes`}`
    ].join("\n");
  }

  /**
   * Saves strategy report to disk.
   *
   * @param strategyName - Strategy name
   * @param path - Directory path to save report (default: "./dump/schedule")
   * @param columns - Column configuration for formatting the table
   */
  public async dump(
    strategyName: StrategyName,
    path = "./dump/schedule",
    columns: Columns[] = COLUMN_CONFIG.schedule_columns
  ): Promise<void> {
    const markdown = await this.getReport(strategyName, columns);
    const timestamp = Date.now();
    const filename = CREATE_FILE_NAME_FN(this.symbol, strategyName, this.exchangeName, this.frameName, timestamp);
    await Markdown.writeData("schedule", markdown, {
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
 * Service for generating and saving scheduled signals markdown reports.
 *
 * Features:
 * - Listens to scheduled and cancelled signal events via signalLiveEmitter
 * - Accumulates all events (scheduled, cancelled) per strategy
 * - Generates markdown tables with detailed event information
 * - Provides statistics (cancellation rate, average wait time)
 * - Saves reports to disk in logs/schedule/{strategyName}.md
 *
 * @example
 * ```typescript
 * const service = new ScheduleMarkdownService();
 *
 * // Service automatically subscribes to signalLiveEmitter on init
 * // No manual callback setup needed
 *
 * // Later: generate and save report
 * await service.dump("my-strategy");
 * ```
 */
export class ScheduleMarkdownService {
  /** Logger service for debug output */
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * Memoized function to get or create ReportStorage for a symbol-strategy-exchange-frame-backtest combination.
   * Each combination gets its own isolated storage instance.
   */
  private getStorage = memoize<(symbol: string, strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean) => ReportStorage>(
    ([symbol, strategyName, exchangeName, frameName, backtest]) => CREATE_KEY_FN(symbol, strategyName, exchangeName, frameName, backtest),
    (symbol, strategyName, exchangeName, frameName) => new ReportStorage(symbol, strategyName, exchangeName, frameName)
  );

  /**
   * Subscribes to signal emitter to receive scheduled signal events.
   * Protected against multiple subscriptions.
   * Returns an unsubscribe function to stop receiving events.
   *
   * @example
   * ```typescript
   * const service = new ScheduleMarkdownService();
   * const unsubscribe = service.subscribe();
   * // ... later
   * unsubscribe();
   * ```
   */
  public subscribe = singleshot(() => {
    this.loggerService.log("scheduleMarkdownService init");
    const unsubscribe = signalEmitter.subscribe(this.tick);
    return () => {
      this.subscribe.clear();
      this.clear();
      unsubscribe();
    }
  });

  /**
   * Unsubscribes from signal emitter to stop receiving scheduled signal events.
   * Calls the unsubscribe function returned by subscribe().
   * If not subscribed, does nothing.
   *
   * @example
   * ```typescript
   * const service = new ScheduleMarkdownService();
   * service.subscribe();
   * // ... later
   * service.unsubscribe();
   * ```
   */
  public unsubscribe = async () => {
    this.loggerService.log("scheduleMarkdownService unsubscribe");
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };

  /**
   * Processes tick events and accumulates scheduled/opened/cancelled events.
   * Should be called from signalEmitter subscription.
   *
   * Processes only scheduled, opened and cancelled event types.
   *
   * @param data - Tick result from strategy execution with frameName wrapper
   *
   * @example
   * ```typescript
   * const service = new ScheduleMarkdownService();
   * // Service automatically subscribes in init()
   * ```
   */
  private tick = async (data: IStrategyTickResult) => {
    this.loggerService.log("scheduleMarkdownService tick", {
      data,
    });

    const storage = this.getStorage(data.symbol, data.strategyName, data.exchangeName, data.frameName, data.backtest);

    if (data.action === "scheduled") {
      storage.addScheduledEvent(data);
    } else if (data.action === "opened") {
      // Check if this opened signal was previously scheduled
      // by checking if signal has scheduledAt != pendingAt
      if (data.signal.scheduledAt !== data.signal.pendingAt) {
        storage.addOpenedEvent(data);
      }
    } else if (data.action === "cancelled") {
      storage.addCancelledEvent(data);
    }
  };

  /**
   * Gets statistical data from all scheduled signal events for a symbol-strategy pair.
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
   * const service = new ScheduleMarkdownService();
   * const stats = await service.getData("BTCUSDT", "my-strategy", "binance", "1h", false);
   * console.log(stats.cancellationRate, stats.avgWaitTime);
   * ```
   */
  public getData = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean
  ): Promise<ScheduleStatisticsModel> => {
    this.loggerService.log("scheduleMarkdownService getData", {
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
    });
    if (!this.subscribe.hasValue()) {
      throw new Error("ScheduleMarkdownService not initialized. Call subscribe() before getting data.");
    }
    const storage = this.getStorage(symbol, strategyName, exchangeName, frameName, backtest);
    return storage.getData();
  };

  /**
   * Generates markdown report with all scheduled events for a symbol-strategy pair.
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
   * const service = new ScheduleMarkdownService();
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
    columns: Columns[] = COLUMN_CONFIG.schedule_columns
  ): Promise<string> => {
    this.loggerService.log("scheduleMarkdownService getReport", {
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
    });
    if (!this.subscribe.hasValue()) {
      throw new Error("ScheduleMarkdownService not initialized. Call subscribe() before generating reports.");
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
   * @param path - Directory path to save report (default: "./dump/schedule")
   * @param columns - Column configuration for formatting the table
   *
   * @example
   * ```typescript
   * const service = new ScheduleMarkdownService();
   *
   * // Save to default path: ./dump/schedule/my-strategy.md
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
    path = "./dump/schedule",
    columns: Columns[] = COLUMN_CONFIG.schedule_columns
  ): Promise<void> => {
    this.loggerService.log("scheduleMarkdownService dump", {
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
      path,
    });
    if (!this.subscribe.hasValue()) {
      throw new Error("ScheduleMarkdownService not initialized. Call subscribe() before dumping reports.");
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
   * const service = new ScheduleMarkdownService();
   *
   * // Clear specific combination
   * await service.clear({ symbol: "BTCUSDT", strategyName: "my-strategy", exchangeName: "binance", frameName: "1h", backtest: false });
   *
   * // Clear all data
   * await service.clear();
   * ```
   */
  public clear = async (payload?: { symbol: string; strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName; backtest: boolean }) => {
    this.loggerService.log("scheduleMarkdownService clear", {
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

export default ScheduleMarkdownService;

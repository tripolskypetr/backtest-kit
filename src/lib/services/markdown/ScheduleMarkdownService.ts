import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
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
import { schedule_columns } from "../../../assets/schedule.columns";

/** Maximum number of events to store in schedule reports */
const MAX_EVENTS = 250;

/**
 * Storage class for accumulating scheduled signal events per strategy.
 * Maintains a chronological list of scheduled and cancelled events.
 */
class ReportStorage {
  /** Internal list of all scheduled events for this strategy */
  private _eventList: ScheduledEvent[] = [];

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
      closeTimestamp: data.closeTimestamp,
      duration: durationMin,
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
   * @returns Markdown formatted report with all events
   */
  public async getReport(strategyName: StrategyName): Promise<string> {
    const stats = await this.getData();

    if (stats.totalEvents === 0) {
      return [
        `# Scheduled Signals Report: ${strategyName}`,
        "",
        "No scheduled signals recorded yet."
      ].join("\n");
    }

    const visibleColumns = schedule_columns.filter((col) => col.isVisible());
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
   */
  public async dump(
    strategyName: StrategyName,
    path = "./dump/schedule"
  ): Promise<void> {
    const markdown = await this.getReport(strategyName);

    try {
      const dir = join(process.cwd(), path);
      await mkdir(dir, { recursive: true });

      const filename = `${strategyName}.md`;
      const filepath = join(dir, filename);

      await writeFile(filepath, markdown, "utf-8");
      console.log(`Scheduled signals report saved: ${filepath}`);
    } catch (error) {
      console.error(`Failed to save markdown report:`, error);
    }
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
   * Memoized function to get or create ReportStorage for a symbol-strategy pair.
   * Each symbol-strategy combination gets its own isolated storage instance.
   */
  private getStorage = memoize<(symbol: string, strategyName: string) => ReportStorage>(
    ([symbol, strategyName]) => `${symbol}:${strategyName}`,
    () => new ReportStorage()
  );

  /**
   * Processes tick events and accumulates scheduled/opened/cancelled events.
   * Should be called from signalEmitter subscription.
   *
   * Processes only scheduled, opened and cancelled event types.
   *
   * @param data - Tick result from strategy execution
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

    const storage = this.getStorage(data.symbol, data.strategyName);

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
   * @returns Statistical data object with all metrics
   *
   * @example
   * ```typescript
   * const service = new ScheduleMarkdownService();
   * const stats = await service.getData("BTCUSDT", "my-strategy");
   * console.log(stats.cancellationRate, stats.avgWaitTime);
   * ```
   */
  public getData = async (
    symbol: string,
    strategyName: StrategyName
  ): Promise<ScheduleStatisticsModel> => {
    this.loggerService.log("scheduleMarkdownService getData", {
      symbol,
      strategyName,
    });
    const storage = this.getStorage(symbol, strategyName);
    return storage.getData();
  };

  /**
   * Generates markdown report with all scheduled events for a symbol-strategy pair.
   * Delegates to ReportStorage.getReport().
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to generate report for
   * @returns Markdown formatted report string with table of all events
   *
   * @example
   * ```typescript
   * const service = new ScheduleMarkdownService();
   * const markdown = await service.getReport("BTCUSDT", "my-strategy");
   * console.log(markdown);
   * ```
   */
  public getReport = async (symbol: string, strategyName: StrategyName): Promise<string> => {
    this.loggerService.log("scheduleMarkdownService getReport", {
      symbol,
      strategyName,
    });
    const storage = this.getStorage(symbol, strategyName);
    return storage.getReport(strategyName);
  };

  /**
   * Saves symbol-strategy report to disk.
   * Creates directory if it doesn't exist.
   * Delegates to ReportStorage.dump().
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to save report for
   * @param path - Directory path to save report (default: "./dump/schedule")
   *
   * @example
   * ```typescript
   * const service = new ScheduleMarkdownService();
   *
   * // Save to default path: ./dump/schedule/my-strategy.md
   * await service.dump("BTCUSDT", "my-strategy");
   *
   * // Save to custom path: ./custom/path/my-strategy.md
   * await service.dump("BTCUSDT", "my-strategy", "./custom/path");
   * ```
   */
  public dump = async (
    symbol: string,
    strategyName: StrategyName,
    path = "./dump/schedule"
  ): Promise<void> => {
    this.loggerService.log("scheduleMarkdownService dump", {
      symbol,
      strategyName,
      path,
    });
    const storage = this.getStorage(symbol, strategyName);
    await storage.dump(strategyName, path);
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
   * const service = new ScheduleMarkdownService();
   *
   * // Clear specific symbol-strategy pair
   * await service.clear({ symbol: "BTCUSDT", strategyName: "my-strategy" });
   *
   * // Clear all data
   * await service.clear();
   * ```
   */
  public clear = async (ctx?: { symbol: string; strategyName: StrategyName }) => {
    this.loggerService.log("scheduleMarkdownService clear", {
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
   * Initializes the service by subscribing to live signal events.
   * Uses singleshot to ensure initialization happens only once.
   * Automatically called on first use.
   *
   * @example
   * ```typescript
   * const service = new ScheduleMarkdownService();
   * await service.init(); // Subscribe to live events
   * ```
   */
  protected init = singleshot(async () => {
    this.loggerService.log("scheduleMarkdownService init");
    signalEmitter.subscribe(this.tick);
  });
}

export default ScheduleMarkdownService;

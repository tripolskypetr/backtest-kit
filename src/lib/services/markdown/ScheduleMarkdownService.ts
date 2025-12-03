import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import {
  IStrategyTickResult,
  IStrategyTickResultScheduled,
  IStrategyTickResultCancelled,
  StrategyName,
} from "../../../interfaces/Strategy.interface";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { memoize, singleshot, str } from "functools-kit";
import { signalEmitter, signalLiveEmitter } from "../../../config/emitters";

/**
 * Unified scheduled signal event data for report generation.
 * Contains all information about scheduled and cancelled events.
 */
interface ScheduledEvent {
  /** Event timestamp in milliseconds (scheduledAt for scheduled/cancelled events) */
  timestamp: number;
  /** Event action type */
  action: "scheduled" | "cancelled";
  /** Trading pair symbol */
  symbol: string;
  /** Signal ID */
  signalId: string;
  /** Position type */
  position: string;
  /** Signal note */
  note?: string;
  /** Current market price */
  currentPrice: number;
  /** Scheduled entry price */
  priceOpen: number;
  /** Take profit price */
  takeProfit: number;
  /** Stop loss price */
  stopLoss: number;
  /** Close timestamp (only for cancelled) */
  closeTimestamp?: number;
  /** Duration in minutes (only for cancelled) */
  duration?: number;
}

/**
 * Statistical data calculated from scheduled signals.
 *
 * Provides metrics for scheduled signal tracking and cancellation analysis.
 *
 * @example
 * ```typescript
 * const stats = await Schedule.getData("my-strategy");
 *
 * console.log(`Total events: ${stats.totalEvents}`);
 * console.log(`Scheduled signals: ${stats.totalScheduled}`);
 * console.log(`Cancelled signals: ${stats.totalCancelled}`);
 * console.log(`Cancellation rate: ${stats.cancellationRate}%`);
 *
 * // Access raw event data (includes scheduled, cancelled)
 * stats.eventList.forEach(event => {
 *   if (event.action === "cancelled") {
 *     console.log(`Cancelled signal: ${event.signalId}`);
 *   }
 * });
 * ```
 */
export interface ScheduleStatistics {
  /** Array of all scheduled/cancelled events with full details */
  eventList: ScheduledEvent[];

  /** Total number of all events (includes scheduled, cancelled) */
  totalEvents: number;

  /** Total number of scheduled signals */
  totalScheduled: number;

  /** Total number of cancelled signals */
  totalCancelled: number;

  /** Cancellation rate as percentage (0-100), null if no scheduled signals. Lower is better. */
  cancellationRate: number | null;

  /** Average waiting time for cancelled signals in minutes, null if no cancelled signals */
  avgWaitTime: number | null;
}

/**
 * Column configuration for markdown table generation.
 * Defines how to extract and format data from scheduled events.
 */
interface Column {
  /** Unique column identifier */
  key: string;
  /** Display label for column header */
  label: string;
  /** Formatting function to convert event data to string */
  format: (data: ScheduledEvent) => string;
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
    key: "note",
    label: "Note",
    format: (data) => data.note ?? "N/A",
  },
  {
    key: "currentPrice",
    label: "Current Price",
    format: (data) => `${data.currentPrice.toFixed(8)} USD`,
  },
  {
    key: "priceOpen",
    label: "Entry Price",
    format: (data) => `${data.priceOpen.toFixed(8)} USD`,
  },
  {
    key: "takeProfit",
    label: "Take Profit",
    format: (data) => `${data.takeProfit.toFixed(8)} USD`,
  },
  {
    key: "stopLoss",
    label: "Stop Loss",
    format: (data) => `${data.stopLoss.toFixed(8)} USD`,
  },
  {
    key: "duration",
    label: "Wait Time (min)",
    format: (data) =>
      data.duration !== undefined ? `${data.duration}` : "N/A",
  },
];

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
    this._eventList.push({
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
      this._eventList.shift();
    }
  }

  /**
   * Updates or adds a cancelled event to the storage.
   * Replaces the previous event with the same signalId.
   *
   * @param data - Cancelled tick result
   */
  public addCancelledEvent(data: IStrategyTickResultCancelled) {
    const durationMs = data.closeTimestamp - data.signal.scheduledAt;
    const durationMin = Math.round(durationMs / 60000);

    // Find existing event with the same signalId
    const existingIndex = this._eventList.findIndex(
      (event) => event.signalId === data.signal.id
    );

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

    // Replace existing event or add new one
    if (existingIndex !== -1) {
      this._eventList[existingIndex] = newEvent;
    } else {
      this._eventList.push(newEvent);

      // Trim queue if exceeded MAX_EVENTS
      if (this._eventList.length > MAX_EVENTS) {
        this._eventList.shift();
      }
    }
  }

  /**
   * Calculates statistical data from scheduled signal events (Controller).
   *
   * @returns Statistical data (empty object if no events)
   */
  public async getData(): Promise<ScheduleStatistics> {
    if (this._eventList.length === 0) {
      return {
        eventList: [],
        totalEvents: 0,
        totalScheduled: 0,
        totalCancelled: 0,
        cancellationRate: null,
        avgWaitTime: null,
      };
    }

    const scheduledEvents = this._eventList.filter(
      (e) => e.action === "scheduled"
    );
    const cancelledEvents = this._eventList.filter(
      (e) => e.action === "cancelled"
    );

    const totalScheduled = scheduledEvents.length;
    const totalCancelled = cancelledEvents.length;

    // Calculate cancellation rate
    const cancellationRate =
      totalScheduled > 0 ? (totalCancelled / totalScheduled) * 100 : null;

    // Calculate average wait time for cancelled signals
    const avgWaitTime =
      totalCancelled > 0
        ? cancelledEvents.reduce((sum, e) => sum + (e.duration || 0), 0) /
          totalCancelled
        : null;

    return {
      eventList: this._eventList,
      totalEvents: this._eventList.length,
      totalScheduled,
      totalCancelled,
      cancellationRate,
      avgWaitTime,
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
      return str.newline(
        `# Scheduled Signals Report: ${strategyName}`,
        "",
        "No scheduled signals recorded yet."
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
      `# Scheduled Signals Report: ${strategyName}`,
      "",
      table,
      "",
      `**Total events:** ${stats.totalEvents}`,
      `**Scheduled signals:** ${stats.totalScheduled}`,
      `**Cancelled signals:** ${stats.totalCancelled}`,
      `**Cancellation rate:** ${stats.cancellationRate === null ? "N/A" : `${stats.cancellationRate.toFixed(2)}% (lower is better)`}`,
      `**Average wait time (cancelled):** ${stats.avgWaitTime === null ? "N/A" : `${stats.avgWaitTime.toFixed(2)} minutes`}`
    );
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
   * Processes tick events and accumulates scheduled/cancelled events.
   * Should be called from signalLiveEmitter subscription.
   *
   * Processes only scheduled and cancelled event types.
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
  ): Promise<ScheduleStatistics> => {
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

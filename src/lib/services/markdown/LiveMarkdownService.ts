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
import { toPlainString } from "../../../helpers/toPlainString";

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

/**
 * Unified tick event data for report generation.
 * Contains all information about a tick event regardless of action type.
 */
interface TickEvent {
  /** Event timestamp in milliseconds (pendingAt for opened/closed events) */
  timestamp: number;
  /** Event action type */
  action: "idle" | "opened" | "active" | "closed";
  /** Trading pair symbol (only for non-idle events) */
  symbol?: string;
  /** Signal ID (only for opened/active/closed) */
  signalId?: string;
  /** Position type (only for opened/active/closed) */
  position?: string;
  /** Signal note (only for opened/active/closed) */
  note?: string;
  /** Current price */
  currentPrice: number;
  /** Open price (only for opened/active/closed) */
  openPrice?: number;
  /** Take profit price (only for opened/active/closed) */
  takeProfit?: number;
  /** Stop loss price (only for opened/active/closed) */
  stopLoss?: number;
  /** Percentage progress towards take profit (only for active) */
  percentTp?: number;
  /** Percentage progress towards stop loss (only for active) */
  percentSl?: number;
  /** PNL percentage (only for closed) */
  pnl?: number;
  /** Close reason (only for closed) */
  closeReason?: string;
  /** Duration in minutes (only for closed) */
  duration?: number;
}

/**
 * Statistical data calculated from live trading results.
 *
 * All numeric values are null if calculation is unsafe (NaN, Infinity, etc).
 * Provides comprehensive metrics for live trading performance analysis.
 *
 * @example
 * ```typescript
 * const stats = await Live.getData("my-strategy");
 *
 * console.log(`Total events: ${stats.totalEvents}`);
 * console.log(`Closed signals: ${stats.totalClosed}`);
 * console.log(`Win rate: ${stats.winRate}%`);
 * console.log(`Sharpe Ratio: ${stats.sharpeRatio}`);
 *
 * // Access raw event data (includes idle, opened, active, closed)
 * stats.eventList.forEach(event => {
 *   if (event.action === "closed") {
 *     console.log(`Closed signal: ${event.pnl}%`);
 *   }
 * });
 * ```
 */
export interface LiveStatistics {
  /** Array of all events (idle, opened, active, closed) with full details */
  eventList: TickEvent[];

  /** Total number of all events (includes idle, opened, active, closed) */
  totalEvents: number;

  /** Total number of closed signals only */
  totalClosed: number;

  /** Number of winning closed signals (PNL > 0) */
  winCount: number;

  /** Number of losing closed signals (PNL < 0) */
  lossCount: number;

  /** Win rate as percentage (0-100) based on closed signals, null if unsafe. Higher is better. */
  winRate: number | null;

  /** Average PNL per closed signal as percentage, null if unsafe. Higher is better. */
  avgPnl: number | null;

  /** Cumulative PNL across all closed signals as percentage, null if unsafe. Higher is better. */
  totalPnl: number | null;

  /** Standard deviation of returns (volatility metric), null if unsafe. Lower is better. */
  stdDev: number | null;

  /** Sharpe Ratio (risk-adjusted return = avgPnl / stdDev), null if unsafe. Higher is better. */
  sharpeRatio: number | null;

  /** Annualized Sharpe Ratio (sharpeRatio × √365), null if unsafe. Higher is better. */
  annualizedSharpeRatio: number | null;

  /** Certainty Ratio (avgWin / |avgLoss|), null if unsafe. Higher is better. */
  certaintyRatio: number | null;

  /** Expected yearly returns based on average trade duration and PNL, null if unsafe. Higher is better. */
  expectedYearlyReturns: number | null;
}

/**
 * Column configuration for markdown table generation.
 * Defines how to extract and format data from tick events.
 */
interface Column {
  /** Unique column identifier */
  key: string;
  /** Display label for column header */
  label: string;
  /** Formatting function to convert event data to string */
  format: (data: TickEvent) => string;
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
    format: (data) => data.symbol ?? "N/A",
  },
  {
    key: "signalId",
    label: "Signal ID",
    format: (data) => data.signalId ?? "N/A",
  },
  {
    key: "position",
    label: "Position",
    format: (data) => data.position?.toUpperCase() ?? "N/A",
  },
  {
    key: "note",
    label: "Note",
    format: (data) => toPlainString(data.note ?? "N/A"),
  },
  {
    key: "currentPrice",
    label: "Current Price",
    format: (data) => `${data.currentPrice.toFixed(8)} USD`,
  },
  {
    key: "openPrice",
    label: "Open Price",
    format: (data) =>
      data.openPrice !== undefined ? `${data.openPrice.toFixed(8)} USD` : "N/A",
  },
  {
    key: "takeProfit",
    label: "Take Profit",
    format: (data) =>
      data.takeProfit !== undefined
        ? `${data.takeProfit.toFixed(8)} USD`
        : "N/A",
  },
  {
    key: "stopLoss",
    label: "Stop Loss",
    format: (data) =>
      data.stopLoss !== undefined ? `${data.stopLoss.toFixed(8)} USD` : "N/A",
  },
  {
    key: "percentTp",
    label: "% to TP",
    format: (data) =>
      data.percentTp !== undefined ? `${data.percentTp.toFixed(2)}%` : "N/A",
  },
  {
    key: "percentSl",
    label: "% to SL",
    format: (data) =>
      data.percentSl !== undefined ? `${data.percentSl.toFixed(2)}%` : "N/A",
  },
  {
    key: "pnl",
    label: "PNL (net)",
    format: (data) => {
      if (data.pnl === undefined) return "N/A";
      return `${data.pnl > 0 ? "+" : ""}${data.pnl.toFixed(2)}%`;
    },
  },
  {
    key: "closeReason",
    label: "Close Reason",
    format: (data) => data.closeReason ?? "N/A",
  },
  {
    key: "duration",
    label: "Duration (min)",
    format: (data) =>
      data.duration !== undefined ? `${data.duration}` : "N/A",
  },
];

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
      this._eventList.push(newEvent);
      if (this._eventList.length > MAX_EVENTS) {
        this._eventList.shift();
      }
    }
  }

  /**
   * Adds an opened event to the storage.
   *
   * @param data - Opened tick result
   */
  public addOpenedEvent(data: IStrategyTickResultOpened) {
    this._eventList.push({
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
      this._eventList.shift();
    }
  }

  /**
   * Updates or adds an active event to the storage.
   * Replaces the previous event with the same signalId.
   *
   * @param data - Active tick result
   */
  public addActiveEvent(data: IStrategyTickResultActive) {
    // Find existing event with the same signalId
    const existingIndex = this._eventList.findIndex(
      (event) => event.signalId === data.signal.id
    );

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
   * Updates or adds a closed event to the storage.
   * Replaces the previous event with the same signalId.
   *
   * @param data - Closed tick result
   */
  public addClosedEvent(data: IStrategyTickResultClosed) {
    const durationMs = data.closeTimestamp - data.signal.pendingAt;
    const durationMin = Math.round(durationMs / 60000);

    // Find existing event with the same signalId
    const existingIndex = this._eventList.findIndex(
      (event) => event.signalId === data.signal.id
    );

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
   * Calculates statistical data from live trading events (Controller).
   * Returns null for any unsafe numeric values (NaN, Infinity, etc).
   *
   * @returns Statistical data (empty object if no events)
   */
  public async getData(): Promise<LiveStatistics> {
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
   * @returns Markdown formatted report with all events
   */
  public async getReport(strategyName: StrategyName): Promise<string> {
    const stats = await this.getData();

    if (stats.totalEvents === 0) {
      return [
        `# Live Trading Report: ${strategyName}`,
        "",
        "No events recorded yet."
      ].join("\n");
    }

    const header = columns.map((col) => col.label);
    const separator = columns.map(() => "---");
    const rows = this._eventList.map((event) =>
      columns.map((col) => col.format(event))
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
   */
  public async dump(
    strategyName: StrategyName,
    path = "./dump/live"
  ): Promise<void> {
    const markdown = await this.getReport(strategyName);

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
   * Memoized function to get or create ReportStorage for a symbol-strategy pair.
   * Each symbol-strategy combination gets its own isolated storage instance.
   */
  private getStorage = memoize<(symbol: string, strategyName: string) => ReportStorage>(
    ([symbol, strategyName]) => `${symbol}:${strategyName}`,
    () => new ReportStorage()
  );

  /**
   * Processes tick events and accumulates all event types.
   * Should be called from IStrategyCallbacks.onTick.
   *
   * Processes all event types: idle, opened, active, closed.
   *
   * @param data - Tick result from strategy execution
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

    const storage = this.getStorage(data.symbol, data.strategyName);

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
   * @returns Statistical data object with all metrics
   *
   * @example
   * ```typescript
   * const service = new LiveMarkdownService();
   * const stats = await service.getData("BTCUSDT", "my-strategy");
   * console.log(stats.sharpeRatio, stats.winRate);
   * ```
   */
  public getData = async (symbol: string, strategyName: StrategyName): Promise<LiveStatistics> => {
    this.loggerService.log("liveMarkdownService getData", {
      symbol,
      strategyName,
    });
    const storage = this.getStorage(symbol, strategyName);
    return storage.getData();
  };

  /**
   * Generates markdown report with all events for a symbol-strategy pair.
   * Delegates to ReportStorage.getReport().
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to generate report for
   * @returns Markdown formatted report string with table of all events
   *
   * @example
   * ```typescript
   * const service = new LiveMarkdownService();
   * const markdown = await service.getReport("BTCUSDT", "my-strategy");
   * console.log(markdown);
   * ```
   */
  public getReport = async (symbol: string, strategyName: StrategyName): Promise<string> => {
    this.loggerService.log("liveMarkdownService getReport", {
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
   * @param path - Directory path to save report (default: "./dump/live")
   *
   * @example
   * ```typescript
   * const service = new LiveMarkdownService();
   *
   * // Save to default path: ./dump/live/my-strategy.md
   * await service.dump("BTCUSDT", "my-strategy");
   *
   * // Save to custom path: ./custom/path/my-strategy.md
   * await service.dump("BTCUSDT", "my-strategy", "./custom/path");
   * ```
   */
  public dump = async (
    symbol: string,
    strategyName: StrategyName,
    path = "./dump/live"
  ): Promise<void> => {
    this.loggerService.log("liveMarkdownService dump", {
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
   * const service = new LiveMarkdownService();
   *
   * // Clear specific symbol-strategy pair
   * await service.clear({ symbol: "BTCUSDT", strategyName: "my-strategy" });
   *
   * // Clear all data
   * await service.clear();
   * ```
   */
  public clear = async (ctx?: { symbol: string; strategyName: StrategyName }) => {
    this.loggerService.log("liveMarkdownService clear", {
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
   * const service = new LiveMarkdownService();
   * await service.init(); // Subscribe to live events
   * ```
   */
  protected init = singleshot(async () => {
    this.loggerService.log("liveMarkdownService init");
    signalLiveEmitter.subscribe(this.tick);
  });
}

export default LiveMarkdownService;

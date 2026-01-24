import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import { memoize, singleshot } from "functools-kit";
import ExecutionContextService, {
  TExecutionContextService,
} from "../context/ExecutionContextService";
import StrategyCoreService from "../core/StrategyCoreService";
import { StrategyName } from "../../../interfaces/Strategy.interface";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";
import { Markdown } from "../../../classes/Markdown";
import {
  StrategyStatisticsModel,
  StrategyEvent,
} from "../../../model/StrategyStatistics.model";
import { ColumnModel } from "../../../model/Column.model";
import { COLUMN_CONFIG } from "../../../config/columns";
import { strategyCommitSubject } from "../../../config/emitters";
import { StrategyCommitContract } from "../../../contract/StrategyCommit.contract";

/**
 * Type alias for column configuration used in strategy markdown reports.
 *
 * @see ColumnModel for the base interface
 * @see StrategyEvent for the event data structure
 */
export type Columns = ColumnModel<StrategyEvent>;

/**
 * Extracts execution context timestamp for strategy event logging.
 *
 * @param self - The StrategyMarkdownService instance to extract context from
 * @returns Object containing ISO 8601 formatted timestamp, or empty string if no context
 * @internal
 */
const GET_EXECUTION_CONTEXT_FN = (self: StrategyMarkdownService) => {
  if (ExecutionContextService.hasContext()) {
    const { when } = self.executionContextService.context;
    return { when: when.toISOString() };
  }
  return {
    when: "",
  };
};

/**
 * Creates a unique key for memoizing ReportStorage instances.
 *
 * Key format: `{symbol}:{strategyName}:{exchangeName}[:{frameName}]:{backtest|live}`
 *
 * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
 * @param strategyName - Name of the trading strategy
 * @param exchangeName - Name of the exchange
 * @param frameName - Timeframe name (optional, included if present)
 * @param backtest - Whether this is backtest or live mode
 * @returns Colon-separated key string for memoization
 * @internal
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
 * Creates a filename for markdown report output.
 *
 * Filename format: `{symbol}_{strategyName}_{exchangeName}[_{frameName}_backtest|_live]-{timestamp}.md`
 *
 * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
 * @param strategyName - Name of the trading strategy
 * @param exchangeName - Name of the exchange
 * @param frameName - Timeframe name (indicates backtest mode if present)
 * @param timestamp - Unix timestamp in milliseconds for uniqueness
 * @returns Underscore-separated filename with .md extension
 * @internal
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

/**
 * Maximum number of events to store per symbol-strategy pair.
 * Older events are discarded when this limit is exceeded.
 * @internal
 */
const MAX_EVENTS = 250;

/**
 * In-memory storage for accumulating strategy events per symbol-strategy pair.
 *
 * Maintains a rolling window of the most recent events (up to MAX_EVENTS),
 * with newer events added to the front of the list. Provides methods to:
 * - Add new events (FIFO queue with max size)
 * - Retrieve aggregated statistics
 * - Generate markdown reports
 * - Dump reports to disk
 *
 * @internal
 */
class ReportStorage {
  private _eventList: StrategyEvent[] = [];

  /**
   * Creates a new ReportStorage instance.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param strategyName - Name of the trading strategy
   * @param exchangeName - Name of the exchange
   * @param frameName - Timeframe name for backtest identification
   */
  constructor(
    readonly symbol: string,
    readonly strategyName: StrategyName,
    readonly exchangeName: ExchangeName,
    readonly frameName: FrameName
  ) {}

  /**
   * Adds a new event to the storage.
   *
   * Events are added to the front of the list (most recent first).
   * If the list exceeds MAX_EVENTS, the oldest event is removed.
   *
   * @param event - The strategy event to store
   */
  public addEvent(event: StrategyEvent) {
    this._eventList.unshift(event);
    if (this._eventList.length > MAX_EVENTS) {
      this._eventList.pop();
    }
  }

  /**
   * Retrieves aggregated statistics from stored events.
   *
   * Calculates counts for each action type from the event list.
   *
   * @returns Promise resolving to StrategyStatisticsModel with event list and counts
   */
  public async getData(): Promise<StrategyStatisticsModel> {
    if (this._eventList.length === 0) {
      return {
        eventList: [],
        totalEvents: 0,
        cancelScheduledCount: 0,
        closePendingCount: 0,
        partialProfitCount: 0,
        partialLossCount: 0,
        trailingStopCount: 0,
        trailingTakeCount: 0,
        breakevenCount: 0,
      };
    }

    return {
      eventList: this._eventList,
      totalEvents: this._eventList.length,
      cancelScheduledCount: this._eventList.filter(e => e.action === "cancel-scheduled").length,
      closePendingCount: this._eventList.filter(e => e.action === "close-pending").length,
      partialProfitCount: this._eventList.filter(e => e.action === "partial-profit").length,
      partialLossCount: this._eventList.filter(e => e.action === "partial-loss").length,
      trailingStopCount: this._eventList.filter(e => e.action === "trailing-stop").length,
      trailingTakeCount: this._eventList.filter(e => e.action === "trailing-take").length,
      breakevenCount: this._eventList.filter(e => e.action === "breakeven").length,
    };
  }

  /**
   * Generates a markdown report from stored events.
   *
   * Creates a formatted markdown document containing:
   * - Header with symbol and strategy name
   * - Table of all events with configurable columns
   * - Summary statistics with counts by action type
   *
   * @param symbol - Trading pair symbol for report header
   * @param strategyName - Strategy name for report header
   * @param columns - Column configuration for the event table
   * @returns Promise resolving to formatted markdown string
   */
  public async getReport(
    symbol: string,
    strategyName: StrategyName,
    columns: Columns[] = COLUMN_CONFIG.strategy_columns
  ): Promise<string> {
    const stats = await this.getData();

    if (stats.totalEvents === 0) {
      return [
        `# Strategy Report: ${symbol}:${strategyName}`,
        "",
        "No strategy events recorded yet."
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
      `# Strategy Report: ${symbol}:${strategyName}`,
      "",
      table,
      "",
      `**Total events:** ${stats.totalEvents}`,
      `- Cancel scheduled: ${stats.cancelScheduledCount}`,
      `- Close pending: ${stats.closePendingCount}`,
      `- Partial profit: ${stats.partialProfitCount}`,
      `- Partial loss: ${stats.partialLossCount}`,
      `- Trailing stop: ${stats.trailingStopCount}`,
      `- Trailing take: ${stats.trailingTakeCount}`,
      `- Breakeven: ${stats.breakevenCount}`,
    ].join("\n");
  }

  /**
   * Generates and saves a markdown report to disk.
   *
   * Creates the output directory if it doesn't exist and writes
   * the report with a timestamped filename.
   *
   * @param symbol - Trading pair symbol for report
   * @param strategyName - Strategy name for report
   * @param path - Output directory path (default: "./dump/strategy")
   * @param columns - Column configuration for the event table
   */
  public async dump(
    symbol: string,
    strategyName: StrategyName,
    path = "./dump/strategy",
    columns: Columns[] = COLUMN_CONFIG.strategy_columns
  ): Promise<void> {
    const markdown = await this.getReport(symbol, strategyName, columns);
    const timestamp = Date.now();
    const filename = CREATE_FILE_NAME_FN(this.symbol, strategyName, this.exchangeName, this.frameName, timestamp);
    await Markdown.writeData("strategy", markdown, {
      path,
      file: filename,
      symbol: this.symbol,
      strategyName: this.strategyName,
      exchangeName: this.exchangeName,
      signalId: "",
      frameName: this.frameName
    });
  }
}

/**
 * Service for accumulating strategy management events and generating markdown reports.
 *
 * Collects strategy actions (cancel-scheduled, close-pending, partial-profit,
 * partial-loss, trailing-stop, trailing-take, breakeven) in memory and provides
 * methods to retrieve statistics, generate reports, and export to files.
 *
 * Unlike StrategyReportService which writes each event to disk immediately,
 * this service accumulates events in ReportStorage instances (max 250 per
 * symbol-strategy pair) for batch reporting.
 *
 * Features:
 * - In-memory event accumulation with memoized storage per symbol-strategy pair
 * - Statistical data extraction (event counts by action type)
 * - Markdown report generation with configurable columns
 * - File export with timestamped filenames
 * - Selective or full cache clearing
 *
 * Lifecycle:
 * - Call subscribe() to enable event collection
 * - Events are collected automatically via cancelScheduled, closePending, etc.
 * - Use getData(), getReport(), or dump() to retrieve accumulated data
 * - Call unsubscribe() to disable collection and clear all data
 *
 * @example
 * ```typescript
 * strategyMarkdownService.subscribe();
 *
 * // Events are collected automatically during strategy execution
 * // ...
 *
 * // Get statistics
 * const stats = await strategyMarkdownService.getData("BTCUSDT", "my-strategy", "binance", "1h", true);
 *
 * // Generate markdown report
 * const report = await strategyMarkdownService.getReport("BTCUSDT", "my-strategy", "binance", "1h", true);
 *
 * // Export to file
 * await strategyMarkdownService.dump("BTCUSDT", "my-strategy", "binance", "1h", true);
 *
 * strategyMarkdownService.unsubscribe();
 * ```
 *
 * @see StrategyReportService for immediate event persistence to JSON files
 * @see Strategy for the high-level utility class that wraps this service
 */
export class StrategyMarkdownService {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly executionContextService = inject<TExecutionContextService>(
    TYPES.executionContextService,
  );
  readonly strategyCoreService = inject<StrategyCoreService>(
    TYPES.strategyCoreService,
  );

  /**
   * Memoized factory for ReportStorage instances.
   *
   * Creates and caches ReportStorage per unique symbol-strategy-exchange-frame-backtest combination.
   * Uses CREATE_KEY_FN for cache key generation.
   *
   * @internal
   */
  private getStorage = memoize<(symbol: string, strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean) => ReportStorage>(
    ([symbol, strategyName, exchangeName, frameName, backtest]) => CREATE_KEY_FN(symbol, strategyName, exchangeName, frameName, backtest),
    (symbol, strategyName, exchangeName, frameName) => new ReportStorage(symbol, strategyName, exchangeName, frameName)
  );

  /**
   * Records a cancel-scheduled event when a scheduled signal is cancelled.
   *
   * Retrieves the scheduled signal from StrategyCoreService and stores
   * the cancellation event in the appropriate ReportStorage.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param isBacktest - Whether this is a backtest or live trading event
   * @param context - Strategy context with strategyName, exchangeName, frameName
   * @param cancelId - Optional identifier for the cancellation reason
   */
  public cancelScheduled = async (
    symbol: string,
    isBacktest: boolean,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    cancelId?: string,
  ) => {
    this.loggerService.log("strategyMarkdownService cancelScheduled", {
      symbol,
      isBacktest,
      cancelId,
    });
    if (!this.subscribe.hasValue()) {
      return;
    }
    const { when: createdAt } = GET_EXECUTION_CONTEXT_FN(this);
    const scheduledRow = await this.strategyCoreService.getScheduledSignal(
      isBacktest,
      symbol,
      {
        exchangeName: context.exchangeName,
        strategyName: context.strategyName,
        frameName: context.frameName,
      },
    );
    if (!scheduledRow) {
      return;
    }
    const storage = this.getStorage(symbol, context.strategyName, context.exchangeName, context.frameName, isBacktest);
    storage.addEvent({
      timestamp: Date.now(),
      symbol,
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: context.frameName,
      signalId: scheduledRow.id,
      action: "cancel-scheduled",
      cancelId,
      createdAt,
      backtest: isBacktest,
    });
  };

  /**
   * Records a close-pending event when a pending signal is closed.
   *
   * Retrieves the pending signal from StrategyCoreService and stores
   * the close event in the appropriate ReportStorage.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param isBacktest - Whether this is a backtest or live trading event
   * @param context - Strategy context with strategyName, exchangeName, frameName
   * @param closeId - Optional identifier for the close reason
   */
  public closePending = async (
    symbol: string,
    isBacktest: boolean,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
    closeId?: string,
  ) => {
    this.loggerService.log("strategyMarkdownService closePending", {
      symbol,
      isBacktest,
      closeId,
    });
    if (!this.subscribe.hasValue()) {
      return;
    }
    const { when: createdAt } = GET_EXECUTION_CONTEXT_FN(this);
    const pendingRow = await this.strategyCoreService.getPendingSignal(
      isBacktest,
      symbol,
      {
        exchangeName: context.exchangeName,
        strategyName: context.strategyName,
        frameName: context.frameName,
      },
    );
    if (!pendingRow) {
      return;
    }
    const storage = this.getStorage(symbol, context.strategyName, context.exchangeName, context.frameName, isBacktest);
    storage.addEvent({
      timestamp: Date.now(),
      symbol,
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: context.frameName,
      signalId: pendingRow.id,
      action: "close-pending",
      closeId,
      createdAt,
      backtest: isBacktest,
    });
  };

  /**
   * Records a partial-profit event when a portion of the position is closed at profit.
   *
   * Stores the percentage closed and current price when partial profit-taking occurs.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param percentToClose - Percentage of position to close (0-100)
   * @param currentPrice - Current market price at time of partial close
   * @param isBacktest - Whether this is a backtest or live trading event
   * @param context - Strategy context with strategyName, exchangeName, frameName
   */
  public partialProfit = async (
    symbol: string,
    percentToClose: number,
    currentPrice: number,
    isBacktest: boolean,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
  ) => {
    this.loggerService.log("strategyMarkdownService partialProfit", {
      symbol,
      percentToClose,
      currentPrice,
      isBacktest,
    });
    if (!this.subscribe.hasValue()) {
      return;
    }
    const { when: createdAt } = GET_EXECUTION_CONTEXT_FN(this);
    const pendingRow = await this.strategyCoreService.getPendingSignal(
      isBacktest,
      symbol,
      {
        exchangeName: context.exchangeName,
        strategyName: context.strategyName,
        frameName: context.frameName,
      },
    );
    if (!pendingRow) {
      return;
    }
    const storage = this.getStorage(symbol, context.strategyName, context.exchangeName, context.frameName, isBacktest);
    storage.addEvent({
      timestamp: Date.now(),
      symbol,
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: context.frameName,
      signalId: pendingRow.id,
      action: "partial-profit",
      percentToClose,
      currentPrice,
      createdAt,
      backtest: isBacktest,
    });
  };

  /**
   * Records a partial-loss event when a portion of the position is closed at loss.
   *
   * Stores the percentage closed and current price when partial loss-cutting occurs.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param percentToClose - Percentage of position to close (0-100)
   * @param currentPrice - Current market price at time of partial close
   * @param isBacktest - Whether this is a backtest or live trading event
   * @param context - Strategy context with strategyName, exchangeName, frameName
   */
  public partialLoss = async (
    symbol: string,
    percentToClose: number,
    currentPrice: number,
    isBacktest: boolean,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
  ) => {
    this.loggerService.log("strategyMarkdownService partialLoss", {
      symbol,
      percentToClose,
      currentPrice,
      isBacktest,
    });
    if (!this.subscribe.hasValue()) {
      return;
    }
    const { when: createdAt } = GET_EXECUTION_CONTEXT_FN(this);
    const pendingRow = await this.strategyCoreService.getPendingSignal(
      isBacktest,
      symbol,
      {
        exchangeName: context.exchangeName,
        strategyName: context.strategyName,
        frameName: context.frameName,
      },
    );
    if (!pendingRow) {
      return;
    }
    const storage = this.getStorage(symbol, context.strategyName, context.exchangeName, context.frameName, isBacktest);
    storage.addEvent({
      timestamp: Date.now(),
      symbol,
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: context.frameName,
      signalId: pendingRow.id,
      action: "partial-loss",
      percentToClose,
      currentPrice,
      createdAt,
      backtest: isBacktest,
    });
  };

  /**
   * Records a trailing-stop event when the stop-loss is adjusted.
   *
   * Stores the percentage shift and current price when trailing stop moves.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param percentShift - Percentage the stop-loss was shifted
   * @param currentPrice - Current market price at time of adjustment
   * @param isBacktest - Whether this is a backtest or live trading event
   * @param context - Strategy context with strategyName, exchangeName, frameName
   */
  public trailingStop = async (
    symbol: string,
    percentShift: number,
    currentPrice: number,
    isBacktest: boolean,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
  ) => {
    this.loggerService.log("strategyMarkdownService trailingStop", {
      symbol,
      percentShift,
      currentPrice,
      isBacktest,
    });
    if (!this.subscribe.hasValue()) {
      return;
    }
    const { when: createdAt } = GET_EXECUTION_CONTEXT_FN(this);
    const pendingRow = await this.strategyCoreService.getPendingSignal(
      isBacktest,
      symbol,
      {
        exchangeName: context.exchangeName,
        strategyName: context.strategyName,
        frameName: context.frameName,
      },
    );
    if (!pendingRow) {
      return;
    }
    const storage = this.getStorage(symbol, context.strategyName, context.exchangeName, context.frameName, isBacktest);
    storage.addEvent({
      timestamp: Date.now(),
      symbol,
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: context.frameName,
      signalId: pendingRow.id,
      action: "trailing-stop",
      percentShift,
      currentPrice,
      createdAt,
      backtest: isBacktest,
    });
  };

  /**
   * Records a trailing-take event when the take-profit is adjusted.
   *
   * Stores the percentage shift and current price when trailing take-profit moves.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param percentShift - Percentage the take-profit was shifted
   * @param currentPrice - Current market price at time of adjustment
   * @param isBacktest - Whether this is a backtest or live trading event
   * @param context - Strategy context with strategyName, exchangeName, frameName
   */
  public trailingTake = async (
    symbol: string,
    percentShift: number,
    currentPrice: number,
    isBacktest: boolean,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
  ) => {
    this.loggerService.log("strategyMarkdownService trailingTake", {
      symbol,
      percentShift,
      currentPrice,
      isBacktest,
    });
    if (!this.subscribe.hasValue()) {
      return;
    }
    const { when: createdAt } = GET_EXECUTION_CONTEXT_FN(this);
    const pendingRow = await this.strategyCoreService.getPendingSignal(
      isBacktest,
      symbol,
      {
        exchangeName: context.exchangeName,
        strategyName: context.strategyName,
        frameName: context.frameName,
      },
    );
    if (!pendingRow) {
      return;
    }
    const storage = this.getStorage(symbol, context.strategyName, context.exchangeName, context.frameName, isBacktest);
    storage.addEvent({
      timestamp: Date.now(),
      symbol,
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: context.frameName,
      signalId: pendingRow.id,
      action: "trailing-take",
      percentShift,
      currentPrice,
      createdAt,
      backtest: isBacktest,
    });
  };

  /**
   * Records a breakeven event when the stop-loss is moved to entry price.
   *
   * Stores the current price when breakeven protection is activated.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param currentPrice - Current market price at time of breakeven activation
   * @param isBacktest - Whether this is a backtest or live trading event
   * @param context - Strategy context with strategyName, exchangeName, frameName
   */
  public breakeven = async (
    symbol: string,
    currentPrice: number,
    isBacktest: boolean,
    context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName },
  ) => {
    this.loggerService.log("strategyMarkdownService breakeven", {
      symbol,
      currentPrice,
      isBacktest,
    });
    if (!this.subscribe.hasValue()) {
      return;
    }
    const { when: createdAt } = GET_EXECUTION_CONTEXT_FN(this);
    const pendingRow = await this.strategyCoreService.getPendingSignal(
      isBacktest,
      symbol,
      {
        exchangeName: context.exchangeName,
        strategyName: context.strategyName,
        frameName: context.frameName,
      },
    );
    if (!pendingRow) {
      return;
    }
    const storage = this.getStorage(symbol, context.strategyName, context.exchangeName, context.frameName, isBacktest);
    storage.addEvent({
      timestamp: Date.now(),
      symbol,
      strategyName: context.strategyName,
      exchangeName: context.exchangeName,
      frameName: context.frameName,
      signalId: pendingRow.id,
      action: "breakeven",
      currentPrice,
      createdAt,
      backtest: isBacktest,
    });
  };

  /**
   * Retrieves aggregated statistics from accumulated strategy events.
   *
   * Returns counts for each action type and the full event list from the
   * ReportStorage for the specified symbol-strategy pair.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param strategyName - Name of the trading strategy
   * @param exchangeName - Name of the exchange
   * @param frameName - Timeframe name for backtest identification
   * @param backtest - Whether to get backtest or live data
   * @returns Promise resolving to StrategyStatisticsModel with event list and counts
   * @throws Error if service not initialized (subscribe() not called)
   */
  public getData = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean
  ): Promise<StrategyStatisticsModel> => {
    this.loggerService.log("strategyMarkdownService getData", {
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
    });
    if (!this.subscribe.hasValue()) {
      throw new Error("StrategyMarkdownService not initialized. Call subscribe() before getting data.");
    }
    const storage = this.getStorage(symbol, strategyName, exchangeName, frameName, backtest);
    return storage.getData();
  };

  /**
   * Generates a markdown report from accumulated strategy events.
   *
   * Creates a formatted markdown document containing:
   * - Header with symbol and strategy name
   * - Table of all events with configurable columns
   * - Summary statistics with counts by action type
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param strategyName - Name of the trading strategy
   * @param exchangeName - Name of the exchange
   * @param frameName - Timeframe name for backtest identification
   * @param backtest - Whether to get backtest or live data
   * @param columns - Column configuration for the event table
   * @returns Promise resolving to formatted markdown string
   * @throws Error if service not initialized (subscribe() not called)
   */
  public getReport = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
    columns: Columns[] = COLUMN_CONFIG.strategy_columns
  ): Promise<string> => {
    this.loggerService.log("strategyMarkdownService getReport", {
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
    });
    if (!this.subscribe.hasValue()) {
      throw new Error("StrategyMarkdownService not initialized. Call subscribe() before generating reports.");
    }
    const storage = this.getStorage(symbol, strategyName, exchangeName, frameName, backtest);
    return storage.getReport(symbol, strategyName, columns);
  };

  /**
   * Generates and saves a markdown report to disk.
   *
   * Creates the output directory if it doesn't exist and writes
   * the report with a timestamped filename via Markdown.writeData().
   *
   * Filename format: `{symbol}_{strategyName}_{exchangeName}[_{frameName}_backtest|_live]-{timestamp}.md`
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param strategyName - Name of the trading strategy
   * @param exchangeName - Name of the exchange
   * @param frameName - Timeframe name for backtest identification
   * @param backtest - Whether to dump backtest or live data
   * @param path - Output directory path (default: "./dump/strategy")
   * @param columns - Column configuration for the event table
   * @returns Promise that resolves when file is written
   * @throws Error if service not initialized (subscribe() not called)
   */
  public dump = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
    path = "./dump/strategy",
    columns: Columns[] = COLUMN_CONFIG.strategy_columns
  ): Promise<void> => {
    this.loggerService.log("strategyMarkdownService dump", {
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
      path,
    });
    if (!this.subscribe.hasValue()) {
      throw new Error("StrategyMarkdownService not initialized. Call subscribe() before dumping reports.");
    }
    const storage = this.getStorage(symbol, strategyName, exchangeName, frameName, backtest);
    await storage.dump(symbol, strategyName, path, columns);
  };

  /**
   * Clears accumulated events from storage.
   *
   * Can clear either a specific symbol-strategy pair or all stored data.
   *
   * @param payload - Optional filter to clear specific storage. If omitted, clears all.
   * @param payload.symbol - Trading pair symbol
   * @param payload.strategyName - Strategy name
   * @param payload.exchangeName - Exchange name
   * @param payload.frameName - Frame name
   * @param payload.backtest - Backtest mode flag
   */
  public clear = async (payload?: {
    symbol: string;
    strategyName: StrategyName;
    exchangeName: ExchangeName;
    frameName: FrameName;
    backtest: boolean;
  }) => {
    this.loggerService.log("strategyMarkdownService clear", { payload });
    if (payload) {
      const key = CREATE_KEY_FN(payload.symbol, payload.strategyName, payload.exchangeName, payload.frameName, payload.backtest);
      this.getStorage.clear(key);
    } else {
      this.getStorage.clear();
    }
  };

  /**
   * Handles incoming signal management events from strategyCommitSubject.
   * Routes events to appropriate handler methods based on action type.
   *
   * @param event - The signal management event
   */
  private handleSignalEvent = async (event: StrategyCommitContract) => {
    this.loggerService.log("strategyMarkdownService handleSignalEvent", {
      action: event.action,
      symbol: event.symbol,
      backtest: event.backtest,
    });
    const context = {
      strategyName: event.strategyName,
      exchangeName: event.exchangeName,
      frameName: event.frameName,
    };
    switch (event.action) {
      case "cancel-scheduled":
        await this.cancelScheduled(event.symbol, event.backtest, context, event.cancelId);
        break;
      case "close-pending":
        await this.closePending(event.symbol, event.backtest, context, event.closeId);
        break;
      case "partial-profit":
        await this.partialProfit(event.symbol, event.percentToClose, event.currentPrice, event.backtest, context);
        break;
      case "partial-loss":
        await this.partialLoss(event.symbol, event.percentToClose, event.currentPrice, event.backtest, context);
        break;
      case "trailing-stop":
        await this.trailingStop(event.symbol, event.percentShift, event.currentPrice, event.backtest, context);
        break;
      case "trailing-take":
        await this.trailingTake(event.symbol, event.percentShift, event.currentPrice, event.backtest, context);
        break;
      case "breakeven":
        await this.breakeven(event.symbol, event.currentPrice, event.backtest, context);
        break;
    }
  };

  /**
   * Initializes the service for event collection.
   *
   * Must be called before any events can be collected or reports generated.
   * Uses singleshot pattern to ensure only one subscription exists at a time.
   *
   * @returns Cleanup function that clears the subscription and all accumulated data
   */
  public subscribe = singleshot(() => {
    this.loggerService.log("strategyMarkdownService subscribe");
    const unsubscribe = strategyCommitSubject.subscribe(this.handleSignalEvent);
    return () => {
      this.subscribe.clear();
      this.clear();
      unsubscribe();
    };
  });

  /**
   * Stops event collection and clears all accumulated data.
   *
   * Invokes the cleanup function returned by subscribe(), which clears
   * both the subscription and all ReportStorage instances.
   * Safe to call multiple times - only acts if subscription exists.
   */
  public unsubscribe = async () => {
    this.loggerService.log("strategyMarkdownService unsubscribe");
    if (this.subscribe.hasValue()) {
      this.subscribe.clear();
      this.clear();
    }
  };
}

export default StrategyMarkdownService;

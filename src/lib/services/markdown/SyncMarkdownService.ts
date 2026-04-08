import { inject } from "../../core/di";
import LoggerService, { TLoggerService } from "../base/LoggerService";
import TYPES from "../../core/types";
import { memoize, singleshot, trycatch } from "functools-kit";
import { StrategyName } from "../../../interfaces/Strategy.interface";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";
import { MarkdownWriter } from "../../../classes/Writer";
import { SyncStatisticsModel, SyncEvent } from "../../../model/SyncStatistics.model";
import { ColumnModel } from "../../../model/Column.model";
import { COLUMN_CONFIG } from "../../../config/columns";
import { syncSubject } from "../../../config/emitters";
import SignalSyncContract from "../../../contract/SignalSync.contract";
import { getContextTimestamp } from "../../../helpers/getContextTimestamp";
import { GLOBAL_CONFIG } from "../../../config/params";

/**
 * Type alias for column configuration used in sync markdown reports.
 *
 * @see ColumnModel for the base interface
 * @see SyncEvent for the event data structure
 */
export type Columns = ColumnModel<SyncEvent>;

/**
 * Creates a unique key for memoizing ReportStorage instances.
 * Key format: "symbol:strategyName:exchangeName[:frameName]:backtest|live"
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
 * Creates a filename for the markdown report.
 * Filename format: "symbol_strategyName_exchangeName[_frameName_backtest|_live]-timestamp.md"
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
 * Storage class for accumulating signal sync events per symbol-strategy-exchange-frame-backtest combination.
 * Maintains a chronological list of signal-open and signal-close events.
 */
class ReportStorage {
  private _eventList: SyncEvent[] = [];

  constructor(
    readonly symbol: string,
    readonly strategyName: StrategyName,
    readonly exchangeName: ExchangeName,
    readonly frameName: FrameName,
    readonly backtest: boolean
  ) {}

  /**
   * Prepends a sync event to the internal queue (most recent first).
   *
   * Once the queue exceeds `GLOBAL_CONFIG.CC_MAX_SYNC_MARKDOWN_ROWS` (250)
   * entries, the oldest event is dropped from the tail to cap memory usage.
   *
   * @param event - Fully constructed `SyncEvent` to record
   */
  public addEvent(event: SyncEvent) {
    this._eventList.unshift(event);
    if (this._eventList.length > GLOBAL_CONFIG.CC_MAX_SYNC_MARKDOWN_ROWS) {
      this._eventList.pop();
    }
  }

  /**
   * Builds `SyncStatisticsModel` from the accumulated event queue.
   *
   * Counts `"signal-open"` and `"signal-close"` actions separately.
   * If no events have been recorded yet, returns an empty model with all
   * counters set to `0`.
   *
   * @returns Promise resolving to `SyncStatisticsModel` with the full
   *   event list and `totalEvents`, `openCount`, `closeCount` counters
   */
  public async getData(): Promise<SyncStatisticsModel> {
    if (this._eventList.length === 0) {
      return {
        eventList: [],
        totalEvents: 0,
        openCount: 0,
        closeCount: 0,
      };
    }

    let openCount = 0;
    let closeCount = 0;
    for (const event of this._eventList) {
      if (event.action === "signal-open") openCount++;
      else if (event.action === "signal-close") closeCount++;
    }

    return {
      eventList: this._eventList,
      totalEvents: this._eventList.length,
      openCount,
      closeCount,
    };
  }

  /**
   * Renders a markdown sync report for this storage instance.
   *
   * Output structure (when events are available):
   * ```
   * # Signal Sync Report: {symbol}:{strategyName}
   *
   * | col1 | col2 | ... |
   * | ---  | ---  | ... |
   * | ...  | ...  | ... |
   *
   * **Total events:** N
   * **Opens:** N
   * **Closes:** N
   * ```
   * When no events have been recorded yet, returns a minimal header with
   * `"No sync events recorded yet."`.
   *
   * Only columns whose `isVisible()` returns `true` are included.
   * Rows are ordered newest-first (same order as the internal queue).
   *
   * @param symbol - Symbol rendered in the `# Signal Sync Report:` heading
   * @param strategyName - Strategy name rendered in the heading
   * @param columns - Column definitions controlling which fields appear and how
   *   they are formatted; defaults to `COLUMN_CONFIG.sync_columns`
   * @returns Promise resolving to the full markdown string
   */
  public async getReport(
    symbol: string,
    strategyName: StrategyName,
    columns: Columns[] = COLUMN_CONFIG.sync_columns
  ): Promise<string> {
    const stats = await this.getData();

    if (stats.totalEvents === 0) {
      return [
        `# Signal Sync Report: ${symbol}:${strategyName}`,
        "",
        "No sync events recorded yet.",
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
      `# Signal Sync Report: ${symbol}:${strategyName}`,
      "",
      table,
      "",
      `**Total events:** ${stats.totalEvents}`,
      `**Opens:** ${stats.openCount}`,
      `**Closes:** ${stats.closeCount}`,
    ].join("\n");
  }

  /**
   * Generates the markdown report and persists it via `MarkdownWriter.writeData`.
   *
   * The filename is built by `CREATE_FILE_NAME_FN`:
   * - Backtest: `{symbol}_{strategyName}_{exchangeName}_{frameName}_backtest-{timestamp}.md`
   * - Live:     `{symbol}_{strategyName}_{exchangeName}_live-{timestamp}.md`
   *
   * The timestamp comes from `getContextTimestamp()` — the backtest execution
   * context clock when inside a backtest, or the real clock aligned to the
   * nearest minute when running live.
   *
   * @param symbol - Symbol used in the report heading and filename
   * @param strategyName - Strategy name used in the heading and filename
   * @param path - Directory to write the file into; defaults to `"./dump/sync"`
   * @param columns - Column definitions for table formatting;
   *   defaults to `COLUMN_CONFIG.sync_columns`
   */
  public async dump(
    symbol: string,
    strategyName: StrategyName,
    path = "./dump/sync",
    columns: Columns[] = COLUMN_CONFIG.sync_columns
  ): Promise<void> {
    const markdown = await this.getReport(symbol, strategyName, columns);
    const timestamp = getContextTimestamp();
    const filename = CREATE_FILE_NAME_FN(this.symbol, strategyName, this.exchangeName, this.frameName, timestamp);
    await MarkdownWriter.writeData("sync", markdown, {
      path,
      file: filename,
      symbol: this.symbol,
      signalId: "",
      strategyName: this.strategyName,
      exchangeName: this.exchangeName,
      frameName: this.frameName,
    });
  }
}

/**
 * Service for generating and saving signal sync markdown reports.
 *
 * Features:
 * - Listens to signal sync events via syncSubject (signal-open and signal-close)
 * - Accumulates all sync events per symbol-strategy-exchange-frame-backtest combination
 * - Generates markdown tables with detailed signal lifecycle information
 * - Provides statistics (total events, opens, closes)
 * - Saves reports to disk in dump/sync/
 *
 * @example
 * ```typescript
 * import { Markdown } from "backtest-kit";
 *
 * const unsubscribe = MarkdownWriter.enable({ sync: true });
 * // ... later
 * unsubscribe();
 * ```
 */
export class SyncMarkdownService {
  private readonly loggerService = inject<TLoggerService>(TYPES.loggerService);

  private getStorage = memoize<(symbol: string, strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean) => ReportStorage>(
    ([symbol, strategyName, exchangeName, frameName, backtest]) => CREATE_KEY_FN(symbol, strategyName, exchangeName, frameName, backtest),
    (symbol, strategyName, exchangeName, frameName, backtest) => new ReportStorage(symbol, strategyName, exchangeName, frameName, backtest)
  );

  /**
   * Subscribes to `syncSubject` to start receiving `SignalSyncContract` events.
   * Protected against multiple subscriptions via `singleshot` — subsequent calls
   * return the same unsubscribe function without re-subscribing.
   *
   * The returned unsubscribe function clears the `singleshot` state, evicts all
   * memoized `ReportStorage` instances, and detaches from `syncSubject`.
   *
   * @returns Unsubscribe function; calling it tears down the subscription and
   *   clears all accumulated data
   *
   * @example
   * ```typescript
   * const service = new SyncMarkdownService();
   * const unsubscribe = service.subscribe();
   * // ... later
   * unsubscribe();
   * ```
   */
  public subscribe = singleshot(() => {
    this.loggerService.log("syncMarkdownService init");
    const unsubscribe = syncSubject.subscribe(trycatch(this.tick));
    return () => {
      this.subscribe.clear();
      this.clear();
      unsubscribe();
    };
  });

  /**
   * Detaches from `syncSubject` and clears all accumulated data.
   *
   * Calls the unsubscribe closure returned by `subscribe()`.
   * If `subscribe()` was never called, does nothing.
   *
   * @example
   * ```typescript
   * const service = new SyncMarkdownService();
   * service.subscribe();
   * // ... later
   * await service.unsubscribe();
   * ```
   */
  public unsubscribe = async () => {
    this.loggerService.log("syncMarkdownService unsubscribe");
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };

  /**
   * Handles a single `SignalSyncContract` event emitted by `syncSubject`.
   *
   * Maps the contract fields to a `SyncEvent`, enriching it with a
   * `createdAt` ISO timestamp from `getContextTimestamp()` (backtest clock
   * or real clock aligned to the nearest minute).
   * For `"signal-close"` events, `closeReason` is preserved; for
   * `"signal-open"` events it is set to `undefined`.
   *
   * Routes the constructed event to the appropriate `ReportStorage` bucket
   * via `getStorage(symbol, strategyName, exchangeName, frameName, backtest)`.
   *
   * @param data - Discriminated union `SignalSyncContract`
   *   (`SignalOpenContract | SignalCloseContract`)
   */
  private tick = async (data: SignalSyncContract) => {
    this.loggerService.log("syncMarkdownService tick", { data });

    const createdAt = new Date(getContextTimestamp()).toISOString();
    const event: SyncEvent = {
      timestamp: data.timestamp,
      symbol: data.symbol,
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      signalId: data.signalId,
      action: data.action,
      currentPrice: data.currentPrice,
      position: data.position,
      priceOpen: data.priceOpen,
      priceTakeProfit: data.priceTakeProfit,
      priceStopLoss: data.priceStopLoss,
      originalPriceTakeProfit: data.originalPriceTakeProfit,
      originalPriceStopLoss: data.originalPriceStopLoss,
      originalPriceOpen: data.originalPriceOpen,
      scheduledAt: data.scheduledAt,
      pendingAt: data.pendingAt,
      totalEntries: data.totalEntries,
      totalPartials: data.totalPartials,
      pnl: data.pnl,
      closeReason: data.action === "signal-close" ? data.closeReason : undefined,
      backtest: data.backtest,
      createdAt,
    };

    const storage = this.getStorage(data.symbol, data.strategyName, data.exchangeName, data.frameName, data.backtest);
    storage.addEvent(event);
  };

  /**
   * Returns accumulated sync statistics for the given context.
   *
   * Delegates to the `ReportStorage` bucket identified by
   * `(symbol, strategyName, exchangeName, frameName, backtest)`.
   * If no events have been recorded yet for that combination, the returned
   * model has an empty `eventList` and all counters set to `0`.
   *
   * @param symbol - Trading pair symbol (e.g. `"BTCUSDT"`)
   * @param strategyName - Strategy identifier
   * @param exchangeName - Exchange identifier (e.g. `"binance"`)
   * @param frameName - Backtest frame identifier; empty string for live mode
   * @param backtest - `true` for backtest mode, `false` for live mode
   * @returns Promise resolving to `SyncStatisticsModel` with `eventList`,
   *   `totalEvents`, `openCount`, `closeCount`
   * @throws {Error} If `subscribe()` has not been called before this method
   */
  public getData = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean
  ): Promise<SyncStatisticsModel> => {
    this.loggerService.log("syncMarkdownService getData", { symbol, strategyName, exchangeName, frameName, backtest });
    if (!this.subscribe.hasValue()) {
      throw new Error("SyncMarkdownService not initialized. Call subscribe() before getting data.");
    }
    const storage = this.getStorage(symbol, strategyName, exchangeName, frameName, backtest);
    return storage.getData();
  };

  /**
   * Generates a markdown sync report for the given context.
   *
   * Delegates to `ReportStorage.getReport`. The resulting string includes a
   * markdown table (newest events first) followed by total / open / close
   * counters.
   *
   * @param symbol - Trading pair symbol (e.g. `"BTCUSDT"`)
   * @param strategyName - Strategy identifier
   * @param exchangeName - Exchange identifier (e.g. `"binance"`)
   * @param frameName - Backtest frame identifier; empty string for live mode
   * @param backtest - `true` for backtest mode, `false` for live mode
   * @param columns - Column definitions controlling the table layout;
   *   defaults to `COLUMN_CONFIG.sync_columns`
   * @returns Promise resolving to the full markdown string
   * @throws {Error} If `subscribe()` has not been called before this method
   */
  public getReport = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
    columns: Columns[] = COLUMN_CONFIG.sync_columns
  ): Promise<string> => {
    this.loggerService.log("syncMarkdownService getReport", { symbol, strategyName, exchangeName, frameName, backtest });
    if (!this.subscribe.hasValue()) {
      throw new Error("SyncMarkdownService not initialized. Call subscribe() before generating reports.");
    }
    const storage = this.getStorage(symbol, strategyName, exchangeName, frameName, backtest);
    return storage.getReport(symbol, strategyName, columns);
  };

  /**
   * Generates the sync report and writes it to disk.
   *
   * Delegates to `ReportStorage.dump`. The filename follows the pattern:
   * - Backtest: `{symbol}_{strategyName}_{exchangeName}_{frameName}_backtest-{timestamp}.md`
   * - Live:     `{symbol}_{strategyName}_{exchangeName}_live-{timestamp}.md`
   *
   * @param symbol - Trading pair symbol (e.g. `"BTCUSDT"`)
   * @param strategyName - Strategy identifier
   * @param exchangeName - Exchange identifier (e.g. `"binance"`)
   * @param frameName - Backtest frame identifier; empty string for live mode
   * @param backtest - `true` for backtest mode, `false` for live mode
   * @param path - Directory to write the file into; defaults to `"./dump/sync"`
   * @param columns - Column definitions for table formatting;
   *   defaults to `COLUMN_CONFIG.sync_columns`
   * @throws {Error} If `subscribe()` has not been called before this method
   */
  public dump = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
    path = "./dump/sync",
    columns: Columns[] = COLUMN_CONFIG.sync_columns
  ): Promise<void> => {
    this.loggerService.log("syncMarkdownService dump", { symbol, strategyName, exchangeName, frameName, backtest, path });
    if (!this.subscribe.hasValue()) {
      throw new Error("SyncMarkdownService not initialized. Call subscribe() before dumping reports.");
    }
    const storage = this.getStorage(symbol, strategyName, exchangeName, frameName, backtest);
    await storage.dump(symbol, strategyName, path, columns);
  };

  /**
   * Evicts memoized `ReportStorage` instances, releasing all accumulated event data.
   *
   * - With `payload` — clears only the storage bucket identified by
   *   `(symbol, strategyName, exchangeName, frameName, backtest)`;
   *   subsequent calls for that combination start from an empty state.
   * - Without `payload` — clears **all** storage buckets.
   *
   * Also called internally by the unsubscribe closure returned from `subscribe()`.
   *
   * @param payload - Optional scope to restrict which bucket is cleared;
   *   omit to clear everything
   *
   * @example
   * ```typescript
   * // Clear one specific context
   * await service.clear({ symbol: "BTCUSDT", strategyName: "my-strategy", exchangeName: "binance", frameName: "1m-btc", backtest: true });
   *
   * // Clear all contexts
   * await service.clear();
   * ```
   */
  public clear = async (payload?: { symbol: string; strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName; backtest: boolean }) => {
    this.loggerService.log("syncMarkdownService clear", { payload });
    if (payload) {
      const key = CREATE_KEY_FN(payload.symbol, payload.strategyName, payload.exchangeName, payload.frameName, payload.backtest);
      this.getStorage.clear(key);
    } else {
      this.getStorage.clear();
    }
  };
}

export default SyncMarkdownService;

import { IPublicSignalRow, StrategyName } from "../../../interfaces/Strategy.interface";
import { MarkdownWriter } from "../../../classes/Writer";
import { inject } from "../../../lib/core/di";
import LoggerService, { TLoggerService } from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { memoize, singleshot } from "functools-kit";
import { highestProfitSubject } from "../../../config/emitters";
import {
  HighestProfitStatisticsModel,
  HighestProfitEvent,
} from "../../../model/HighestProfitStatistics.model";
import { ColumnModel } from "../../../model/Column.model";
import { COLUMN_CONFIG } from "../../../config/columns";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";
import { getContextTimestamp } from "../../../helpers/getContextTimestamp";
import { GLOBAL_CONFIG } from "../../../config/params";

/**
 * Type alias for column configuration used in highest profit markdown reports.
 */
export type Columns = ColumnModel<HighestProfitEvent>;

/**
 * Creates a unique memoization key for a symbol-strategy-exchange-frame-backtest combination.
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
 * Accumulates highest profit events per symbol-strategy-exchange-frame combination.
 */
class ReportStorage {
  private _eventList: HighestProfitEvent[] = [];

  constructor(
    readonly symbol: string,
    readonly strategyName: StrategyName,
    readonly exchangeName: ExchangeName,
    readonly frameName: FrameName
  ) {}

  /**
   * Constructs a `HighestProfitEvent` from the given signal snapshot and
   * prepends it to the internal queue (most recent first).
   *
   * Once the queue exceeds `GLOBAL_CONFIG.CC_MAX_HIGHEST_PROFIT_MARKDOWN_ROWS`
   * (250) entries, the oldest entry is dropped from the tail.
   *
   * @param data - Public signal row at the moment the new profit record was set;
   *   provides `symbol`, `strategyName`, `id`, `position`, `pnl`,
   *   `priceOpen`, `priceTakeProfit`, `priceStopLoss`
   * @param currentPrice - Market price at which the new highest profit was reached
   * @param backtest - `true` if the event originated from a backtest run
   * @param timestamp - Unix timestamp in milliseconds of the profit update
   *   (from `HighestProfitContract.timestamp`)
   */
  public addEvent(
    data: IPublicSignalRow,
    currentPrice: number,
    backtest: boolean,
    timestamp: number
  ) {
    this._eventList.unshift({
      timestamp,
      symbol: data.symbol,
      strategyName: data.strategyName,
      signalId: data.id,
      position: data.position,
      pnl: data.pnl,
      currentPrice,
      priceOpen: data.priceOpen,
      priceTakeProfit: data.priceTakeProfit,
      priceStopLoss: data.priceStopLoss,
      backtest,
    });

    if (this._eventList.length > GLOBAL_CONFIG.CC_MAX_HIGHEST_PROFIT_MARKDOWN_ROWS) {
      this._eventList.pop();
    }
  }

  /**
   * Returns the accumulated event list with a total count.
   *
   * Unlike `SyncMarkdownService` / `HeatMarkdownService`, no additional
   * aggregation is performed — the raw queue is returned as-is.
   * If no events have been recorded yet, `eventList` is empty and
   * `totalEvents` is `0`.
   *
   * @returns Promise resolving to `HighestProfitStatisticsModel` with
   *   `eventList` (newest first) and `totalEvents`
   */
  public async getData(): Promise<HighestProfitStatisticsModel> {
    return {
      eventList: this._eventList,
      totalEvents: this._eventList.length,
    };
  }

  /**
   * Renders a markdown highest profit report for this storage instance.
   *
   * Output structure (when events are available):
   * ```
   * # Highest Profit Report: {symbol}:{strategyName}
   *
   * | col1 | col2 | ... |
   * | ---  | ---  | ... |
   * | ...  | ...  | ... |
   *
   * **Total events:** N
   * ```
   * When no events have been recorded yet, returns a minimal header with
   * `"No highest profit events recorded yet."`.
   *
   * Only columns whose `isVisible()` returns `true` are included.
   * Rows are ordered newest-first (same order as the internal queue).
   *
   * @param symbol - Symbol rendered in the `# Highest Profit Report:` heading
   * @param strategyName - Strategy name rendered in the heading
   * @param columns - Column definitions controlling which fields appear and how
   *   they are formatted; defaults to `COLUMN_CONFIG.highest_profit_columns`
   * @returns Promise resolving to the full markdown string
   */
  public async getReport(
    symbol: string,
    strategyName: StrategyName,
    columns: Columns[] = COLUMN_CONFIG.highest_profit_columns
  ): Promise<string> {
    const stats = await this.getData();

    if (stats.totalEvents === 0) {
      return [
        `# Highest Profit Report: ${symbol}:${strategyName}`,
        "",
        "No highest profit events recorded yet.",
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
      `# Highest Profit Report: ${symbol}:${strategyName}`,
      "",
      table,
      "",
      `**Total events:** ${stats.totalEvents}`,
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
   * @param path - Directory to write the file into; defaults to `"./dump/highest_profit"`
   * @param columns - Column definitions for table formatting;
   *   defaults to `COLUMN_CONFIG.highest_profit_columns`
   */
  public async dump(
    symbol: string,
    strategyName: StrategyName,
    path = "./dump/highest_profit",
    columns: Columns[] = COLUMN_CONFIG.highest_profit_columns
  ): Promise<void> {
    const markdown = await this.getReport(symbol, strategyName, columns);
    const timestamp = getContextTimestamp();
    const filename = CREATE_FILE_NAME_FN(this.symbol, strategyName, this.exchangeName, this.frameName, timestamp);
    await MarkdownWriter.writeData("highest_profit", markdown, {
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
 * Service for generating and saving highest profit markdown reports.
 *
 * Listens to highestProfitSubject and accumulates events per
 * symbol-strategy-exchange-frame combination. Provides getData(),
 * getReport(), and dump() methods matching the Partial pattern.
 */
export class HighestProfitMarkdownService {
  private readonly loggerService = inject<TLoggerService>(TYPES.loggerService);

  private getStorage = memoize<(symbol: string, strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean) => ReportStorage>(
    ([symbol, strategyName, exchangeName, frameName, backtest]) => CREATE_KEY_FN(symbol, strategyName, exchangeName, frameName, backtest),
    (symbol, strategyName, exchangeName, frameName) => new ReportStorage(symbol, strategyName, exchangeName, frameName)
  );

  /**
   * Subscribes to `highestProfitSubject` to start receiving `HighestProfitContract`
   * events. Protected against multiple subscriptions via `singleshot` — subsequent
   * calls return the same unsubscribe function without re-subscribing.
   *
   * The returned unsubscribe function clears the `singleshot` state, evicts all
   * memoized `ReportStorage` instances, and detaches from `highestProfitSubject`.
   *
   * @returns Unsubscribe function; calling it tears down the subscription and
   *   clears all accumulated data
   *
   * @example
   * ```typescript
   * const service = new HighestProfitMarkdownService();
   * const unsubscribe = service.subscribe();
   * // ... later
   * unsubscribe();
   * ```
   */
  public subscribe = singleshot(() => {
    this.loggerService.log("highestProfitMarkdownService init");
    const unsub = highestProfitSubject.subscribe(this.tick);
    return () => {
      this.subscribe.clear();
      this.clear();
      unsub();
    };
  });

  /**
   * Detaches from `highestProfitSubject` and clears all accumulated data.
   *
   * Calls the unsubscribe closure returned by `subscribe()`.
   * If `subscribe()` was never called, does nothing.
   *
   * @example
   * ```typescript
   * const service = new HighestProfitMarkdownService();
   * service.subscribe();
   * // ... later
   * await service.unsubscribe();
   * ```
   */
  public unsubscribe = async () => {
    this.loggerService.log("highestProfitMarkdownService unsubscribe");
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };

  /**
   * Handles a single `HighestProfitContract` event emitted by `highestProfitSubject`.
   *
   * Routes the payload to the appropriate `ReportStorage` bucket via
   * `getStorage(symbol, strategyName, exchangeName, frameName, backtest)` —
   * where `strategyName` is taken from `data.signal.strategyName` — and
   * delegates event construction to `ReportStorage.addEvent`.
   *
   * @param data - `HighestProfitContract` payload containing `symbol`,
   *   `signal`, `currentPrice`, `backtest`, `timestamp`, `exchangeName`,
   *   `frameName`
   */
  private tick = async (data: {
    symbol: string;
    signal: IPublicSignalRow;
    currentPrice: number;
    backtest: boolean;
    timestamp: number;
    exchangeName: ExchangeName;
    frameName: FrameName;
  }) => {
    this.loggerService.log("highestProfitMarkdownService tick", { data });
    const storage = this.getStorage(data.symbol, data.signal.strategyName, data.exchangeName, data.frameName, data.backtest);
    storage.addEvent(data.signal, data.currentPrice, data.backtest, data.timestamp);
  };

  /**
   * Returns accumulated highest profit statistics for the given context.
   *
   * Delegates to the `ReportStorage` bucket identified by
   * `(symbol, strategyName, exchangeName, frameName, backtest)`.
   * If no events have been recorded yet for that combination, the returned
   * model has an empty `eventList` and `totalEvents` of `0`.
   *
   * @param symbol - Trading pair symbol (e.g. `"BTCUSDT"`)
   * @param strategyName - Strategy identifier
   * @param exchangeName - Exchange identifier (e.g. `"binance"`)
   * @param frameName - Backtest frame identifier; empty string for live mode
   * @param backtest - `true` for backtest mode, `false` for live mode
   * @returns Promise resolving to `HighestProfitStatisticsModel` with
   *   `eventList` (newest first) and `totalEvents`
   * @throws {Error} If `subscribe()` has not been called before this method
   */
  public getData = async (symbol: string, strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean): Promise<HighestProfitStatisticsModel> => {
    this.loggerService.log("highestProfitMarkdownService getData", { symbol, strategyName, exchangeName, frameName, backtest });
    if (!this.subscribe.hasValue()) {
      throw new Error("HighestProfitMarkdownService not initialized. Call subscribe() before getting data.");
    }
    const storage = this.getStorage(symbol, strategyName, exchangeName, frameName, backtest);
    return storage.getData();
  };

  /**
   * Generates a markdown highest profit report for the given context.
   *
   * Delegates to `ReportStorage.getReport`. The resulting string includes a
   * markdown table (newest events first) followed by the total event count.
   *
   * @param symbol - Trading pair symbol (e.g. `"BTCUSDT"`)
   * @param strategyName - Strategy identifier
   * @param exchangeName - Exchange identifier (e.g. `"binance"`)
   * @param frameName - Backtest frame identifier; empty string for live mode
   * @param backtest - `true` for backtest mode, `false` for live mode
   * @param columns - Column definitions controlling the table layout;
   *   defaults to `COLUMN_CONFIG.highest_profit_columns`
   * @returns Promise resolving to the full markdown string
   * @throws {Error} If `subscribe()` has not been called before this method
   */
  public getReport = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
    columns: Columns[] = COLUMN_CONFIG.highest_profit_columns
  ): Promise<string> => {
    this.loggerService.log("highestProfitMarkdownService getReport", { symbol, strategyName, exchangeName, frameName, backtest });
    if (!this.subscribe.hasValue()) {
      throw new Error("HighestProfitMarkdownService not initialized. Call subscribe() before generating reports.");
    }
    const storage = this.getStorage(symbol, strategyName, exchangeName, frameName, backtest);
    return storage.getReport(symbol, strategyName, columns);
  };

  /**
   * Generates the highest profit report and writes it to disk.
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
   * @param path - Directory to write the file into; defaults to `"./dump/highest_profit"`
   * @param columns - Column definitions for table formatting;
   *   defaults to `COLUMN_CONFIG.highest_profit_columns`
   * @throws {Error} If `subscribe()` has not been called before this method
   */
  public dump = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
    path = "./dump/highest_profit",
    columns: Columns[] = COLUMN_CONFIG.highest_profit_columns
  ): Promise<void> => {
    this.loggerService.log("highestProfitMarkdownService dump", { symbol, strategyName, exchangeName, frameName, backtest, path });
    if (!this.subscribe.hasValue()) {
      throw new Error("HighestProfitMarkdownService not initialized. Call subscribe() before dumping reports.");
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
    this.loggerService.log("highestProfitMarkdownService clear", { payload });
    if (payload) {
      const key = CREATE_KEY_FN(payload.symbol, payload.strategyName, payload.exchangeName, payload.frameName, payload.backtest);
      this.getStorage.clear(key);
    } else {
      this.getStorage.clear();
    }
  };
}

export default HighestProfitMarkdownService;

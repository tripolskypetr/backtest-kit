import { StrategyName } from "../../../interfaces/Strategy.interface";
import { MarkdownWriter } from "../../../classes/Writer";
import { inject } from "../../../lib/core/di";
import LoggerService, { TLoggerService } from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { memoize, singleshot } from "functools-kit";
import { budgetSubject } from "../../../config/emitters";
import {
  BudgetStatisticsModel,
  BudgetEvent,
} from "../../../model/BudgetStatistics.model";
import { ColumnModel } from "../../../model/Column.model";
import { COLUMN_CONFIG } from "../../../config/columns";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";
import { getContextTimestamp } from "../../../helpers/getContextTimestamp";
import { GLOBAL_CONFIG } from "../../../config/params";
import { BudgetContract } from "../../../contract/Budget.contract";
import type { BudgetName } from "../../../classes/Budget";

/**
 * Type alias for column configuration used in budget markdown reports.
 */
export type Columns = ColumnModel<BudgetEvent>;

/**
 * Creates a unique memoization key for a strategy-exchange-frame-backtest-name combination.
 * No symbol: a budget record is shared by every symbol of the strategy run.
 */
const CREATE_KEY_FN = (
  strategyName: StrategyName,
  exchangeName: ExchangeName,
  frameName: FrameName,
  backtest: boolean,
  name: BudgetName
): string => {
  const parts = [strategyName, exchangeName];
  if (frameName) parts.push(frameName);
  parts.push(backtest ? "backtest" : "live");
  parts.push(name);
  return parts.join(":");
};

/**
 * Creates a filename for the markdown report.
 */
const CREATE_FILE_NAME_FN = (
  strategyName: StrategyName,
  exchangeName: ExchangeName,
  frameName: FrameName,
  name: BudgetName,
  timestamp: number
): string => {
  const parts = [strategyName, exchangeName];
  if (frameName) { parts.push(frameName); parts.push("backtest"); }
  else parts.push("live");
  parts.push(name);
  return `${parts.join("_")}-${timestamp}.md`;
};

/**
 * Accumulates budget journal rows per strategy-exchange-frame-backtest-name combination.
 */
class ReportStorage {
  private _eventList: BudgetEvent[] = [];

  constructor(
    readonly strategyName: StrategyName,
    readonly exchangeName: ExchangeName,
    readonly frameName: FrameName,
    readonly backtest: boolean,
    readonly name: BudgetName
  ) {}

  /**
   * Constructs a `BudgetEvent` from the contract and prepends it to the
   * internal queue (most recent arrival first).
   *
   * Once the queue exceeds `GLOBAL_CONFIG.CC_MAX_BUDGET_MARKDOWN_ROWS`
   * (250) entries, the oldest entry is dropped from the tail.
   *
   * @param data - `BudgetContract` payload with the record key, the budget name and the inserted row
   */
  public addEvent(data: BudgetContract) {
    this._eventList.unshift({
      ...data.row,
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      backtest: data.backtest,
      name: data.name,
    });

    if (this._eventList.length > GLOBAL_CONFIG.CC_MAX_BUDGET_MARKDOWN_ROWS) {
      this._eventList.pop();
    }
  }

  /**
   * Returns the accumulated event list with totals.
   *
   * If no rows have been recorded yet, `eventList` is empty and every total is `0`.
   *
   * @returns Promise resolving to `BudgetStatisticsModel` with `eventList`
   *   (newest first), `totalEvents`, `totalRejects` and `totalOverdrafts`
   */
  public async getData(): Promise<BudgetStatisticsModel> {
    let totalRejects = 0;
    let totalOverdrafts = 0;
    for (const event of this._eventList) {
      if (event.type === "reject") {
        totalRejects += 1;
      }
      if (event.type === "reserve" && event.overdraft !== undefined) {
        totalOverdrafts += 1;
      }
    }
    return {
      eventList: this._eventList,
      totalEvents: this._eventList.length,
      totalRejects,
      totalOverdrafts,
    };
  }

  /**
   * Renders a markdown budget report for this storage instance.
   *
   * Output structure (when rows are available):
   * ```
   * # Budget Report: {strategyName}:{name}
   *
   * | col1 | col2 | ... |
   * | ---  | ---  | ... |
   * | ...  | ...  | ... |
   *
   * **Total rows:** N
   * **Rejects:** N
   * **Overdrafts:** N
   * ```
   * When no rows have been recorded yet, returns a minimal header with
   * `"No budget rows recorded yet."`.
   *
   * Only columns whose `isVisible()` returns `true` are included.
   * Rows are ordered newest-first (same order as the internal queue).
   *
   * @param strategyName - Strategy name rendered in the heading
   * @param name - Budget name rendered in the heading
   * @param columns - Column definitions controlling which fields appear and how
   *   they are formatted; defaults to `COLUMN_CONFIG.budget_columns`
   * @returns Promise resolving to the full markdown string
   */
  public async getReport(
    strategyName: StrategyName,
    name: BudgetName,
    columns: Columns[] = COLUMN_CONFIG.budget_columns
  ): Promise<string> {
    const stats = await this.getData();

    if (stats.totalEvents === 0) {
      return [
        `# Budget Report: ${strategyName}:${name}`,
        "",
        "No budget rows recorded yet.",
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
      `# Budget Report: ${strategyName}:${name}`,
      "",
      table,
      "",
      `**Total rows:** ${stats.totalEvents}`,
      `**Rejects:** ${stats.totalRejects}`,
      `**Overdrafts:** ${stats.totalOverdrafts}`,
    ].join("\n");
  }

  /**
   * Generates the markdown report and persists it via `MarkdownWriter.writeData`.
   *
   * The filename is built by `CREATE_FILE_NAME_FN`:
   * - Backtest: `{strategyName}_{exchangeName}_{frameName}_backtest_{name}-{timestamp}.md`
   * - Live:     `{strategyName}_{exchangeName}_live_{name}-{timestamp}.md`
   *
   * The timestamp comes from `getContextTimestamp()` — the backtest execution
   * context clock when inside a backtest, or the real clock aligned to the
   * nearest minute when running live.
   *
   * @param strategyName - Strategy name used in the heading and filename
   * @param name - Budget name used in the heading and filename
   * @param path - Directory to write the file into; defaults to `"./dump/budget"`
   * @param columns - Column definitions for table formatting;
   *   defaults to `COLUMN_CONFIG.budget_columns`
   */
  public async dump(
    strategyName: StrategyName,
    name: BudgetName,
    path = "./dump/budget",
    columns: Columns[] = COLUMN_CONFIG.budget_columns
  ): Promise<void> {
    const markdown = await this.getReport(strategyName, name, columns);
    const timestamp = getContextTimestamp();
    const filename = CREATE_FILE_NAME_FN(strategyName, this.exchangeName, this.frameName, name, timestamp);
    await MarkdownWriter.writeData("budget", markdown, {
      path,
      file: filename,
      symbol: "",
      signalId: "",
      strategyName: this.strategyName,
      exchangeName: this.exchangeName,
      frameName: this.frameName,
    });
  }
}

/**
 * Service for generating and saving budget markdown reports.
 *
 * Listens to budgetSubject and accumulates journal rows per
 * strategy-exchange-frame-backtest-name combination (one bucket per budget
 * record, shared by every symbol of the run). Provides getData(),
 * getReport(), and dump() methods matching the HighestProfit pattern.
 */
export class BudgetMarkdownService {
  private readonly loggerService = inject<TLoggerService>(TYPES.loggerService);

  private getStorage = memoize<(strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean, name: BudgetName) => ReportStorage>(
    ([strategyName, exchangeName, frameName, backtest, name]) => CREATE_KEY_FN(strategyName, exchangeName, frameName, backtest, name),
    (strategyName, exchangeName, frameName, backtest, name) => new ReportStorage(strategyName, exchangeName, frameName, backtest, name)
  );

  /**
   * Subscribes to `budgetSubject` to start receiving `BudgetContract`
   * events. Protected against multiple subscriptions via `singleshot` — subsequent
   * calls return the same unsubscribe function without re-subscribing.
   *
   * The returned unsubscribe function clears the `singleshot` state, evicts all
   * memoized `ReportStorage` instances, and detaches from `budgetSubject`.
   *
   * @returns Unsubscribe function; calling it tears down the subscription and
   *   clears all accumulated data
   *
   * @example
   * ```typescript
   * const service = new BudgetMarkdownService();
   * const unsubscribe = service.subscribe();
   * // ... later
   * unsubscribe();
   * ```
   */
  public subscribe = singleshot(() => {
    this.loggerService.log("budgetMarkdownService init");
    const unsub = budgetSubject.subscribe(this.tick);
    return () => {
      this.subscribe.clear();
      this.clear();
      unsub();
    };
  });

  /**
   * Detaches from `budgetSubject` and clears all accumulated data.
   *
   * Calls the unsubscribe closure returned by `subscribe()`.
   * If `subscribe()` was never called, does nothing.
   *
   * @example
   * ```typescript
   * const service = new BudgetMarkdownService();
   * service.subscribe();
   * // ... later
   * await service.unsubscribe();
   * ```
   */
  public unsubscribe = async () => {
    this.loggerService.log("budgetMarkdownService unsubscribe");
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };

  /**
   * Handles a single `BudgetContract` event emitted by `budgetSubject`.
   *
   * Routes the payload to the appropriate `ReportStorage` bucket via
   * `getStorage(strategyName, exchangeName, frameName, backtest, name)` and
   * delegates event construction to `ReportStorage.addEvent`.
   *
   * @param data - `BudgetContract` payload
   */
  private tick = async (data: BudgetContract) => {
    this.loggerService.log("budgetMarkdownService tick", { data });
    const storage = this.getStorage(data.strategyName, data.exchangeName, data.frameName, data.backtest, data.name);
    storage.addEvent(data);
  };

  /**
   * Returns accumulated budget statistics for the given record.
   *
   * Delegates to the `ReportStorage` bucket identified by
   * `(strategyName, exchangeName, frameName, backtest, name)`.
   * If no rows have been recorded yet for that combination, the returned
   * model has an empty `eventList` and zero totals.
   *
   * @param strategyName - Strategy identifier
   * @param exchangeName - Exchange identifier (e.g. `"binance"`)
   * @param frameName - Backtest frame identifier; empty string for live mode
   * @param backtest - `true` for backtest mode, `false` for live mode
   * @param name - Budget name
   * @returns Promise resolving to `BudgetStatisticsModel`
   * @throws {Error} If `subscribe()` has not been called before this method
   */
  public getData = async (strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean, name: BudgetName): Promise<BudgetStatisticsModel> => {
    this.loggerService.log("budgetMarkdownService getData", { strategyName, exchangeName, frameName, backtest, name });
    if (!this.subscribe.hasValue()) {
      throw new Error("BudgetMarkdownService not initialized. Call subscribe() before getting data.");
    }
    const storage = this.getStorage(strategyName, exchangeName, frameName, backtest, name);
    return storage.getData();
  };

  /**
   * Generates a markdown budget report for the given record.
   *
   * Delegates to `ReportStorage.getReport`. The resulting string includes a
   * markdown table (newest rows first) followed by the totals.
   *
   * @param strategyName - Strategy identifier
   * @param exchangeName - Exchange identifier (e.g. `"binance"`)
   * @param frameName - Backtest frame identifier; empty string for live mode
   * @param backtest - `true` for backtest mode, `false` for live mode
   * @param name - Budget name
   * @param columns - Column definitions controlling the table layout;
   *   defaults to `COLUMN_CONFIG.budget_columns`
   * @returns Promise resolving to the full markdown string
   * @throws {Error} If `subscribe()` has not been called before this method
   */
  public getReport = async (
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
    name: BudgetName,
    columns: Columns[] = COLUMN_CONFIG.budget_columns
  ): Promise<string> => {
    this.loggerService.log("budgetMarkdownService getReport", { strategyName, exchangeName, frameName, backtest, name });
    if (!this.subscribe.hasValue()) {
      throw new Error("BudgetMarkdownService not initialized. Call subscribe() before generating reports.");
    }
    const storage = this.getStorage(strategyName, exchangeName, frameName, backtest, name);
    return storage.getReport(strategyName, name, columns);
  };

  /**
   * Generates the budget report and writes it to disk.
   *
   * Delegates to `ReportStorage.dump`. The filename follows the pattern:
   * - Backtest: `{strategyName}_{exchangeName}_{frameName}_backtest_{name}-{timestamp}.md`
   * - Live:     `{strategyName}_{exchangeName}_live_{name}-{timestamp}.md`
   *
   * @param strategyName - Strategy identifier
   * @param exchangeName - Exchange identifier (e.g. `"binance"`)
   * @param frameName - Backtest frame identifier; empty string for live mode
   * @param backtest - `true` for backtest mode, `false` for live mode
   * @param name - Budget name
   * @param path - Directory to write the file into; defaults to `"./dump/budget"`
   * @param columns - Column definitions for table formatting;
   *   defaults to `COLUMN_CONFIG.budget_columns`
   * @throws {Error} If `subscribe()` has not been called before this method
   */
  public dump = async (
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
    name: BudgetName,
    path = "./dump/budget",
    columns: Columns[] = COLUMN_CONFIG.budget_columns
  ): Promise<void> => {
    this.loggerService.log("budgetMarkdownService dump", { strategyName, exchangeName, frameName, backtest, name, path });
    if (!this.subscribe.hasValue()) {
      throw new Error("BudgetMarkdownService not initialized. Call subscribe() before dumping reports.");
    }
    const storage = this.getStorage(strategyName, exchangeName, frameName, backtest, name);
    await storage.dump(strategyName, name, path, columns);
  };

  /**
   * Evicts memoized `ReportStorage` instances, releasing all accumulated rows.
   *
   * - With `payload` — clears only the storage bucket identified by
   *   `(strategyName, exchangeName, frameName, backtest, name)`;
   *   subsequent calls for that combination start from an empty state.
   * - Without `payload` — clears **all** storage buckets.
   *
   * Also called internally by the unsubscribe closure returned from `subscribe()`.
   *
   * @param payload - Optional scope to restrict which bucket is cleared;
   *   omit to clear everything
   */
  public clear = async (payload?: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName; backtest: boolean; name: BudgetName }) => {
    this.loggerService.log("budgetMarkdownService clear", { payload });
    if (payload) {
      const key = CREATE_KEY_FN(payload.strategyName, payload.exchangeName, payload.frameName, payload.backtest, payload.name);
      this.getStorage.clear(key);
    } else {
      this.getStorage.clear();
    }
  };
}

export default BudgetMarkdownService;

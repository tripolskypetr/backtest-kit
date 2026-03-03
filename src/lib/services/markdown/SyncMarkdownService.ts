import { inject } from "../../core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/types";
import { memoize, singleshot } from "functools-kit";
import { StrategyName } from "../../../interfaces/Strategy.interface";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";
import { Markdown } from "../../../classes/Markdown";
import { SyncStatisticsModel, SyncEvent } from "../../../model/SyncStatistics.model";
import { ColumnModel } from "../../../model/Column.model";
import { COLUMN_CONFIG } from "../../../config/columns";
import { syncSubject } from "../../../config/emitters";
import SignalSyncContract from "../../../contract/SignalSync.contract";
import { getContextTimestamp } from "../../../helpers/getContextTimestamp";

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

/** Maximum number of events to store in sync reports */
const MAX_EVENTS = 250;

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
    readonly frameName: FrameName
  ) {}

  public addEvent(event: SyncEvent) {
    this._eventList.unshift(event);
    if (this._eventList.length > MAX_EVENTS) {
      this._eventList.pop();
    }
  }

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

  public async dump(
    symbol: string,
    strategyName: StrategyName,
    path = "./dump/sync",
    columns: Columns[] = COLUMN_CONFIG.sync_columns
  ): Promise<void> {
    const markdown = await this.getReport(symbol, strategyName, columns);
    const timestamp = getContextTimestamp();
    const filename = CREATE_FILE_NAME_FN(this.symbol, strategyName, this.exchangeName, this.frameName, timestamp);
    await Markdown.writeData("sync", markdown, {
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
 * const unsubscribe = Markdown.enable({ sync: true });
 * // ... later
 * unsubscribe();
 * ```
 */
export class SyncMarkdownService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private getStorage = memoize<(symbol: string, strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean) => ReportStorage>(
    ([symbol, strategyName, exchangeName, frameName, backtest]) => CREATE_KEY_FN(symbol, strategyName, exchangeName, frameName, backtest),
    (symbol, strategyName, exchangeName, frameName, backtest) => new ReportStorage(symbol, strategyName, exchangeName, frameName)
  );

  public subscribe = singleshot(() => {
    this.loggerService.log("syncMarkdownService init");
    const unsubscribe = syncSubject.subscribe(this.tick);
    return () => {
      this.subscribe.clear();
      this.clear();
      unsubscribe();
    };
  });

  public unsubscribe = async () => {
    this.loggerService.log("syncMarkdownService unsubscribe");
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };

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

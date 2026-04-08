import { IPublicSignalRow, StrategyName } from "../../../interfaces/Strategy.interface";
import { MarkdownWriter } from "../../../classes/Writer";
import { inject } from "../../../lib/core/di";
import LoggerService, { TLoggerService } from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { memoize, singleshot } from "functools-kit";
import { maxDrawdownSubject } from "../../../config/emitters";
import {
  MaxDrawdownStatisticsModel,
  MaxDrawdownEvent,
} from "../../../model/MaxDrawdownStatistics.model";
import { ColumnModel } from "../../../model/Column.model";
import { COLUMN_CONFIG } from "../../../config/columns";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";
import { getContextTimestamp } from "../../../helpers/getContextTimestamp";
import { GLOBAL_CONFIG } from "../../../config/params";

/**
 * Type alias for column configuration used in max drawdown markdown reports.
 */
export type Columns = ColumnModel<MaxDrawdownEvent>;

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
 * Accumulates max drawdown events per symbol-strategy-exchange-frame combination.
 */
class ReportStorage {
  private _eventList: MaxDrawdownEvent[] = [];

  constructor(
    readonly symbol: string,
    readonly strategyName: StrategyName,
    readonly exchangeName: ExchangeName,
    readonly frameName: FrameName
  ) {}

  /**
   * Constructs a `MaxDrawdownEvent` from the given signal snapshot and
   * prepends it to the internal queue (most recent first).
   *
   * Once the queue exceeds `GLOBAL_CONFIG.CC_MAX_MAX_DRAWDOWN_MARKDOWN_ROWS`
   * entries, the oldest entry is dropped from the tail.
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

    if (this._eventList.length > GLOBAL_CONFIG.CC_MAX_MAX_DRAWDOWN_MARKDOWN_ROWS) {
      this._eventList.pop();
    }
  }

  /**
   * Returns the accumulated event list with a total count.
   */
  public async getData(): Promise<MaxDrawdownStatisticsModel> {
    return {
      eventList: this._eventList,
      totalEvents: this._eventList.length,
    };
  }

  /**
   * Renders a markdown max drawdown report for this storage instance.
   */
  public async getReport(
    symbol: string,
    strategyName: StrategyName,
    columns: Columns[] = COLUMN_CONFIG.max_drawdown_columns
  ): Promise<string> {
    const stats = await this.getData();

    if (stats.totalEvents === 0) {
      return [
        `# Max Drawdown Report: ${symbol}:${strategyName}`,
        "",
        "No max drawdown events recorded yet.",
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
      `# Max Drawdown Report: ${symbol}:${strategyName}`,
      "",
      table,
      "",
      `**Total events:** ${stats.totalEvents}`,
    ].join("\n");
  }

  /**
   * Generates the markdown report and persists it via `MarkdownWriter.writeData`.
   */
  public async dump(
    symbol: string,
    strategyName: StrategyName,
    path = "./dump/max_drawdown",
    columns: Columns[] = COLUMN_CONFIG.max_drawdown_columns
  ): Promise<void> {
    const markdown = await this.getReport(symbol, strategyName, columns);
    const timestamp = getContextTimestamp();
    const filename = CREATE_FILE_NAME_FN(this.symbol, strategyName, this.exchangeName, this.frameName, timestamp);
    await MarkdownWriter.writeData("max_drawdown", markdown, {
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
 * Service for generating and saving max drawdown markdown reports.
 *
 * Listens to maxDrawdownSubject and accumulates events per
 * symbol-strategy-exchange-frame combination. Provides getData(),
 * getReport(), and dump() methods matching the HighestProfit pattern.
 */
export class MaxDrawdownMarkdownService {
  private readonly loggerService = inject<TLoggerService>(TYPES.loggerService);

  private getStorage = memoize<(symbol: string, strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean) => ReportStorage>(
    ([symbol, strategyName, exchangeName, frameName, backtest]) => CREATE_KEY_FN(symbol, strategyName, exchangeName, frameName, backtest),
    (symbol, strategyName, exchangeName, frameName) => new ReportStorage(symbol, strategyName, exchangeName, frameName)
  );

  /**
   * Subscribes to `maxDrawdownSubject` to start receiving `MaxDrawdownContract`
   * events. Protected against multiple subscriptions via `singleshot`.
   *
   * @returns Unsubscribe function; calling it tears down the subscription and
   *   clears all accumulated data
   */
  public subscribe = singleshot(() => {
    this.loggerService.log("maxDrawdownMarkdownService init");
    const unsub = maxDrawdownSubject.subscribe(this.tick);
    return () => {
      this.subscribe.clear();
      this.clear();
      unsub();
    };
  });

  /**
   * Detaches from `maxDrawdownSubject` and clears all accumulated data.
   *
   * If `subscribe()` was never called, does nothing.
   */
  public unsubscribe = async () => {
    this.loggerService.log("maxDrawdownMarkdownService unsubscribe");
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };

  /**
   * Handles a single `MaxDrawdownContract` event emitted by `maxDrawdownSubject`.
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
    this.loggerService.log("maxDrawdownMarkdownService tick", { data });
    const storage = this.getStorage(data.symbol, data.signal.strategyName, data.exchangeName, data.frameName, data.backtest);
    storage.addEvent(data.signal, data.currentPrice, data.backtest, data.timestamp);
  };

  /**
   * Returns accumulated max drawdown statistics for the given context.
   */
  public getData = async (symbol: string, strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean): Promise<MaxDrawdownStatisticsModel> => {
    this.loggerService.log("maxDrawdownMarkdownService getData", { symbol, strategyName, exchangeName, frameName, backtest });
    if (!this.subscribe.hasValue()) {
      throw new Error("MaxDrawdownMarkdownService not initialized. Call subscribe() before getting data.");
    }
    const storage = this.getStorage(symbol, strategyName, exchangeName, frameName, backtest);
    return storage.getData();
  };

  /**
   * Generates a markdown max drawdown report for the given context.
   */
  public getReport = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
    columns: Columns[] = COLUMN_CONFIG.max_drawdown_columns
  ): Promise<string> => {
    this.loggerService.log("maxDrawdownMarkdownService getReport", { symbol, strategyName, exchangeName, frameName, backtest });
    if (!this.subscribe.hasValue()) {
      throw new Error("MaxDrawdownMarkdownService not initialized. Call subscribe() before generating reports.");
    }
    const storage = this.getStorage(symbol, strategyName, exchangeName, frameName, backtest);
    return storage.getReport(symbol, strategyName, columns);
  };

  /**
   * Generates the max drawdown report and writes it to disk.
   */
  public dump = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
    path = "./dump/max_drawdown",
    columns: Columns[] = COLUMN_CONFIG.max_drawdown_columns
  ): Promise<void> => {
    this.loggerService.log("maxDrawdownMarkdownService dump", { symbol, strategyName, exchangeName, frameName, backtest, path });
    if (!this.subscribe.hasValue()) {
      throw new Error("MaxDrawdownMarkdownService not initialized. Call subscribe() before dumping reports.");
    }
    const storage = this.getStorage(symbol, strategyName, exchangeName, frameName, backtest);
    await storage.dump(symbol, strategyName, path, columns);
  };

  /**
   * Evicts memoized `ReportStorage` instances, releasing all accumulated event data.
   *
   * - With `payload` — clears only the storage bucket for that combination.
   * - Without `payload` — clears **all** storage buckets.
   */
  public clear = async (payload?: { symbol: string; strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName; backtest: boolean }) => {
    this.loggerService.log("maxDrawdownMarkdownService clear", { payload });
    if (payload) {
      const key = CREATE_KEY_FN(payload.symbol, payload.strategyName, payload.exchangeName, payload.frameName, payload.backtest);
      this.getStorage.clear(key);
    } else {
      this.getStorage.clear();
    }
  };
}

export default MaxDrawdownMarkdownService;

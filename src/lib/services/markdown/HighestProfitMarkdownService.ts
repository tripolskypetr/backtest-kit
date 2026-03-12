import { IPublicSignalRow, StrategyName } from "../../../interfaces/Strategy.interface";
import { Markdown } from "../../../classes/Markdown";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
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

/** Maximum number of events to store per combination */
const MAX_EVENTS = 250;

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
   * Adds a highest profit event to the storage.
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
      currentPrice,
      priceOpen: data.priceOpen,
      priceTakeProfit: data.priceTakeProfit,
      priceStopLoss: data.priceStopLoss,
      backtest,
    });

    if (this._eventList.length > MAX_EVENTS) {
      this._eventList.pop();
    }
  }

  /**
   * Returns aggregated statistics from accumulated events.
   */
  public async getData(): Promise<HighestProfitStatisticsModel> {
    return {
      eventList: this._eventList,
      totalEvents: this._eventList.length,
    };
  }

  /**
   * Generates a markdown report table for this storage.
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
   * Saves the report to disk.
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
    await Markdown.writeData("highest_profit", markdown, {
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
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private getStorage = memoize<(symbol: string, strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean) => ReportStorage>(
    ([symbol, strategyName, exchangeName, frameName, backtest]) => CREATE_KEY_FN(symbol, strategyName, exchangeName, frameName, backtest),
    (symbol, strategyName, exchangeName, frameName) => new ReportStorage(symbol, strategyName, exchangeName, frameName)
  );

  public subscribe = singleshot(() => {
    this.loggerService.log("highestProfitMarkdownService init");
    const unsub = highestProfitSubject.subscribe(this.tick);
    return () => {
      this.subscribe.clear();
      this.clear();
      unsub();
    };
  });

  public unsubscribe = async () => {
    this.loggerService.log("highestProfitMarkdownService unsubscribe");
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };

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

  public getData = async (symbol: string, strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean): Promise<HighestProfitStatisticsModel> => {
    this.loggerService.log("highestProfitMarkdownService getData", { symbol, strategyName, exchangeName, frameName, backtest });
    if (!this.subscribe.hasValue()) {
      throw new Error("HighestProfitMarkdownService not initialized. Call subscribe() before getting data.");
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
    columns: Columns[] = COLUMN_CONFIG.highest_profit_columns
  ): Promise<string> => {
    this.loggerService.log("highestProfitMarkdownService getReport", { symbol, strategyName, exchangeName, frameName, backtest });
    if (!this.subscribe.hasValue()) {
      throw new Error("HighestProfitMarkdownService not initialized. Call subscribe() before generating reports.");
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

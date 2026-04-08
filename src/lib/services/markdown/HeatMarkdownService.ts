import { MarkdownWriter } from "../../../classes/Writer";
import {
  IStrategyTickResult,
  IStrategyTickResultClosed,
  StrategyName,
} from "../../../interfaces/Strategy.interface";
import { inject } from "../../../lib/core/di";
import LoggerService, { TLoggerService } from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { memoize, singleshot, str } from "functools-kit";
import { signalEmitter } from "../../../config/emitters";
import { IHeatmapRow } from "../../../interfaces/Heatmap.interface";
import { HeatmapStatisticsModel } from "../../../model/HeatmapStatistics.model";
import { ColumnModel } from "../../../model/Column.model";
import { COLUMN_CONFIG } from "../../../config/columns";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";
import { getContextTimestamp } from "../../../helpers/getContextTimestamp";
import { GLOBAL_CONFIG } from "../../../config/params";

/**
 * Type alias for column configuration used in heatmap markdown reports.
 * 
 * Represents a column model specifically designed to format and display
 * per-symbol portfolio statistics in markdown tables.
 * 
 * @typeParam IHeatmapRow - The heatmap row data type containing aggregated
 *   statistics per symbol (PNL, Sharpe Ratio, Max Drawdown, trade counts)
 * 
 * @example
 * ```typescript
 * // Column to display symbol name
 * const symbolColumn: Columns = {
 *   key: "symbol",
 *   label: "Symbol",
 *   format: (row) => row.symbol,
 *   isVisible: () => true
 * };
 * 
 * // Column to display portfolio PNL
 * const pnlColumn: Columns = {
 *   key: "totalPnl",
 *   label: "Total PNL %",
 *   format: (row) => row.totalPnl !== null ? row.totalPnl.toFixed(2) + '%' : 'N/A',
 *   isVisible: () => true
 * };
 * ```
 * 
 * @see ColumnModel for the base interface
 * @see IHeatmapRow for the row data structure
 */
export type Columns = ColumnModel<IHeatmapRow>;

/**
 * Creates a unique key for memoizing HeatmapStorage instances.
 * Key format: "exchangeName:frameName:backtest" or "exchangeName:live"
 * @param exchangeName - Exchange name
 * @param frameName - Frame name
 * @param backtest - Whether running in backtest mode
 * @returns Unique string key for memoization
 */
const CREATE_KEY_FN = (
  exchangeName: ExchangeName,
  frameName: FrameName,
  backtest: boolean
): string => {
  const parts = [exchangeName];
  if (frameName) parts.push(frameName);
  parts.push(backtest ? "backtest" : "live");
  return parts.join(":");
};

/**
 * Creates a filename for markdown report based on memoization key components.
 * Filename format: "strategyName_exchangeName_frameName-timestamp.md"
 */
const CREATE_FILE_NAME_FN = (
  strategyName: StrategyName,
  exchangeName: ExchangeName,
  frameName: FrameName,
  timestamp: number
): string => {
  const parts = [strategyName, exchangeName];
  if (frameName) { parts.push(frameName); parts.push("backtest"); }
  else parts.push("live");
  return `${parts.join("_")}-${timestamp}.md`;
};

const HEATMAP_METHOD_NAME_GET_DATA = "HeatMarkdownService.getData";
const HEATMAP_METHOD_NAME_GET_REPORT = "HeatMarkdownService.getReport";
const HEATMAP_METHOD_NAME_DUMP = "HeatMarkdownService.dump";
const HEATMAP_METHOD_NAME_CLEAR = "HeatMarkdownService.clear";

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
 * Storage class for accumulating closed signals per strategy and generating heatmap.
 * Maintains symbol-level statistics and provides portfolio-wide metrics.
 */
class HeatmapStorage {
  /** Internal storage of closed signals per symbol */
  private symbolData: Map<string, IStrategyTickResultClosed[]> = new Map();

  constructor(
    readonly exchangeName: ExchangeName,
    readonly frameName: FrameName,
    readonly backtest: boolean
  ) {}

  /**
   * Adds a closed signal to the per-symbol queue.
   *
   * New signals are prepended (most recent first). Once the queue exceeds
   * `GLOBAL_CONFIG.CC_MAX_HEATMAP_MARKDOWN_ROWS` (250) entries for a given
   * symbol, the oldest entry is dropped from the tail to cap memory usage.
   *
   * @param data - Closed signal result containing `symbol` and `pnl.pnlPercentage`
   */
  public addSignal(data: IStrategyTickResultClosed) {
    const { symbol } = data;

    if (!this.symbolData.has(symbol)) {
      this.symbolData.set(symbol, []);
    }

    const signals = this.symbolData.get(symbol)!;
    signals.unshift(data);

    // Trim queue if exceeded GLOBAL_CONFIG.CC_MAX_HEATMAP_MARKDOWN_ROWS per symbol
    if (signals.length > GLOBAL_CONFIG.CC_MAX_HEATMAP_MARKDOWN_ROWS) {
      signals.pop();
    }
  }


  /**
   * Calculates all aggregated trading statistics for a single symbol.
   *
   * Metrics computed (all guard-checked via `isUnsafe` — set to `null` on
   * NaN / Infinity / non-number):
   * - **totalPnl** — sum of `pnlPercentage` across all signals
   * - **avgPnl** — arithmetic mean of `pnlPercentage`
   * - **stdDev** — population standard deviation of `pnlPercentage`
   * - **sharpeRatio** — `avgPnl / stdDev`; requires ≥ 2 signals and `stdDev > 0`
   * - **maxDrawdown** — largest cumulative loss streak (absolute value of peak negative equity)
   * - **profitFactor** — `sumWins / |sumLosses|`; requires at least one win and one loss
   * - **avgWin / avgLoss** — mean of positive / negative trades respectively
   * - **winRate** — `winCount / totalTrades * 100`
   * - **maxWinStreak / maxLossStreak** — longest unbroken run of consecutive wins/losses
   * - **expectancy** — `(winRate/100)*avgWin + (lossRate/100)*avgLoss`
   *
   * @param symbol - Trading pair symbol (e.g. `"BTCUSDT"`)
   * @param signals - Array of closed signals for this symbol (newest first)
   * @returns `IHeatmapRow` with all aggregated statistics; unavailable metrics are `null`
   */
  private calculateSymbolStats(
    symbol: string,
    signals: IStrategyTickResultClosed[]
  ): IHeatmapRow {
    const totalTrades = signals.length;
    const winCount = signals.filter((s) => s.pnl.pnlPercentage > 0).length;
    const lossCount = signals.filter((s) => s.pnl.pnlPercentage < 0).length;

    // Calculate win rate
    let winRate: number | null = null;
    if (totalTrades > 0) {
      winRate = (winCount / totalTrades) * 100;
    }

    // Calculate total PNL
    let totalPnl: number | null = null;
    if (signals.length > 0) {
      totalPnl = signals.reduce((acc, s) => acc + s.pnl.pnlPercentage, 0);
    }

    // Calculate average PNL
    let avgPnl: number | null = null;
    if (signals.length > 0) {
      avgPnl = totalPnl! / signals.length;
    }

    // Calculate standard deviation
    let stdDev: number | null = null;
    if (signals.length > 1 && avgPnl !== null) {
      const variance =
        signals.reduce(
          (acc, s) => acc + Math.pow(s.pnl.pnlPercentage - avgPnl!, 2),
          0
        ) / signals.length;
      stdDev = Math.sqrt(variance);
    }

    // Calculate Sharpe Ratio
    let sharpeRatio: number | null = null;
    if (avgPnl !== null && stdDev !== null && stdDev !== 0) {
      sharpeRatio = avgPnl / stdDev;
    }

    // Calculate Maximum Drawdown
    let maxDrawdown: number | null = null;
    if (signals.length > 0) {
      let peak = 0;
      let currentDrawdown = 0;
      let maxDD = 0;

      for (const signal of signals) {
        peak += signal.pnl.pnlPercentage;
        if (peak > 0) {
          currentDrawdown = 0;
        } else {
          currentDrawdown = Math.abs(peak);
          if (currentDrawdown > maxDD) {
            maxDD = currentDrawdown;
          }
        }
      }

      maxDrawdown = maxDD;
    }

    // Calculate Profit Factor
    let profitFactor: number | null = null;
    if (winCount > 0 && lossCount > 0) {
      const sumWins = signals
        .filter((s) => s.pnl.pnlPercentage > 0)
        .reduce((acc, s) => acc + s.pnl.pnlPercentage, 0);
      const sumLosses = Math.abs(
        signals
          .filter((s) => s.pnl.pnlPercentage < 0)
          .reduce((acc, s) => acc + s.pnl.pnlPercentage, 0)
      );
      if (sumLosses > 0) {
        profitFactor = sumWins / sumLosses;
      }
    }

    // Calculate Average Win / Average Loss
    let avgWin: number | null = null;
    let avgLoss: number | null = null;
    if (winCount > 0) {
      avgWin =
        signals
          .filter((s) => s.pnl.pnlPercentage > 0)
          .reduce((acc, s) => acc + s.pnl.pnlPercentage, 0) / winCount;
    }
    if (lossCount > 0) {
      avgLoss =
        signals
          .filter((s) => s.pnl.pnlPercentage < 0)
          .reduce((acc, s) => acc + s.pnl.pnlPercentage, 0) / lossCount;
    }

    // Calculate Win/Loss Streaks
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let currentWinStreak = 0;
    let currentLossStreak = 0;

    for (const signal of signals) {
      if (signal.pnl.pnlPercentage > 0) {
        currentWinStreak++;
        currentLossStreak = 0;
        if (currentWinStreak > maxWinStreak) {
          maxWinStreak = currentWinStreak;
        }
      } else if (signal.pnl.pnlPercentage < 0) {
        currentLossStreak++;
        currentWinStreak = 0;
        if (currentLossStreak > maxLossStreak) {
          maxLossStreak = currentLossStreak;
        }
      }
    }

    // Calculate Expectancy
    let expectancy: number | null = null;
    if (winRate !== null && avgWin !== null && avgLoss !== null) {
      const lossRate = 100 - winRate;
      expectancy = (winRate / 100) * avgWin + (lossRate / 100) * avgLoss;
    }

    // Calculate average peak and fall PNL
    let avgPeakPnl: number | null = null;
    let avgFallPnl: number | null = null;
    if (signals.length > 0) {
      avgPeakPnl = signals.reduce((acc, s) => acc + (s.signal._peak?.pnlPercentage ?? 0), 0) / signals.length;
      avgFallPnl = signals.reduce((acc, s) => acc + (s.signal._fall?.pnlPercentage ?? 0), 0) / signals.length;
    }

    // Apply safe math checks
    if (isUnsafe(winRate)) winRate = null;
    if (isUnsafe(totalPnl)) totalPnl = null;
    if (isUnsafe(avgPnl)) avgPnl = null;
    if (isUnsafe(stdDev)) stdDev = null;
    if (isUnsafe(sharpeRatio)) sharpeRatio = null;
    if (isUnsafe(maxDrawdown)) maxDrawdown = null;
    if (isUnsafe(profitFactor)) profitFactor = null;
    if (isUnsafe(avgWin)) avgWin = null;
    if (isUnsafe(avgLoss)) avgLoss = null;
    if (isUnsafe(expectancy)) expectancy = null;
    if (isUnsafe(avgPeakPnl)) avgPeakPnl = null;
    if (isUnsafe(avgFallPnl)) avgFallPnl = null;

    return {
      symbol,
      totalPnl,
      sharpeRatio,
      maxDrawdown,
      totalTrades,
      winCount,
      lossCount,
      winRate,
      avgPnl,
      stdDev,
      profitFactor,
      avgWin,
      avgLoss,
      maxWinStreak,
      maxLossStreak,
      expectancy,
      avgPeakPnl,
      avgFallPnl,
    };
  }

  /**
   * Builds the full `HeatmapStatisticsModel` for this storage instance.
   *
   * Steps:
   * 1. Calls `calculateSymbolStats` for every tracked symbol.
   * 2. Sorts symbols by `sharpeRatio` descending — best performers first,
   *    symbols with `null` sharpeRatio placed at the end.
   * 3. Computes portfolio-wide aggregates:
   *    - `portfolioTotalPnl` — sum of all per-symbol `totalPnl` values (treats `null` as 0)
   *    - `portfolioTotalTrades` — sum of all per-symbol `totalTrades`
   *    - `portfolioSharpeRatio` — trade-count-weighted average of per-symbol sharpe ratios
   *
   * @returns Promise resolving to `HeatmapStatisticsModel` with per-symbol rows and
   *   portfolio-wide `portfolioTotalPnl`, `portfolioSharpeRatio`, `portfolioTotalTrades`
   */
  public async getData(): Promise<HeatmapStatisticsModel> {
    const symbols: IHeatmapRow[] = [];

    // Calculate per-symbol statistics
    for (const [symbol, signals] of this.symbolData.entries()) {
      const row = this.calculateSymbolStats(symbol, signals);
      symbols.push(row);
    }

    // Sort by Sharpe Ratio descending (best performers first, nulls last)
    symbols.sort((a, b) => {
      if (a.sharpeRatio === null && b.sharpeRatio === null) return 0;
      if (a.sharpeRatio === null) return 1;
      if (b.sharpeRatio === null) return -1;
      return b.sharpeRatio - a.sharpeRatio;
    });

    // Calculate portfolio-wide metrics
    const totalSymbols = symbols.length;
    let portfolioTotalPnl: number | null = null;
    let portfolioTotalTrades = 0;

    if (symbols.length > 0) {
      portfolioTotalPnl = symbols.reduce(
        (acc, s) => acc + (s.totalPnl || 0),
        0
      );
      portfolioTotalTrades = symbols.reduce((acc, s) => acc + s.totalTrades, 0);
    }

    // Calculate portfolio Sharpe Ratio (weighted by number of trades)
    let portfolioSharpeRatio: number | null = null;
    const validSharpes = symbols.filter((s) => s.sharpeRatio !== null);
    if (validSharpes.length > 0 && portfolioTotalTrades > 0) {
      const weightedSum = validSharpes.reduce(
        (acc, s) => acc + s.sharpeRatio! * s.totalTrades,
        0
      );
      portfolioSharpeRatio = weightedSum / portfolioTotalTrades;
    }

    // Calculate portfolio-wide weighted average peak/fall PNL
    let portfolioAvgPeakPnl: number | null = null;
    let portfolioAvgFallPnl: number | null = null;
    const validPeak = symbols.filter((s) => s.avgPeakPnl !== null);
    const validFall = symbols.filter((s) => s.avgFallPnl !== null);
    if (validPeak.length > 0 && portfolioTotalTrades > 0) {
      portfolioAvgPeakPnl = validPeak.reduce((acc, s) => acc + s.avgPeakPnl! * s.totalTrades, 0) / portfolioTotalTrades;
    }
    if (validFall.length > 0 && portfolioTotalTrades > 0) {
      portfolioAvgFallPnl = validFall.reduce((acc, s) => acc + s.avgFallPnl! * s.totalTrades, 0) / portfolioTotalTrades;
    }

    // Apply safe math
    if (isUnsafe(portfolioTotalPnl)) portfolioTotalPnl = null;
    if (isUnsafe(portfolioSharpeRatio)) portfolioSharpeRatio = null;
    if (isUnsafe(portfolioAvgPeakPnl)) portfolioAvgPeakPnl = null;
    if (isUnsafe(portfolioAvgFallPnl)) portfolioAvgFallPnl = null;

    return {
      symbols,
      totalSymbols,
      portfolioTotalPnl,
      portfolioSharpeRatio,
      portfolioTotalTrades,
      portfolioAvgPeakPnl,
      portfolioAvgFallPnl,
    };
  }

  /**
   * Renders a markdown heatmap report for this storage instance.
   *
   * Output structure (when data is available):
   * ```
   * # Portfolio Heatmap: {strategyName}
   *
   * **Total Symbols:** N | **Portfolio PNL:** X% | **Portfolio Sharpe:** Y | **Total Trades:** Z
   *
   * | col1 | col2 | ... |
   * | ---  | ---  | ... |
   * | ...  | ...  | ... |
   * ```
   * When no signals have been recorded, returns a minimal header with `*No data available*`.
   *
   * Only columns whose `isVisible()` returns `true` are included in the table.
   * Rows are ordered by `sharpeRatio` descending (same order as `getData()`).
   *
   * @param strategyName - Strategy name rendered in the `# Portfolio Heatmap:` heading
   * @param columns - Column definitions controlling which fields appear and how they are
   *   formatted; defaults to `COLUMN_CONFIG.heat_columns`
   * @returns Promise resolving to the full markdown string
   */
  public async getReport(
    strategyName: StrategyName,
    columns: Columns[] = COLUMN_CONFIG.heat_columns
  ): Promise<string> {
    const data = await this.getData();

    if (data.symbols.length === 0) {
      return [
        `# Portfolio Heatmap: ${strategyName}`,
        "",
        "*No data available*"
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
      data.symbols.map(async (row, index) =>
        Promise.all(visibleColumns.map((col) => col.format(row, index)))
      )
    );

    const tableData = [header, separator, ...rows];
    const table = tableData.map((row) => `| ${row.join(" | ")} |`).join("\n");

    return [
      `# Portfolio Heatmap: ${strategyName}`,
      "",
      `**Total Symbols:** ${data.totalSymbols} | **Portfolio PNL:** ${data.portfolioTotalPnl !== null ? str(data.portfolioTotalPnl, "%") : "N/A"} | **Portfolio Sharpe:** ${data.portfolioSharpeRatio !== null ? str(data.portfolioSharpeRatio) : "N/A"} | **Total Trades:** ${data.portfolioTotalTrades} | **Avg Peak PNL:** ${data.portfolioAvgPeakPnl !== null ? str(data.portfolioAvgPeakPnl, "%") : "N/A"} | **Avg Max Drawdown PNL:** ${data.portfolioAvgFallPnl !== null ? str(data.portfolioAvgFallPnl, "%") : "N/A"}`,
      "",
      table
    ].join("\n");
  }

  /**
   * Generates the markdown report and persists it via `MarkdownWriter.writeData`.
   *
   * The filename is built by `CREATE_FILE_NAME_FN`:
   * - Backtest: `{strategyName}_{exchangeName}_{frameName}_backtest-{timestamp}.md`
   * - Live:     `{strategyName}_{exchangeName}_live-{timestamp}.md`
   *
   * The timestamp comes from `getContextTimestamp()` — the backtest execution
   * context clock when inside a backtest, or the real clock aligned to the
   * nearest minute when running live.
   *
   * @param strategyName - Strategy name used in the report heading and filename
   * @param path - Directory to write the file into; defaults to `"./dump/heatmap"`
   * @param columns - Column definitions for table formatting;
   *   defaults to `COLUMN_CONFIG.heat_columns`
   */
  public async dump(
    strategyName: StrategyName,
    path = "./dump/heatmap",
    columns: Columns[] = COLUMN_CONFIG.heat_columns
  ): Promise<void> {
    const markdown = await this.getReport(strategyName, columns);
    const timestamp = getContextTimestamp();
    const filename = CREATE_FILE_NAME_FN(strategyName, this.exchangeName, this.frameName, timestamp);
    await MarkdownWriter.writeData("heat", markdown, {
      path,
      file: filename,
      symbol: "",
      strategyName: "",
      signalId: "",
      exchangeName: this.exchangeName,
      frameName: this.frameName
    });
  }
}

/**
 * Portfolio Heatmap Markdown Service.
 *
 * Subscribes to signalEmitter and aggregates statistics across all symbols per strategy.
 * Provides portfolio-wide metrics and per-symbol breakdowns.
 *
 * Features:
 * - Real-time aggregation of closed signals
 * - Per-symbol statistics (Total PNL, Sharpe Ratio, Max Drawdown, Trades)
 * - Portfolio-wide aggregated metrics per strategy
 * - Markdown table report generation
 * - Safe math (handles NaN/Infinity gracefully)
 * - Strategy-based navigation using memoized storage
 *
 * @example
 * ```typescript
 * const service = new HeatMarkdownService();
 *
 * // Service automatically tracks all closed signals per strategy
 * const stats = await service.getData("my-strategy");
 * console.log(`Portfolio Total PNL: ${stats.portfolioTotalPnl}%`);
 *
 * // Generate and save report
 * await service.dump("my-strategy", "./reports");
 * ```
 */
export class HeatMarkdownService {
  /** Logger service for debug output */
  private readonly loggerService = inject<TLoggerService>(TYPES.loggerService);

  /**
   * Memoized function to get or create HeatmapStorage for exchange, frame and backtest mode.
   * Each exchangeName + frameName + backtest mode combination gets its own isolated heatmap storage instance.
   */
  private getStorage = memoize<(exchangeName: ExchangeName, frameName: FrameName, backtest: boolean) => HeatmapStorage>(
    ([exchangeName, frameName, backtest]) => CREATE_KEY_FN(exchangeName, frameName, backtest),
    (exchangeName, frameName, backtest) => new HeatmapStorage(exchangeName, frameName, backtest)
  );

  /**
   * Subscribes to signal emitter to receive tick events.
   * Protected against multiple subscriptions.
   * Returns an unsubscribe function to stop receiving events.
   *
   * @example
   * ```typescript
   * const service = new HeatMarkdownService();
   * const unsubscribe = service.subscribe();
   * // ... later
   * unsubscribe();
   * ```
   */
  public subscribe = singleshot(() => {
    this.loggerService.log("heatMarkdownService init");
    const unsubscribe = signalEmitter.subscribe(this.tick);
    return () => {
      this.subscribe.clear();
      this.clear();
      unsubscribe();
    }
  });

  /**
   * Unsubscribes from signal emitter to stop receiving tick events.
   * Calls the unsubscribe function returned by subscribe().
   * If not subscribed, does nothing.
   *
   * @example
   * ```typescript
   * const service = new HeatMarkdownService();
   * service.subscribe();
   * // ... later
   * service.unsubscribe();
   * ```
   */
  public unsubscribe = async () => {
    this.loggerService.log("heatMarkdownService unsubscribe");
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };

  /**
   * Handles a single tick event emitted by `signalEmitter`.
   *
   * Filters out every action except `"closed"` — idle, scheduled, waiting,
   * opened, active, and cancelled ticks are silently ignored.
   * For closed signals, routes the payload to the appropriate `HeatmapStorage`
   * via `getStorage(exchangeName, frameName, backtest)` and calls `addSignal`.
   *
   * @param data - Union tick result from `signalEmitter`; only
   *   `IStrategyTickResultClosed` payloads are processed
   */
  private tick = async (data: IStrategyTickResult) => {
    this.loggerService.log("heatMarkdownService tick", {
      data,
    });

    if (data.action !== "closed") {
      return;
    }

    const storage = this.getStorage(data.exchangeName, data.frameName, data.backtest);
    storage.addSignal(data);
  };

  /**
   * Returns aggregated portfolio heatmap statistics for the given context.
   *
   * Delegates to the `HeatmapStorage` instance identified by
   * `(exchangeName, frameName, backtest)`. If no signals have been accumulated
   * yet for that combination, the returned `symbols` array will be empty and
   * portfolio-level fields will be `null` / `0`.
   *
   * @param exchangeName - Exchange identifier (e.g. `"binance"`)
   * @param frameName - Backtest frame identifier (e.g. `"1m-btc"`)
   * @param backtest - `true` for backtest mode, `false` for live mode
   * @returns Promise resolving to `HeatmapStatisticsModel` with per-symbol rows
   *   sorted by `sharpeRatio` descending and portfolio-wide aggregates
   * @throws {Error} If `subscribe()` has not been called before this method
   *
   * @example
   * ```typescript
   * const service = new HeatMarkdownService();
   * const stats = await service.getData("binance", "frame1", true);
   *
   * console.log(`Total symbols: ${stats.totalSymbols}`);
   * console.log(`Portfolio PNL: ${stats.portfolioTotalPnl}%`);
   *
   * stats.symbols.forEach(row => {
   *   console.log(`${row.symbol}: ${row.totalPnl}% (${row.totalTrades} trades)`);
   * });
   * ```
   */
  public getData = async (
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean
  ): Promise<HeatmapStatisticsModel> => {
    this.loggerService.log(HEATMAP_METHOD_NAME_GET_DATA, {
      exchangeName,
      frameName,
      backtest,
    });
    if (!this.subscribe.hasValue()) {
      throw new Error("HeatMarkdownService not initialized. Call subscribe() before getting data.");
    }
    const storage = this.getStorage(exchangeName, frameName, backtest);
    return storage.getData();
  };

  /**
   * Generates a markdown heatmap report for the given context.
   *
   * Delegates to `HeatmapStorage.getReport`. The resulting string includes a
   * portfolio summary line followed by a markdown table with one row per
   * symbol, ordered by `sharpeRatio` descending.
   *
   * @param strategyName - Strategy name rendered in the report heading
   * @param exchangeName - Exchange identifier (e.g. `"binance"`)
   * @param frameName - Backtest frame identifier (e.g. `"1m-btc"`)
   * @param backtest - `true` for backtest mode, `false` for live mode
   * @param columns - Column definitions controlling the table layout;
   *   defaults to `COLUMN_CONFIG.heat_columns`
   * @returns Promise resolving to the full markdown string
   * @throws {Error} If `subscribe()` has not been called before this method
   *
   * @example
   * ```typescript
   * const service = new HeatMarkdownService();
   * const markdown = await service.getReport("my-strategy", "binance", "frame1", true);
   * console.log(markdown);
   * // # Portfolio Heatmap: my-strategy
   * //
   * // **Total Symbols:** 5 | **Portfolio PNL:** +45.3% | **Portfolio Sharpe:** 1.85 | **Total Trades:** 120
   * //
   * // | Symbol | Total PNL | Sharpe | Max DD | Trades |
   * // | ---    | ---       | ---    | ---    | ---    |
   * // | BTCUSDT | +15.5%  | 2.10   | -2.5%  | 45     |
   * // | ETHUSDT | +12.3%  | 1.85   | -3.1%  | 38     |
   * ```
   */
  public getReport = async (
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
    columns: Columns[] = COLUMN_CONFIG.heat_columns
  ): Promise<string> => {
    this.loggerService.log(HEATMAP_METHOD_NAME_GET_REPORT, {
      strategyName,
      exchangeName,
      frameName,
      backtest,
    });
    if (!this.subscribe.hasValue()) {
      throw new Error("HeatMarkdownService not initialized. Call subscribe() before generating reports.");
    }
    const storage = this.getStorage(exchangeName, frameName, backtest);
    return storage.getReport(strategyName, columns);
  };

  /**
   * Generates the heatmap report and writes it to disk.
   *
   * Delegates to `HeatmapStorage.dump`. The filename follows the pattern:
   * - Backtest: `{strategyName}_{exchangeName}_{frameName}_backtest-{timestamp}.md`
   * - Live:     `{strategyName}_{exchangeName}_live-{timestamp}.md`
   *
   * @param strategyName - Strategy name used in the report heading and filename
   * @param exchangeName - Exchange identifier (e.g. `"binance"`)
   * @param frameName - Backtest frame identifier (e.g. `"1m-btc"`)
   * @param backtest - `true` for backtest mode, `false` for live mode
   * @param path - Directory to write the file into; defaults to `"./dump/heatmap"`
   * @param columns - Column definitions for table formatting;
   *   defaults to `COLUMN_CONFIG.heat_columns`
   * @throws {Error} If `subscribe()` has not been called before this method
   *
   * @example
   * ```typescript
   * const service = new HeatMarkdownService();
   *
   * // Save to default path
   * await service.dump("my-strategy", "binance", "frame1", true);
   *
   * // Save to custom path
   * await service.dump("my-strategy", "binance", "frame1", true, "./reports");
   * ```
   */
  public dump = async (
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
    path = "./dump/heatmap",
    columns: Columns[] = COLUMN_CONFIG.heat_columns
  ): Promise<void> => {
    this.loggerService.log(HEATMAP_METHOD_NAME_DUMP, {
      strategyName,
      exchangeName,
      frameName,
      backtest,
      path,
    });
    if (!this.subscribe.hasValue()) {
      throw new Error("HeatMarkdownService not initialized. Call subscribe() before dumping reports.");
    }
    const storage = this.getStorage(exchangeName, frameName, backtest);
    await storage.dump(strategyName, path, columns);
  };

  /**
   * Evicts memoized `HeatmapStorage` instances, releasing all accumulated signal data.
   *
   * - With `payload` — clears only the storage bucket identified by
   *   `(payload.exchangeName, payload.frameName, payload.backtest)`;
   *   subsequent calls to `getData` / `getReport` / `dump` for that combination
   *   will start from an empty state.
   * - Without `payload` — clears **all** storage buckets across every
   *   exchange / frame / mode combination.
   *
   * Also called internally by the unsubscribe closure returned from `subscribe()`.
   *
   * @param payload - Optional scope to restrict which bucket is cleared;
   *   omit to clear everything
   *
   * @example
   * ```typescript
   * // Clear one specific context
   * await service.clear({ exchangeName: "binance", frameName: "frame1", backtest: true });
   *
   * // Clear all contexts
   * await service.clear();
   * ```
   */
  public clear = async (payload?: { exchangeName: ExchangeName; frameName: FrameName; backtest: boolean }) => {
    this.loggerService.log(HEATMAP_METHOD_NAME_CLEAR, {
      payload,
    });
    if (payload) {
      const key = CREATE_KEY_FN(payload.exchangeName, payload.frameName, payload.backtest);
      this.getStorage.clear(key);
    } else {
      this.getStorage.clear();
    }
  };

}

export default HeatMarkdownService;

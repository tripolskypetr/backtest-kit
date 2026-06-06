import { MarkdownWriter } from "../../../classes/Writer";
import {
  IStrategyTickResult,
  IStrategyTickResultScheduled,
  IStrategyTickResultWaiting,
  IStrategyTickResultOpened,
  IStrategyTickResultActive,
  IStrategyTickResultClosed,
  IStrategyTickResultCancelled,
  StrategyName,
} from "../../../interfaces/Strategy.interface";
import { inject } from "../../../lib/core/di";
import LoggerService, { TLoggerService } from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { memoize, singleshot } from "functools-kit";
import { signalLiveEmitter } from "../../../config/emitters";
import { LiveStatisticsModel, TickEvent } from "../../../model/LiveStatistics.model";
import { ColumnModel } from "../../../model/Column.model";
import { COLUMN_CONFIG } from "../../../config/columns";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";
import { getContextTimestamp } from "../../../helpers/getContextTimestamp";
import { GLOBAL_CONFIG } from "../../../config/params";

/**
 * Type alias for column configuration used in live trading markdown reports.
 * 
 * Represents a column model specifically designed to format and display
 * real-time trading events in markdown tables.
 * 
 * @typeParam TickEvent - The live trading event data type containing
 *   signal information, timestamps, and trade details from active positions
 * 
 * @example
 * ```typescript
 * // Column to display event timestamp
 * const timestampColumn: Columns = {
 *   key: "timestamp",
 *   label: "Time",
 *   format: (event) => new Date(event.timestamp).toISOString(),
 *   isVisible: () => true
 * };
 * 
 * // Column to display event action type
 * const actionColumn: Columns = {
 *   key: "action",
 *   label: "Action",
 *   format: (event) => event.action,
 *   isVisible: () => true
 * };
 * ```
 * 
 * @see ColumnModel for the base interface
 * @see TickEvent for the event data structure
 */
export type Columns = ColumnModel<TickEvent>;

/**
 * Creates a unique key for memoizing ReportStorage instances.
 * Key format: "symbol:strategyName:exchangeName:frameName:backtest" or "symbol:strategyName:exchangeName:live"
 * @param symbol - Trading pair symbol
 * @param strategyName - Name of the strategy
 * @param exchangeName - Exchange name
 * @param frameName - Frame name
 * @param backtest - Whether running in backtest mode
 * @returns Unique string key for memoization
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
 * Creates a filename for markdown report based on memoization key components.
 * Filename format: "symbol_strategyName_exchangeName_frameName-timestamp.md"
 * @param symbol - Trading pair symbol
 * @param strategyName - Name of the strategy
 * @param exchangeName - Exchange name
 * @param frameName - Frame name
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Filename string
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

/** Minimum closed signals required to annualize Sharpe / yearly returns / Calmar. */
const MIN_SIGNALS_FOR_ANNUALIZATION = 10;
/** Minimum signals required for ANY ratio metric (Sharpe / Sortino / stdDev). Below this,
 *  sample size is too small to estimate variance meaningfully. */
const MIN_SIGNALS_FOR_RATIOS = 10;
/** Minimum calendar span (days) for trade-frequency extrapolation. */
const MIN_CALENDAR_SPAN_DAYS = 14;
/** Hard cap on tradesPerYear — prevents absurd extrapolation from short windows / clustered trades. */
const MAX_TRADES_PER_YEAR = 365;
/** Hard cap on |expectedYearlyReturns| percent. Compound interest on high avgPnl × frequency
 *  blows up to mathematically correct but business-unrealistic values. ±100% = 2x equity —
 *  anything above this we suspect is a noisy estimate, not a genuine edge. Above the cap → null. */
const MAX_EXPECTED_YEARLY_RETURNS = 100;
/** Hard cap on |calmarRatio|. Prevents explosion when equityMaxDrawdown is near zero. */
const MAX_CALMAR_RATIO = 1000;
/** Minimum stdDev required for Sharpe/Sortino. Identical-returns series produce
 *  float-artifact stdDev (~1e-17) that's > 0 but spuriously inflates sharpe to
 *  astronomical magnitudes (avgPnl / epsilon). */
const STDDEV_EPSILON = 1e-9;


/**
 * Storage class for accumulating all tick events per strategy.
 * Maintains a chronological list of all events (idle, opened, active, closed).
 */
class ReportStorage {
  /** Internal list of all tick events for this strategy */
  private _eventList: TickEvent[] = [];

  constructor(
    readonly symbol: string,
    readonly strategyName: StrategyName,
    readonly exchangeName: ExchangeName,
    readonly frameName: FrameName
  ) {}

  /**
   * Adds an idle event to the storage.
   * Replaces the last idle event only if there are no opened/active events after it.
   *
   * @param currentPrice - Current market price
   */
  public addIdleEvent(currentPrice: number) {
    const newEvent: TickEvent = {
      timestamp: getContextTimestamp(),
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
      this._eventList.unshift(newEvent);
      if (this._eventList.length > GLOBAL_CONFIG.CC_MAX_LIVE_MARKDOWN_ROWS) {
        this._eventList.pop();
      }
    }
  }

  /**
   * Adds an opened event to the storage.
   *
   * @param data - Opened tick result
   */
  public addOpenedEvent(data: IStrategyTickResultOpened) {
    this._eventList.unshift({
      timestamp: data.signal.pendingAt,
      action: "opened",
      symbol: data.signal.symbol,
      signalId: data.signal.id,
      position: data.signal.position,
      note: data.signal.note,
      currentPrice: data.signal.priceOpen,
      priceOpen: data.signal.priceOpen,
      priceTakeProfit: data.signal.priceTakeProfit,
      priceStopLoss: data.signal.priceStopLoss,
      originalPriceTakeProfit: data.signal.originalPriceTakeProfit,
      originalPriceStopLoss: data.signal.originalPriceStopLoss,
      partialExecuted: data.signal.partialExecuted,
      totalPartials: data.signal.totalPartials,
      pendingAt: data.signal.pendingAt,
      scheduledAt: data.signal.scheduledAt,
    });

    // Trim queue if exceeded GLOBAL_CONFIG.CC_MAX_LIVE_MARKDOWN_ROWS
    if (this._eventList.length > GLOBAL_CONFIG.CC_MAX_LIVE_MARKDOWN_ROWS) {
      this._eventList.pop();
    }
  }

  /**
   * Adds an active event to the storage.
   * Replaces the last active event with the same signalId.
   *
   * @param data - Active tick result
   */
  public addActiveEvent(data: IStrategyTickResultActive) {
    const newEvent: TickEvent = {
      timestamp: getContextTimestamp(),
      action: "active",
      symbol: data.signal.symbol,
      signalId: data.signal.id,
      position: data.signal.position,
      note: data.signal.note,
      currentPrice: data.currentPrice,
      priceOpen: data.signal.priceOpen,
      priceTakeProfit: data.signal.priceTakeProfit,
      priceStopLoss: data.signal.priceStopLoss,
      originalPriceTakeProfit: data.signal.originalPriceTakeProfit,
      originalPriceStopLoss: data.signal.originalPriceStopLoss,
      partialExecuted: data.signal.partialExecuted,
      totalPartials: data.signal.totalPartials,
      percentTp: data.percentTp,
      percentSl: data.percentSl,
      pnl: data.pnl.pnlPercentage,
      pnlCost: data.pnl.pnlCost,
      pnlEntries: data.pnl.pnlEntries,
      pendingAt: data.signal.pendingAt,
      scheduledAt: data.signal.scheduledAt,
    };

    // Find the last active event with the same signalId
    const lastActiveIndex = this._eventList.findLastIndex(
      (event) => event.action === "active" && event.signalId === data.signal.id
    );

    // Replace the last active event with the same signalId
    if (lastActiveIndex !== -1) {
      this._eventList[lastActiveIndex] = newEvent;
      return;
    }

    // If no previous active event found, add new event
    this._eventList.unshift(newEvent);

    // Trim queue if exceeded GLOBAL_CONFIG.CC_MAX_LIVE_MARKDOWN_ROWS
    if (this._eventList.length > GLOBAL_CONFIG.CC_MAX_LIVE_MARKDOWN_ROWS) {
      this._eventList.pop();
    }
  }

  /**
   * Adds a closed event to the storage.
   *
   * @param data - Closed tick result
   */
  public addClosedEvent(data: IStrategyTickResultClosed) {
    const durationMs = data.closeTimestamp - data.signal.pendingAt;
    const durationMin = Math.round(durationMs / 60000);

    const newEvent: TickEvent = {
      timestamp: data.closeTimestamp,
      action: "closed",
      symbol: data.signal.symbol,
      signalId: data.signal.id,
      position: data.signal.position,
      note: data.signal.note,
      currentPrice: data.currentPrice,
      priceOpen: data.signal.priceOpen,
      priceTakeProfit: data.signal.priceTakeProfit,
      priceStopLoss: data.signal.priceStopLoss,
      originalPriceTakeProfit: data.signal.originalPriceTakeProfit,
      originalPriceStopLoss: data.signal.originalPriceStopLoss,
      partialExecuted: data.signal.partialExecuted,
      totalPartials: data.signal.totalPartials,
      pnl: data.pnl.pnlPercentage,
      pnlCost: data.pnl.pnlCost,
      pnlEntries: data.pnl.pnlEntries,
      closeReason: data.closeReason,
      duration: durationMin,
      pendingAt: data.signal.pendingAt,
      scheduledAt: data.signal.scheduledAt,
      peakPnl: data.signal.peakProfit?.pnlPercentage,
      fallPnl: data.signal.maxDrawdown?.pnlPercentage,
    };

    this._eventList.unshift(newEvent);

    // Trim queue if exceeded GLOBAL_CONFIG.CC_MAX_LIVE_MARKDOWN_ROWS
    if (this._eventList.length > GLOBAL_CONFIG.CC_MAX_LIVE_MARKDOWN_ROWS) {
      this._eventList.pop();
    }
  }

  /**
   * Adds a scheduled event to the storage.
   *
   * @param data - Scheduled tick result
   */
  public addScheduledEvent(data: IStrategyTickResultScheduled) {
    this._eventList.unshift({
      timestamp: data.signal.scheduledAt,
      action: "scheduled",
      symbol: data.signal.symbol,
      signalId: data.signal.id,
      position: data.signal.position,
      note: data.signal.note,
      currentPrice: data.currentPrice,
      priceOpen: data.signal.priceOpen,
      priceTakeProfit: data.signal.priceTakeProfit,
      priceStopLoss: data.signal.priceStopLoss,
      originalPriceTakeProfit: data.signal.originalPriceTakeProfit,
      originalPriceStopLoss: data.signal.originalPriceStopLoss,
      partialExecuted: data.signal.partialExecuted,
      totalPartials: data.signal.totalPartials,
      scheduledAt: data.signal.scheduledAt,
    });

    // Trim queue if exceeded GLOBAL_CONFIG.CC_MAX_LIVE_MARKDOWN_ROWS
    if (this._eventList.length > GLOBAL_CONFIG.CC_MAX_LIVE_MARKDOWN_ROWS) {
      this._eventList.pop();
    }
  }

  /**
   * Adds a waiting event to the storage.
   * Replaces the last waiting event with the same signalId.
   *
   * @param data - Waiting tick result
   */
  public addWaitingEvent(data: IStrategyTickResultWaiting) {
    const newEvent: TickEvent = {
      timestamp: getContextTimestamp(),
      action: "waiting",
      symbol: data.signal.symbol,
      signalId: data.signal.id,
      position: data.signal.position,
      note: data.signal.note,
      currentPrice: data.currentPrice,
      priceOpen: data.signal.priceOpen,
      priceTakeProfit: data.signal.priceTakeProfit,
      priceStopLoss: data.signal.priceStopLoss,
      originalPriceTakeProfit: data.signal.originalPriceTakeProfit,
      originalPriceStopLoss: data.signal.originalPriceStopLoss,
      partialExecuted: data.signal.partialExecuted,
      totalPartials: data.signal.totalPartials,
      percentTp: data.percentTp,
      percentSl: data.percentSl,
      pnl: data.pnl.pnlPercentage,
      pnlCost: data.pnl.pnlCost,
      pnlEntries: data.pnl.pnlEntries,
      scheduledAt: data.signal.scheduledAt,
    };

    // Find the last waiting event with the same signalId
    const lastWaitingIndex = this._eventList.findLastIndex(
      (event) => event.action === "waiting" && event.signalId === data.signal.id
    );

    // Replace the last waiting event with the same signalId
    if (lastWaitingIndex !== -1) {
      this._eventList[lastWaitingIndex] = newEvent;
      return;
    }

    // If no previous waiting event found, add new event
    this._eventList.unshift(newEvent);

    // Trim queue if exceeded GLOBAL_CONFIG.CC_MAX_LIVE_MARKDOWN_ROWS
    if (this._eventList.length > GLOBAL_CONFIG.CC_MAX_LIVE_MARKDOWN_ROWS) {
      this._eventList.pop();
    }
  }

  /**
   * Adds a cancelled event to the storage.
   *
   * @param data - Cancelled tick result
   */
  public addCancelledEvent(data: IStrategyTickResultCancelled) {
    this._eventList.unshift({
      timestamp: data.closeTimestamp,
      action: "cancelled",
      symbol: data.signal.symbol,
      signalId: data.signal.id,
      position: data.signal.position,
      note: data.signal.note,
      currentPrice: data.currentPrice,
      priceOpen: data.signal.priceOpen,
      priceTakeProfit: data.signal.priceTakeProfit,
      priceStopLoss: data.signal.priceStopLoss,
      originalPriceTakeProfit: data.signal.originalPriceTakeProfit,
      originalPriceStopLoss: data.signal.originalPriceStopLoss,
      partialExecuted: data.signal.partialExecuted,
      totalPartials: data.signal.totalPartials,
      cancelReason: data.reason,
      scheduledAt: data.signal.scheduledAt,
    });

    // Trim queue if exceeded GLOBAL_CONFIG.CC_MAX_LIVE_MARKDOWN_ROWS
    if (this._eventList.length > GLOBAL_CONFIG.CC_MAX_LIVE_MARKDOWN_ROWS) {
      this._eventList.pop();
    }
  }

  /**
   * Calculates statistical data from live trading events (Controller).
   * Returns null for any unsafe numeric values (NaN, Infinity, etc).
   *
   * @returns Statistical data (empty object if no events)
   */
  public async getData(): Promise<LiveStatisticsModel> {
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
        avgPeakPnl: null,
        avgFallPnl: null,
        sortinoRatio: null,
        calmarRatio: null,
        recoveryFactor: null,
        expectancy: null,
        avgDuration: null,
        medianPnl: null,
        avgConsecutiveWinPnl: null,
        avgConsecutiveLossPnl: null,
        avgWinDuration: null,
        avgLossDuration: null,
      };
    }

    const closedEvents = this._eventList.filter((e) => e.action === "closed");

    // Valid closed set — single source of truth. Events must have numeric pnl AND valid
    // timestamps. Win/loss counts, returns, calendar span, equity curve — all derived
    // from this set so they cannot disagree.
    const validClosed = closedEvents.filter(
      (e) =>
        typeof e.pnl === "number" &&
        typeof e.timestamp === "number" &&
        e.timestamp > 0 &&
        typeof (e.pendingAt ?? e.timestamp) === "number"
    );
    const totalClosed = validClosed.length;
    const winCount = validClosed.filter((e) => (e.pnl as number) > 0).length;
    const lossCount = validClosed.filter((e) => (e.pnl as number) < 0).length;
    const returns = validClosed.map((e) => e.pnl as number);
    const avgPnl = returns.length > 0
      ? returns.reduce((sum, r) => sum + r, 0) / returns.length
      : 0;
    const totalPnl = returns.reduce((sum, r) => sum + r, 0);

    // Win rate excludes break-even trades from both numerator and denominator.
    const decisiveTrades = winCount + lossCount;
    const winRate = decisiveTrades > 0 ? (winCount / decisiveTrades) * 100 : 0;

    // Trade frequency from calendar span — gated by minimum span and sample size to
    // suppress absurd annualization on short / sparse runs. Span built from validClosed
    // so denominator (calendarSpanDays) and numerator (returns.length) come from the
    // same event set.
    let firstPendingAt = Infinity;
    let lastCloseAt = -Infinity;
    for (const e of validClosed) {
      const startAt = e.pendingAt ?? e.timestamp;
      if (startAt < firstPendingAt) firstPendingAt = startAt;
      if (e.timestamp > lastCloseAt) lastCloseAt = e.timestamp;
    }
    const calendarSpanDays = validClosed.length > 0
      ? (lastCloseAt - firstPendingAt) / (1000 * 60 * 60 * 24)
      : 0;
    // tradesPerYear uses the RAW observed frequency — no clipping. Clipping would
    // silently understate Sharpe / Calmar / expectedYearlyReturns. Instead, if the
    // raw frequency exceeds MAX_TRADES_PER_YEAR we treat the sample as too clustered
    // for reliable annualization and surface every annualized metric as null.
    const rawTradesPerYear = returns.length >= MIN_SIGNALS_FOR_ANNUALIZATION &&
      calendarSpanDays >= MIN_CALENDAR_SPAN_DAYS
      ? (returns.length / calendarSpanDays) * 365
      : 0;
    const canAnnualize =
      rawTradesPerYear > 0 && rawTradesPerYear <= MAX_TRADES_PER_YEAR;
    const tradesPerYear = canAnnualize ? rawTradesPerYear : 0;

    // Per-trade Sharpe Ratio (risk-free rate = 0). Sample stddev (N-1).
    // Per-trade ratios are gated by MIN_SIGNALS_FOR_RATIOS — below that, variance estimates
    // are too noisy to publish (high chance of spurious ±Sharpe).
    const canComputeRatios = returns.length >= MIN_SIGNALS_FOR_RATIOS;
    const stdDev = canComputeRatios
      ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgPnl, 2), 0) / (returns.length - 1))
      : 0;
    // STDDEV_EPSILON guard — protects against float-artifact stdDev from identical
    // returns producing spuriously astronomical sharpe.
    const sharpeRatio: number | null = canComputeRatios && stdDev > STDDEV_EPSILON
      ? avgPnl / stdDev
      : null;
    // Annualize only when gate passes; otherwise null.
    const annualizedSharpeRatio: number | null = canAnnualize && sharpeRatio !== null
      ? sharpeRatio * Math.sqrt(tradesPerYear)
      : null;

    // Certainty Ratio: null (not zero) when there are no losing trades — a flawless
    // strategy has undefined Certainty Ratio, not "worst case zero". Computed on
    // validClosed for consistency with other ratios.
    // Gated below MIN_SIGNALS_FOR_RATIOS — same sample-size gate as Sharpe/Sortino,
    // so the report doesn't surface certainty on a handful of trades while
    // withholding the rest.
    let certaintyRatio: number | null = null;
    let expectancy: number | null = null;
    if (canComputeRatios && totalClosed > 0) {
      const wins = validClosed.filter((e) => (e.pnl as number) > 0);
      const losses = validClosed.filter((e) => (e.pnl as number) < 0);
      const avgWin = wins.length > 0
        ? wins.reduce((sum, e) => sum + (e.pnl as number), 0) / wins.length
        : 0;
      const avgLoss = losses.length > 0
        ? losses.reduce((sum, e) => sum + (e.pnl as number), 0) / losses.length
        : 0;
      // STDDEV_EPSILON guard on |avgLoss| protects against float-artifact
      // losses producing spurious astronomical certaintyRatio.
      certaintyRatio = Math.abs(avgLoss) > STDDEV_EPSILON && avgLoss < 0
        ? avgWin / Math.abs(avgLoss)
        : null;
      // Per-trade Expectancy: winProb*avgWin + lossProb*avgLoss. Break-even
      // trades contribute 0 (excluded from both probabilities).
      expectancy = (wins.length / totalClosed) * avgWin + (losses.length / totalClosed) * avgLoss;
    }

    // Median pnl — robust to outliers; reveals skew when avgPnl is dragged
    // by a whale trade. Sort a copy (do not mutate returns).
    let medianPnl: number | null = null;
    if (returns.length > 0) {
      const sortedReturns = returns.slice().sort((a, b) => a - b);
      const mid = sortedReturns.length >> 1;
      medianPnl = sortedReturns.length % 2 === 0
        ? (sortedReturns[mid - 1] + sortedReturns[mid]) / 2
        : sortedReturns[mid];
    }

    // Trade duration metrics in minutes (synchronized with strategy
    // `minuteEstimatedTime`). Source: e.timestamp (close) - (e.pendingAt ?? e.timestamp).
    // validClosed already guarantees e.timestamp > 0; if pendingAt is missing the
    // event contributes a 0-minute duration, matching the validation fallback.
    let avgDuration: number | null = null;
    let avgWinDuration: number | null = null;
    let avgLossDuration: number | null = null;
    if (totalClosed > 0) {
      const durations: number[] = [];
      const winDurations: number[] = [];
      const lossDurations: number[] = [];
      for (const e of validClosed) {
        const closeTs = e.timestamp;
        const openTs = e.pendingAt ?? e.timestamp;
        const minutes = (closeTs - openTs) / 60_000;
        durations.push(minutes);
        const pnl = e.pnl as number;
        if (pnl > 0) winDurations.push(minutes);
        else if (pnl < 0) lossDurations.push(minutes);
      }
      avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      if (winDurations.length > 0) {
        avgWinDuration = winDurations.reduce((a, b) => a + b, 0) / winDurations.length;
      }
      if (lossDurations.length > 0) {
        avgLossDuration = lossDurations.reduce((a, b) => a + b, 0) / lossDurations.length;
      }
    }

    // Consecutive streak averages: sum the per-streak pnl, then mean across
    // streaks. validClosed is newest-first (events unshifted), so iterate in
    // reverse for chronological streaks. Break-even (pnl=0) closes both runs.
    let avgConsecutiveWinPnl: number | null = null;
    let avgConsecutiveLossPnl: number | null = null;
    {
      const winStreakSums: number[] = [];
      const lossStreakSums: number[] = [];
      let curWin = 0;
      let curLoss = 0;
      let curWinSum = 0;
      let curLossSum = 0;
      for (let i = validClosed.length - 1; i >= 0; i--) {
        const pnl = validClosed[i].pnl as number;
        if (pnl > 0) {
          if (curLoss > 0) {
            lossStreakSums.push(curLossSum);
            curLoss = 0;
            curLossSum = 0;
          }
          curWin++;
          curWinSum += pnl;
        } else if (pnl < 0) {
          if (curWin > 0) {
            winStreakSums.push(curWinSum);
            curWin = 0;
            curWinSum = 0;
          }
          curLoss++;
          curLossSum += pnl;
        } else {
          if (curWin > 0) {
            winStreakSums.push(curWinSum);
            curWin = 0;
            curWinSum = 0;
          }
          if (curLoss > 0) {
            lossStreakSums.push(curLossSum);
            curLoss = 0;
            curLossSum = 0;
          }
        }
      }
      if (curWin > 0) winStreakSums.push(curWinSum);
      if (curLoss > 0) lossStreakSums.push(curLossSum);
      if (winStreakSums.length > 0) {
        avgConsecutiveWinPnl =
          winStreakSums.reduce((a, b) => a + b, 0) / winStreakSums.length;
      }
      if (lossStreakSums.length > 0) {
        avgConsecutiveLossPnl =
          lossStreakSums.reduce((a, b) => a + b, 0) / lossStreakSums.length;
      }
    }

    // Average only over signals that have the value — do not dilute the mean with zeros.
    // Use validClosed to keep all metric denominators consistent.
    const peakValues = validClosed
      .map((e) => e.peakPnl)
      .filter((v): v is number => typeof v === "number");
    const fallValues = validClosed
      .map((e) => e.fallPnl)
      .filter((v): v is number => typeof v === "number");
    const avgPeakPnl: number | null = peakValues.length > 0
      ? peakValues.reduce((sum, v) => sum + v, 0) / peakValues.length
      : null;
    const avgFallPnl: number | null = fallValues.length > 0
      ? fallValues.reduce((sum, v) => sum + v, 0) / fallValues.length
      : null;

    // Sortino (canonical, Sortino 1991): (avgPnl - MAR) / downside deviation, where
    // downsideDev = √( Σ min(0, r - MAR)² / N_total ). We use MAR = 0 (risk-free target),
    // so the numerator reduces to avgPnl and the squared term to r² for r < 0.
    // Dividing by N_total (not N_negative) properly penalises strategies with frequent
    // losses; the "modified" form (N_negative) hides frequency risk in catastrophic-tail
    // strategies.
    const sortinoRatio: number | null = (() => {
      if (!canComputeRatios) return null;
      const negativeReturns = returns.filter((r) => r < 0);
      if (negativeReturns.length === 0) return null;
      const downsideVariance = negativeReturns.reduce((sum, r) => sum + r * r, 0) / returns.length;
      const downsideDeviation = Math.sqrt(downsideVariance);
      // Same epsilon guard as Sharpe — protects against float-artifact downsideDev.
      return downsideDeviation > STDDEV_EPSILON ? avgPnl / downsideDeviation : null;
    })();

    // Equity-curve max drawdown via compounded equity (multiplicative). Returns are per-trade
    // on cost basis — compounding assumes equal capital allocation per trade ("as-if 100%").
    // If equity ≤ 0 (leveraged short with r < -100%) — account blown, fix DD at 100%.
    // Built from validClosed (newest-first), iterated reverse for chronological order.
    //
    // MARK-TO-MARKET DD: each trade's worst intra-trade excursion (fallPnl, the `_fall`
    // snapshot, ≤ 0) is applied as a trough BEFORE booking the realized close. Without it
    // the curve only steps at close, so a trade that dipped to -18% and recovered to +2%
    // would register zero drawdown — understating DD and inflating Calmar/Recovery.
    // Walk the equity curve in chronological close order. Reverse-storage
    // iteration (newest-first storage → reverse) normally yields chronological
    // order for live ingest, but explicitly sorting by event.timestamp removes
    // the dependency on insertion-order matching close-order. This matters
    // under crash recovery (events reloaded from disk in arbitrary order) and
    // when ingest latency reorders closed events relative to wall-clock time.
    const chronological: { r: number; fall: number | null }[] = validClosed
      .map((e) => ({
        r: e.pnl as number,
        fall: typeof e.fallPnl === "number" ? e.fallPnl : null,
        ts: e.timestamp,
      }))
      .sort((a, b) => a.ts - b.ts)
      .map(({ r, fall }) => ({ r, fall }));
    let equity = 1;
    let peak = 1;
    let equityMaxDrawdown = 0;
    let blown = false;
    for (const { r, fall } of chronological) {
      // Intra-trade trough — mark-to-market low while the position was open.
      if (fall !== null && fall < 0) {
        const trough = equity * (1 + fall / 100);
        if (trough <= 0) {
          equityMaxDrawdown = 100;
          blown = true;
          break;
        }
        const troughDd = (peak - trough) / peak * 100;
        if (troughDd > equityMaxDrawdown) equityMaxDrawdown = troughDd;
      }
      // Realized close.
      equity *= 1 + r / 100;
      if (equity <= 0) {
        equityMaxDrawdown = 100;
        blown = true;
        break;
      }
      if (equity > peak) peak = equity;
      const dd = (peak - equity) / peak * 100;
      if (dd > equityMaxDrawdown) equityMaxDrawdown = dd;
    }
    const equityFinal = blown ? 0 : equity;

    // Compounded yearly return via geometric mean of equity curve:
    // equityFinal^(tradesPerYear / N) - 1 — accounts for volatility drag.
    // If account is blown, full loss. If raw value exceeds MAX_EXPECTED_YEARLY_RETURNS,
    // return null rather than showing the cap — capped numbers mislead users.
    const expectedYearlyReturns: number | null = canAnnualize
      ? blown
        ? -100
        : (() => {
            const raw = (Math.pow(equityFinal, tradesPerYear / returns.length) - 1) * 100;
            return Math.abs(raw) > MAX_EXPECTED_YEARLY_RETURNS ? null : raw;
          })()
      : null;

    // Calmar — cap |value| at MAX_CALMAR_RATIO to prevent explosion when DD is near zero.
    const calmarRatio: number | null = equityMaxDrawdown > 0 && expectedYearlyReturns !== null
      ? Math.max(-MAX_CALMAR_RATIO, Math.min(MAX_CALMAR_RATIO, expectedYearlyReturns / equityMaxDrawdown))
      : null;
    // Recovery Factor: numerator must be the compounded total return, not arithmetic totalPnl —
    // denominator is from the compounded equity curve, so mixing units inflates Recovery.
    // Null below MIN_SIGNALS_FOR_RATIOS — same sample-size gate as the other ratios,
    // so a 3-trade run doesn't surface a Recovery Factor while Sharpe/Calmar are N/A.
    // Null when account is blown.
    // Same MAX_CALMAR_RATIO clamp as Calmar — both are compounded-profit/DD ratios
    // and explode the same way when DD is near zero.
    const recoveryFactor: number | null = !canComputeRatios || blown || equityMaxDrawdown <= 0
      ? null
      : Math.max(
          -MAX_CALMAR_RATIO,
          Math.min(MAX_CALMAR_RATIO, ((equityFinal - 1) * 100) / equityMaxDrawdown),
        );

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
      avgPeakPnl: isUnsafe(avgPeakPnl) ? null : avgPeakPnl,
      avgFallPnl: isUnsafe(avgFallPnl) ? null : avgFallPnl,
      sortinoRatio: isUnsafe(sortinoRatio) ? null : sortinoRatio,
      calmarRatio: isUnsafe(calmarRatio) ? null : calmarRatio,
      recoveryFactor: isUnsafe(recoveryFactor) ? null : recoveryFactor,
      expectancy: isUnsafe(expectancy) ? null : expectancy,
      avgDuration: isUnsafe(avgDuration) ? null : avgDuration,
      medianPnl: isUnsafe(medianPnl) ? null : medianPnl,
      avgConsecutiveWinPnl: isUnsafe(avgConsecutiveWinPnl) ? null : avgConsecutiveWinPnl,
      avgConsecutiveLossPnl: isUnsafe(avgConsecutiveLossPnl) ? null : avgConsecutiveLossPnl,
      avgWinDuration: isUnsafe(avgWinDuration) ? null : avgWinDuration,
      avgLossDuration: isUnsafe(avgLossDuration) ? null : avgLossDuration,
    };
  }

  /**
   * Generates markdown report with all tick events for a strategy (View).
   *
   * @param strategyName - Strategy name
   * @param columns - Column configuration for formatting the table
   * @returns Markdown formatted report with all events
   */
  public async getReport(
    strategyName: StrategyName,
    columns: Columns[] = COLUMN_CONFIG.live_columns
  ): Promise<string> {
    const stats = await this.getData();

    if (stats.totalEvents === 0) {
      return [
        `# Live Trading Report: ${strategyName}`,
        "",
        "No events recorded yet."
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
      `**Standard Deviation Per Trade:** ${stats.stdDev === null ? "N/A" : `${stats.stdDev.toFixed(3)}% (lower is better)`}`,
      `**Sharpe Ratio:** ${stats.sharpeRatio === null ? "N/A" : `${stats.sharpeRatio.toFixed(3)} (higher is better)`}`,
      `**Annualized Sharpe Ratio:** ${stats.annualizedSharpeRatio === null ? "N/A" : `${stats.annualizedSharpeRatio.toFixed(3)} (higher is better)`}`,
      `**Certainty Ratio:** ${stats.certaintyRatio === null ? "N/A" : `${stats.certaintyRatio.toFixed(3)} (higher is better)`}`,
      `**Expected Yearly Returns:** ${stats.expectedYearlyReturns === null ? "N/A" : `${stats.expectedYearlyReturns > 0 ? "+" : ""}${stats.expectedYearlyReturns.toFixed(2)}% (higher is better)`}`,
      `**Avg Peak PNL:** ${stats.avgPeakPnl === null ? "N/A" : `${stats.avgPeakPnl > 0 ? "+" : ""}${stats.avgPeakPnl.toFixed(2)}% (higher is better)`}`,
      `**Avg Max Drawdown PNL:** ${stats.avgFallPnl === null ? "N/A" : `${stats.avgFallPnl.toFixed(2)}% (closer to 0 is better)`}`,
      `**Sortino Ratio:** ${stats.sortinoRatio === null ? "N/A" : `${stats.sortinoRatio.toFixed(3)} (higher is better)`}`,
      `**Calmar Ratio:** ${stats.calmarRatio === null ? "N/A" : `${stats.calmarRatio.toFixed(3)} (higher is better)`}`,
      `**Recovery Factor:** ${stats.recoveryFactor === null ? "N/A" : `${stats.recoveryFactor.toFixed(3)} (higher is better)`}`,
      `**Expectancy:** ${stats.expectancy === null ? "N/A" : `${stats.expectancy > 0 ? "+" : ""}${stats.expectancy.toFixed(3)}% (higher is better)`}`,
      `**Median PNL:** ${stats.medianPnl === null ? "N/A" : `${stats.medianPnl > 0 ? "+" : ""}${stats.medianPnl.toFixed(3)}% (closer to avgPnl = symmetric distribution)`}`,
      `**Avg Duration:** ${stats.avgDuration === null ? "N/A" : `${stats.avgDuration.toFixed(1)} min`}`,
      `**Avg Win Duration:** ${stats.avgWinDuration === null ? "N/A" : `${stats.avgWinDuration.toFixed(1)} min`}`,
      `**Avg Loss Duration:** ${stats.avgLossDuration === null ? "N/A" : `${stats.avgLossDuration.toFixed(1)} min`}`,
      `**Avg Consecutive Win PNL:** ${stats.avgConsecutiveWinPnl === null ? "N/A" : `${stats.avgConsecutiveWinPnl > 0 ? "+" : ""}${stats.avgConsecutiveWinPnl.toFixed(3)}% (higher is better)`}`,
      `**Avg Consecutive Loss PNL:** ${stats.avgConsecutiveLossPnl === null ? "N/A" : `${stats.avgConsecutiveLossPnl.toFixed(3)}% (closer to 0 is better)`}`,
      "",
      `*Win Rate: reliable above 200+ signals; below 30 signals a single streak can shift it by 10-20%.*`,
      `*Sharpe Ratio: below 1.0 is poor, 1.0-2.0 is acceptable, above 2.0 is strong. Requires 30+ signals.*`,
      `*Annualized Sharpe Ratio: per-trade Sharpe × √tradesPerYear; tradesPerYear = signals × 365 / calendarSpanDays. N/A unless ≥${MIN_SIGNALS_FOR_ANNUALIZATION} signals and span ≥${MIN_CALENDAR_SPAN_DAYS} days. Assumes returns are iid — autocorrelated strategies are overstated.*`,
      `*Sortino Ratio: below 1.0 is poor, 1.0-2.0 is acceptable, above 2.0 is strong. Requires 30+ signals. N/A when no losing trades — Sortino is mathematically undefined (infinite) and we cannot distinguish "truly flawless" from "lucky streak so far".*`,
      `*Certainty Ratio: below 1.0 means average loss exceeds average win. Above 1.5 is considered good.*`,
      `*Expected Yearly Returns: compounded geometric return from the equity curve, annualized by tradesPerYear. Same gating as Annualized Sharpe. Capped at ±${MAX_EXPECTED_YEARLY_RETURNS}% — values above the cap return N/A.*`,
      `*Calmar Ratio: below 0.5 is poor, 0.5-1.0 is acceptable, above 1.0 is strong. Denominator is the mark-to-market max drawdown (see below). Capped at ±${MAX_CALMAR_RATIO}.*`,
      `*Recovery Factor: below 1.0 means total profit does not cover max drawdown. Above 3.0 is considered good. Uses compounded total return as numerator and the mark-to-market max drawdown as denominator.*`,
      `*Max Drawdown: mark-to-market — the compounded equity curve applies each trade's worst intra-trade excursion (the lowest unrealized point while the position was open) before booking its realized close, so deep round-trip dips count. It is NOT realized-only (close-to-close); a realized-only curve would understate drawdown and inflate Calmar/Recovery.*`,
      `*Expectancy: per-trade expected value (winProb × avgWin + lossProb × avgLoss). Positive = profitable on average per trade. Break-even trades contribute 0.*`,
      `*All metrics require 100+ signals to be statistically reliable. Annualized metrics assume the observed trading frequency and market conditions persist year-round.*`,
      `*IMPORTANT: Equity curve, Expected Yearly Returns, Calmar, Recovery and Max Drawdown all assume **100% capital allocation per position** (no portfolio fraction). These metrics ignore the position-sizing subsystem (PositionSize / Kelly / ATR): pnlPercentage is a return on the position's own invested capital, never scaled by account balance. With DCA (commitAverageBuy) the cost basis is the sum of all entries and the entry price is dollar-cost-weighted, so per-trade % is measured against the averaged position, not a fixed stake. If your strategy risks X% of capital per trade, the realized portfolio return / drawdown will be roughly X/100 of the reported figures — these metrics represent a theoretical upper bound under full allocation.*`,
      `*Negative values for Sharpe / Sortino / Calmar / Recovery / Expected Yearly Returns indicate a losing strategy (avgPnl < 0 or totalPnl < 0). "Higher is better" still applies — closer to zero is less bad, positive is profitable.*`,
    ].join("\n");
  }

  /**
   * Saves strategy report to disk.
   *
   * @param strategyName - Strategy name
   * @param path - Directory path to save report (default: "./dump/live")
   * @param columns - Column configuration for formatting the table
   */
  public async dump(
    strategyName: StrategyName,
    path = "./dump/live",
    columns: Columns[] = COLUMN_CONFIG.live_columns
  ): Promise<void> {
    const markdown = await this.getReport(strategyName, columns);
    const timestamp = getContextTimestamp();
    const filename = CREATE_FILE_NAME_FN(this.symbol, strategyName, this.exchangeName, this.frameName, timestamp);
    await MarkdownWriter.writeData("live", markdown, {
      path,
      signalId: "",
      file: filename,
      symbol: this.symbol,
      strategyName: this.strategyName,
      exchangeName: this.exchangeName,
      frameName: this.frameName
    });
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
  private readonly loggerService = inject<TLoggerService>(TYPES.loggerService);

  /**
   * Memoized function to get or create ReportStorage for a symbol-strategy-exchange-frame-backtest combination.
   * Each combination gets its own isolated storage instance.
   */
  private getStorage = memoize<(symbol: string, strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean) => ReportStorage>(
    ([symbol, strategyName, exchangeName, frameName, backtest]) => CREATE_KEY_FN(symbol, strategyName, exchangeName, frameName, backtest),
    (symbol, strategyName, exchangeName, frameName) => new ReportStorage(symbol, strategyName, exchangeName, frameName)
  );

  /**
   * Subscribes to live signal emitter to receive tick events.
   * Protected against multiple subscriptions.
   * Returns an unsubscribe function to stop receiving events.
   *
   * @example
   * ```typescript
   * const service = new LiveMarkdownService();
   * const unsubscribe = service.subscribe();
   * // ... later
   * unsubscribe();
   * ```
   */
  public subscribe = singleshot(() => {
    this.loggerService.log("liveMarkdownService init");
    const unsubscribe = signalLiveEmitter.subscribe(this.tick);
    return () => {
      this.subscribe.clear();
      this.clear();
      unsubscribe();
    }
  });

  /**
   * Unsubscribes from live signal emitter to stop receiving tick events.
   * Calls the unsubscribe function returned by subscribe().
   * If not subscribed, does nothing.
   *
   * @example
   * ```typescript
   * const service = new LiveMarkdownService();
   * service.subscribe();
   * // ... later
   * service.unsubscribe();
   * ```
   */
  public unsubscribe = async () => {
    this.loggerService.log("liveMarkdownService unsubscribe");
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };

  /**
   * Processes tick events and accumulates all event types.
   * Should be called from IStrategyCallbacks.onTick.
   *
   * Processes all event types: idle, opened, active, closed.
   *
   * @param data - Tick result from strategy execution with frameName wrapper
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

    const storage = this.getStorage(data.symbol, data.strategyName, data.exchangeName, data.frameName, false);

    if (data.action === "idle") {
      storage.addIdleEvent(data.currentPrice);
    } else if (data.action === "scheduled") {
      storage.addScheduledEvent(data);
    } else if (data.action === "waiting") {
      storage.addWaitingEvent(data);
    } else if (data.action === "opened") {
      storage.addOpenedEvent(data);
    } else if (data.action === "active") {
      storage.addActiveEvent(data);
    } else if (data.action === "closed") {
      storage.addClosedEvent(data);
    } else if (data.action === "cancelled") {
      storage.addCancelledEvent(data);
    }
  };

  /**
   * Gets statistical data from all live trading events for a symbol-strategy pair.
   * Delegates to ReportStorage.getData().
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to get data for
   * @param exchangeName - Exchange name
   * @param frameName - Frame name
   * @param backtest - True if backtest mode, false if live mode
   * @returns Statistical data object with all metrics
   *
   * @example
   * ```typescript
   * const service = new LiveMarkdownService();
   * const stats = await service.getData("BTCUSDT", "my-strategy", "binance", "1h", false);
   * console.log(stats.sharpeRatio, stats.winRate);
   * ```
   */
  public getData = async (symbol: string, strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean): Promise<LiveStatisticsModel> => {
    this.loggerService.log("liveMarkdownService getData", {
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
    });
    if (!this.subscribe.hasValue()) {
      throw new Error("LiveMarkdownService not initialized. Call subscribe() before getting data.");
    }
    const storage = this.getStorage(symbol, strategyName, exchangeName, frameName, backtest);
    return storage.getData();
  };

  /**
   * Generates markdown report with all events for a symbol-strategy pair.
   * Delegates to ReportStorage.getReport().
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to generate report for
   * @param exchangeName - Exchange name
   * @param frameName - Frame name
   * @param backtest - True if backtest mode, false if live mode
   * @param columns - Column configuration for formatting the table
   * @returns Markdown formatted report string with table of all events
   *
   * @example
   * ```typescript
   * const service = new LiveMarkdownService();
   * const markdown = await service.getReport("BTCUSDT", "my-strategy", "binance", "1h", false);
   * console.log(markdown);
   * ```
   */
  public getReport = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
    columns: Columns[] = COLUMN_CONFIG.live_columns
  ): Promise<string> => {
    this.loggerService.log("liveMarkdownService getReport", {
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
    });
    if (!this.subscribe.hasValue()) {
      throw new Error("LiveMarkdownService not initialized. Call subscribe() before generating reports.");
    }
    const storage = this.getStorage(symbol, strategyName, exchangeName, frameName, backtest);
    return storage.getReport(strategyName, columns);
  };

  /**
   * Saves symbol-strategy report to disk.
   * Creates directory if it doesn't exist.
   * Delegates to ReportStorage.dump().
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Strategy name to save report for
   * @param exchangeName - Exchange name
   * @param frameName - Frame name
   * @param backtest - True if backtest mode, false if live mode
   * @param path - Directory path to save report (default: "./dump/live")
   * @param columns - Column configuration for formatting the table
   *
   * @example
   * ```typescript
   * const service = new LiveMarkdownService();
   *
   * // Save to default path: ./dump/live/my-strategy.md
   * await service.dump("BTCUSDT", "my-strategy", "binance", "1h", false);
   *
   * // Save to custom path: ./custom/path/my-strategy.md
   * await service.dump("BTCUSDT", "my-strategy", "binance", "1h", false, "./custom/path");
   * ```
   */
  public dump = async (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    backtest: boolean,
    path = "./dump/live",
    columns: Columns[] = COLUMN_CONFIG.live_columns
  ): Promise<void> => {
    this.loggerService.log("liveMarkdownService dump", {
      symbol,
      strategyName,
      exchangeName,
      frameName,
      backtest,
      path,
    });
    if (!this.subscribe.hasValue()) {
      throw new Error("LiveMarkdownService not initialized. Call subscribe() before dumping reports.");
    }
    const storage = this.getStorage(symbol, strategyName, exchangeName, frameName, backtest);
    await storage.dump(strategyName, path, columns);
  };

  /**
   * Clears accumulated event data from storage.
   * If payload is provided, clears only that specific symbol-strategy-exchange-frame-backtest combination's data.
   * If nothing is provided, clears all data.
   *
   * @param payload - Optional payload with symbol, strategyName, exchangeName, frameName, backtest
   *
   * @example
   * ```typescript
   * const service = new LiveMarkdownService();
   *
   * // Clear specific combination
   * await service.clear({ symbol: "BTCUSDT", strategyName: "my-strategy", exchangeName: "binance", frameName: "1h", backtest: false });
   *
   * // Clear all data
   * await service.clear();
   * ```
   */
  public clear = async (payload?: { symbol: string; strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName; backtest: boolean }) => {
    this.loggerService.log("liveMarkdownService clear", {
      payload,
    });
    if (payload) {
      const key = CREATE_KEY_FN(payload.symbol, payload.strategyName, payload.exchangeName, payload.frameName, payload.backtest);
      this.getStorage.clear(key);
    } else {
      this.getStorage.clear();
    }
  };

}

export default LiveMarkdownService;

import { inject } from "../../../lib/core/di";
import LoggerService, { TLoggerService } from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { singleshot, LimitedMap } from "functools-kit";
import { riskSubject } from "../../../config/emitters";
import { ReportWriter } from "../../../classes/Writer";
import { RiskEvent } from "../../../model/RiskStatistics.model";
import { GLOBAL_CONFIG } from "../../../config/params";

const RISK_REPORT_METHOD_NAME_SUBSCRIBE = "RiskReportService.subscribe";
const RISK_REPORT_METHOD_NAME_UNSUBSCRIBE = "RiskReportService.unsubscribe";
const RISK_REPORT_METHOD_NAME_TICK = "RiskReportService.tickRejection";

/**
 * How many execution identities the write-throttle remembers
 * (symbol:strategy:exchange:frame -> last written event timestamp).
 * One entry per identity being throttled; the oldest entry is evicted first
 * (FIFO). An evicted identity simply writes its next rejection once more —
 * never loses data, only loses the throttle memory.
 */
const RISK_THROTTLE_MAP_LIMIT = 500;

/**
 * Service for logging risk rejection events to SQLite database.
 *
 * Captures all signal rejection events from the risk management system
 * and stores them in the Report database for risk analysis and auditing.
 *
 * Features:
 * - Listens to risk rejection events via riskSubject
 * - Logs all rejected signals with reason and pending signal details
 * - Stores events in ReportWriter.writeData() for risk tracking
 * - Protected against multiple subscriptions using singleshot
 *
 * @example
 * ```typescript
 * import { RiskReportService } from "backtest-kit";
 *
 * const reportService = new RiskReportService();
 *
 * // Subscribe to risk rejection events
 * const unsubscribe = reportService.subscribe();
 *
 * // Run strategy with risk management...
 * // Rejection events are automatically logged
 *
 * // Later: unsubscribe
 * await reportService.unsubscribe();
 * ```
 */
export class RiskReportService {
  /** Logger service for debug output */
  private readonly loggerService = inject<TLoggerService>(TYPES.loggerService);

  /**
   * Last written EVENT timestamp per execution identity — the write-throttle
   * state for CC_REPORT_RISK_REJECTION_TTL_MS. FIFO-bounded (see
   * RISK_THROTTLE_MAP_LIMIT).
   */
  private _lastWritten = new LimitedMap<string, number>(RISK_THROTTLE_MAP_LIMIT);

  /**
   * Processes risk rejection events and logs them to the database.
   *
   * Throttled by CC_REPORT_RISK_REJECTION_TTL_MS: a risk rejection rolls back
   * the generation throttle, so a strategy stuck against a limit re-emits a
   * rejection every tick — only the first row per execution identity
   * (symbol/strategy/exchange/frame) is written per interval, regardless of
   * the rejection reason. The interval is measured by the EVENT timestamp
   * (virtual time in backtest, tick time in live), never the wall clock.
   *
   * @param data - Risk event with rejection reason and pending signal information
   *
   * @internal
   */
  private tickRejection = async (data: RiskEvent) => {
    this.loggerService.log(RISK_REPORT_METHOD_NAME_TICK, { data });

    if (GLOBAL_CONFIG.CC_REPORT_RISK_REJECTION_TTL_MS > 0) {
      // One bucket per execution identity: ANY rejection for this
      // symbol/strategy/exchange/frame refreshes the same throttle slot —
      // the reason (note/id) is carried in the written row, not in the key.
      const throttleKey = [
        data.symbol,
        data.strategyName,
        data.exchangeName,
        data.frameName,
      ].join(":");
      const lastWritten = this._lastWritten.get(throttleKey);
      if (
        lastWritten !== undefined &&
        data.timestamp - lastWritten < GLOBAL_CONFIG.CC_REPORT_RISK_REJECTION_TTL_MS
      ) {
        return;
      }
      this._lastWritten.set(throttleKey, data.timestamp);
    }

    await ReportWriter.writeData("risk", {
      timestamp: data.timestamp,
      symbol: data.symbol,
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      backtest: data.backtest,
      currentPrice: data.currentPrice,
      activePositionCount: data.activePositionCount,
      rejectionId: data.rejectionId,
      rejectionNote: data.rejectionNote,
      currentSignal: data.currentSignal,
      signalId: data.currentSignal?.id,
      position: data.currentSignal?.position,
      priceOpen: data.currentSignal?.priceOpen,
      priceTakeProfit: data.currentSignal?.priceTakeProfit,
      priceStopLoss: data.currentSignal?.priceStopLoss,
      originalPriceTakeProfit: data.currentSignal?.originalPriceTakeProfit,
      originalPriceStopLoss: data.currentSignal?.originalPriceStopLoss,
      partialExecuted: data.currentSignal?.partialExecuted,
      note: data.currentSignal?.note,
      pendingAt: data.currentSignal?.pendingAt,
      scheduledAt: data.currentSignal?.scheduledAt,
      minuteEstimatedTime: data.currentSignal?.minuteEstimatedTime,
      multiplier: data.currentSignal?.multiplier,
      isolated: data.currentSignal?.isolated,
      totalPartials: data.currentSignal?.totalPartials,
      cost: data.currentSignal?.cost,
      pnlPercentage: data.currentSignal?.pnl?.pnlPercentage,
      pnlCost: data.currentSignal?.pnl?.pnlCost,
      pnlDividends: data.currentSignal?.pnl?.pnlDividends,
      entries: data.currentSignal?.entries ?? [],
      partials: data.currentSignal?.partials ?? [],
      accruals: data.currentSignal?.accruals ?? [],
      pnlEntries: data.currentSignal?.pnl?.pnlEntries,
      pnlPriceOpen: data.currentSignal?.pnl?.priceOpen,
      pnlPriceClose: data.currentSignal?.pnl?.priceClose,
      peakProfitPercentage: data.currentSignal?.peakProfit?.pnlPercentage,
      peakProfitCost: data.currentSignal?.peakProfit?.pnlCost,
      peakProfitEntries: data.currentSignal?.peakProfit?.pnlEntries,
      peakProfitPriceOpen: data.currentSignal?.peakProfit?.priceOpen,
      peakProfitPriceClose: data.currentSignal?.peakProfit?.priceClose,
      maxDrawdownPercentage: data.currentSignal?.maxDrawdown?.pnlPercentage,
      maxDrawdownCost: data.currentSignal?.maxDrawdown?.pnlCost,
      maxDrawdownEntries: data.currentSignal?.maxDrawdown?.pnlEntries,
      maxDrawdownPriceOpen: data.currentSignal?.maxDrawdown?.priceOpen,
      maxDrawdownPriceClose: data.currentSignal?.maxDrawdown?.priceClose,
    }, {
      symbol: data.symbol,
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      signalId: data.currentSignal?.id || "",
      walkerName: "",
    });
  };

  /**
   * Subscribes to risk rejection emitter to receive rejection events.
   * Protected against multiple subscriptions.
   * Returns an unsubscribe function to stop receiving events.
   *
   * @returns Unsubscribe function to stop receiving risk rejection events
   *
   * @example
   * ```typescript
   * const service = new RiskReportService();
   * const unsubscribe = service.subscribe();
   * // ... later
   * unsubscribe();
   * ```
   */
  public subscribe = singleshot(() => {
    this.loggerService.log(RISK_REPORT_METHOD_NAME_SUBSCRIBE);
    const unsubscribe = riskSubject.subscribe(this.tickRejection);
    return () => {
      this.subscribe.clear();
      unsubscribe();
    };
  });

  /**
   * Unsubscribes from risk rejection emitter to stop receiving events.
   * Calls the unsubscribe function returned by subscribe().
   * If not subscribed, does nothing.
   *
   * @example
   * ```typescript
   * const service = new RiskReportService();
   * service.subscribe();
   * // ... later
   * await service.unsubscribe();
   * ```
   */
  public unsubscribe = async () => {
    this.loggerService.log(RISK_REPORT_METHOD_NAME_UNSUBSCRIBE);
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };
}

export default RiskReportService;

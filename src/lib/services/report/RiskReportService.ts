import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { singleshot } from "functools-kit";
import { riskSubject } from "../../../config/emitters";
import { Report } from "../../../classes/Report";
import { RiskEvent } from "../../../model/RiskStatistics.model";

const RISK_REPORT_METHOD_NAME_SUBSCRIBE = "RiskReportService.subscribe";
const RISK_REPORT_METHOD_NAME_UNSUBSCRIBE = "RiskReportService.unsubscribe";
const RISK_REPORT_METHOD_NAME_TICK = "RiskReportService.tickRejection";

/**
 * Service for logging risk rejection events to SQLite database.
 *
 * Captures all signal rejection events from the risk management system
 * and stores them in the Report database for risk analysis and auditing.
 *
 * Features:
 * - Listens to risk rejection events via riskSubject
 * - Logs all rejected signals with reason and pending signal details
 * - Stores events in Report.writeData() for risk tracking
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
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * Processes risk rejection events and logs them to the database.
   *
   * @param data - Risk event with rejection reason and pending signal information
   *
   * @internal
   */
  private tickRejection = async (data: RiskEvent) => {
    this.loggerService.log(RISK_REPORT_METHOD_NAME_TICK, { data });

    await Report.writeData("risk", {
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
      pendingSignal: data.pendingSignal,
      signalId: data.pendingSignal?.id,
      position: data.pendingSignal?.position,
      priceOpen: data.pendingSignal?.priceOpen,
      priceTakeProfit: data.pendingSignal?.priceTakeProfit,
      priceStopLoss: data.pendingSignal?.priceStopLoss,
      originalPriceTakeProfit: data.pendingSignal?.originalPriceTakeProfit,
      originalPriceStopLoss: data.pendingSignal?.originalPriceStopLoss,
      totalExecuted: data.pendingSignal?.totalExecuted,
      note: data.pendingSignal?.note,
      minuteEstimatedTime: data.pendingSignal?.minuteEstimatedTime,
    }, {
      symbol: data.symbol,
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      signalId: "",
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

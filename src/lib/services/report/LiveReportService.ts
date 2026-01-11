import { IStrategyTickResult } from "../../../interfaces/Strategy.interface";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { singleshot } from "functools-kit";
import { signalLiveEmitter } from "../../../config/emitters";
import { Report } from "../../../classes/Report";

const LIVE_REPORT_METHOD_NAME_SUBSCRIBE = "LiveReportService.subscribe";
const LIVE_REPORT_METHOD_NAME_UNSUBSCRIBE = "LiveReportService.unsubscribe";
const LIVE_REPORT_METHOD_NAME_TICK = "LiveReportService.tick";

/**
 * Service for logging live trading strategy tick events to SQLite database.
 *
 * Captures all live trading signal lifecycle events (idle, opened, active, closed)
 * and stores them in the Report database for real-time monitoring and analysis.
 *
 * Features:
 * - Listens to live signal events via signalLiveEmitter
 * - Logs all tick event types with full signal details
 * - Stores events in Report.writeData() for persistence
 * - Protected against multiple subscriptions using singleshot
 *
 * @example
 * ```typescript
 * import { LiveReportService } from "backtest-kit";
 *
 * const reportService = new LiveReportService();
 *
 * // Subscribe to live trading events
 * const unsubscribe = reportService.subscribe();
 *
 * // Run live trading...
 * // Events are automatically logged
 *
 * // Later: unsubscribe
 * await reportService.unsubscribe();
 * ```
 */
export class LiveReportService {
  /** Logger service for debug output */
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * Processes live trading tick events and logs them to the database.
   * Handles all event types: idle, opened, active, closed.
   *
   * @param data - Live trading tick result with signal lifecycle information
   *
   * @internal
   */
  private tick = async (data: IStrategyTickResult) => {
    this.loggerService.log(LIVE_REPORT_METHOD_NAME_TICK, { data });

    const baseEvent = {
      timestamp: Date.now(),
      action: data.action,
      symbol: data.symbol,
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      backtest: false,
      currentPrice: data.currentPrice,
    };

    const searchOptions = {
      symbol: data.symbol,
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      signalId: data.action === "idle" ? "" : data.signal?.id,
      walkerName: "",
    };

    if (data.action === "idle") {
      await Report.writeData("live", baseEvent, searchOptions);
    } else if (data.action === "opened") {
      await Report.writeData("live", {
        ...baseEvent,
        signalId: data.signal?.id,
        position: data.signal?.position,
        note: data.signal?.note,
        priceOpen: data.signal?.priceOpen,
        priceTakeProfit: data.signal?.priceTakeProfit,
        priceStopLoss: data.signal?.priceStopLoss,
        originalPriceTakeProfit: data.signal?.originalPriceTakeProfit,
        originalPriceStopLoss: data.signal?.originalPriceStopLoss,
        totalExecuted: data.signal?.totalExecuted,
        openTime: data.signal?.pendingAt,
        scheduledAt: data.signal?.scheduledAt,
        minuteEstimatedTime: data.signal?.minuteEstimatedTime,
      }, { ...searchOptions, signalId: data.signal?.id });
    } else if (data.action === "active") {
      await Report.writeData("live", {
        ...baseEvent,
        signalId: data.signal?.id,
        position: data.signal?.position,
        note: data.signal?.note,
        priceOpen: data.signal?.priceOpen,
        priceTakeProfit: data.signal?.priceTakeProfit,
        priceStopLoss: data.signal?.priceStopLoss,
        originalPriceTakeProfit: data.signal?.originalPriceTakeProfit,
        originalPriceStopLoss: data.signal?.originalPriceStopLoss,
        _partial: data.signal?._partial,
        totalExecuted: data.signal?.totalExecuted,
        openTime: data.signal?.pendingAt,
        scheduledAt: data.signal?.scheduledAt,
        minuteEstimatedTime: data.signal?.minuteEstimatedTime,
        percentTp: data.percentTp,
        percentSl: data.percentSl,
        pnl: data.pnl.pnlPercentage,
        pnlPriceOpen: data.pnl.priceOpen,
        pnlPriceClose: data.pnl.priceClose,
      }, { ...searchOptions, signalId: data.signal?.id });
    } else if (data.action === "closed") {
      const durationMs = data.closeTimestamp - data.signal?.pendingAt;
      const durationMin = Math.round(durationMs / 60000);

      await Report.writeData("live", {
        ...baseEvent,
        signalId: data.signal?.id,
        position: data.signal?.position,
        note: data.signal?.note,
        priceOpen: data.signal?.priceOpen,
        priceTakeProfit: data.signal?.priceTakeProfit,
        priceStopLoss: data.signal?.priceStopLoss,
        originalPriceTakeProfit: data.signal?.originalPriceTakeProfit,
        originalPriceStopLoss: data.signal?.originalPriceStopLoss,
        _partial: data.signal?._partial,
        totalExecuted: data.signal?.totalExecuted,
        openTime: data.signal?.pendingAt,
        scheduledAt: data.signal?.scheduledAt,
        minuteEstimatedTime: data.signal?.minuteEstimatedTime,
        pnl: data.pnl.pnlPercentage,
        pnlPriceOpen: data.pnl.priceOpen,
        pnlPriceClose: data.pnl.priceClose,
        closeReason: data.closeReason,
        duration: durationMin,
        closeTime: data.closeTimestamp,
      }, { ...searchOptions, signalId: data.signal?.id });
    }
  };

  /**
   * Subscribes to live signal emitter to receive tick events.
   * Protected against multiple subscriptions.
   * Returns an unsubscribe function to stop receiving events.
   *
   * @returns Unsubscribe function to stop receiving live trading events
   *
   * @example
   * ```typescript
   * const service = new LiveReportService();
   * const unsubscribe = service.subscribe();
   * // ... later
   * unsubscribe();
   * ```
   */
  public subscribe = singleshot(() => {
    this.loggerService.log(LIVE_REPORT_METHOD_NAME_SUBSCRIBE);
    const unsubscribe = signalLiveEmitter.subscribe(this.tick);
    return () => {
      this.subscribe.clear();
      unsubscribe();
    };
  });

  /**
   * Unsubscribes from live signal emitter to stop receiving tick events.
   * Calls the unsubscribe function returned by subscribe().
   * If not subscribed, does nothing.
   *
   * @example
   * ```typescript
   * const service = new LiveReportService();
   * service.subscribe();
   * // ... later
   * await service.unsubscribe();
   * ```
   */
  public unsubscribe = async () => {
    this.loggerService.log(LIVE_REPORT_METHOD_NAME_UNSUBSCRIBE);
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };
}

export default LiveReportService;

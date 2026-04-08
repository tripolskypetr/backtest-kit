import { IStrategyTickResult } from "../../../interfaces/Strategy.interface";
import { inject } from "../../../lib/core/di";
import LoggerService, { TLoggerService } from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { singleshot } from "functools-kit";
import { signalEmitter } from "../../../config/emitters";
import { ReportWriter } from "../../../classes/Writer";

const SCHEDULE_REPORT_METHOD_NAME_SUBSCRIBE = "ScheduleReportService.subscribe";
const SCHEDULE_REPORT_METHOD_NAME_UNSUBSCRIBE = "ScheduleReportService.unsubscribe";
const SCHEDULE_REPORT_METHOD_NAME_TICK = "ScheduleReportService.tick";

/**
 * Service for logging scheduled signal events to SQLite database.
 *
 * Captures all scheduled signal lifecycle events (scheduled, opened, cancelled)
 * and stores them in the Report database for tracking delayed order execution.
 *
 * Features:
 * - Listens to signal events via signalEmitter
 * - Logs scheduled, opened (from scheduled), and cancelled events
 * - Calculates duration between scheduling and execution/cancellation
 * - Stores events in ReportWriter.writeData() for schedule tracking
 * - Protected against multiple subscriptions using singleshot
 *
 * @example
 * ```typescript
 * import { ScheduleReportService } from "backtest-kit";
 *
 * const reportService = new ScheduleReportService();
 *
 * // Subscribe to scheduled signal events
 * const unsubscribe = reportService.subscribe();
 *
 * // Run strategy with scheduled orders...
 * // Scheduled events are automatically logged
 *
 * // Later: unsubscribe
 * await reportService.unsubscribe();
 * ```
 */
export class ScheduleReportService {
  /** Logger service for debug output */
  private readonly loggerService = inject<TLoggerService>(TYPES.loggerService);

  /**
   * Processes signal tick events and logs scheduled signal lifecycle to the database.
   * Handles scheduled, opened (from scheduled), and cancelled event types.
   *
   * @param data - Strategy tick result with signal lifecycle information
   *
   * @internal
   */
  private tick = async (data: IStrategyTickResult) => {
    this.loggerService.log(SCHEDULE_REPORT_METHOD_NAME_TICK, { data });

    const baseEvent = {
      symbol: data.symbol,
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      backtest: data.backtest,
      currentPrice: data.currentPrice,
    };

    const searchOptions = {
      symbol: data.symbol,
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      signalId: data.signal?.id,
      walkerName: "",
    };

    if (data.action === "scheduled") {
      await ReportWriter.writeData("schedule", {
        timestamp: data.signal?.scheduledAt,
        action: "scheduled",
        ...baseEvent,
        signalId: data.signal?.id,
        position: data.signal?.position,
        note: data.signal?.note,
        priceOpen: data.signal?.priceOpen,
        priceTakeProfit: data.signal?.priceTakeProfit,
        priceStopLoss: data.signal?.priceStopLoss,
        originalPriceTakeProfit: data.signal?.originalPriceTakeProfit,
        originalPriceStopLoss: data.signal?.originalPriceStopLoss,
        totalEntries: data.signal?.totalEntries,
        originalPriceOpen: data.signal?.originalPriceOpen,
        partialExecuted: data.signal?.partialExecuted,
        pendingAt: data.signal?.pendingAt,
        minuteEstimatedTime: data.signal?.minuteEstimatedTime,
        totalPartials: data.signal?.totalPartials,
        cost: data.signal?.cost,
        pnlPercentage: data.signal?.pnl?.pnlPercentage,
        pnlCost: data.signal?.pnl?.pnlCost,
        pnlEntries: data.signal?.pnl?.pnlEntries,
        pnlPriceOpen: data.signal?.pnl?.priceOpen,
        pnlPriceClose: data.signal?.pnl?.priceClose,
      }, searchOptions);
    } else if (data.action === "opened") {
      if (data.signal?.scheduledAt !== data.signal?.pendingAt) {
        const durationMs = data.signal?.pendingAt - data.signal?.scheduledAt;
        const durationMin = Math.round(durationMs / 60000);

        await ReportWriter.writeData("schedule", {
          timestamp: data.signal?.pendingAt,
          action: "opened",
          ...baseEvent,
          signalId: data.signal?.id,
          position: data.signal?.position,
          note: data.signal?.note,
          priceOpen: data.signal?.priceOpen,
          priceTakeProfit: data.signal?.priceTakeProfit,
          priceStopLoss: data.signal?.priceStopLoss,
          originalPriceTakeProfit: data.signal?.originalPriceTakeProfit,
          originalPriceStopLoss: data.signal?.originalPriceStopLoss,
          totalEntries: data.signal?.totalEntries,
          originalPriceOpen: data.signal?.originalPriceOpen,
          partialExecuted: data.signal?.partialExecuted,
          scheduledAt: data.signal?.scheduledAt,
          pendingAt: data.signal?.pendingAt,
          minuteEstimatedTime: data.signal?.minuteEstimatedTime,
          duration: durationMin,
          totalPartials: data.signal?.totalPartials,
          cost: data.signal?.cost,
          pnlPercentage: data.signal?.pnl?.pnlPercentage,
          pnlCost: data.signal?.pnl?.pnlCost,
          pnlEntries: data.signal?.pnl?.pnlEntries,
          pnlPriceOpen: data.signal?.pnl?.priceOpen,
          pnlPriceClose: data.signal?.pnl?.priceClose,
        }, searchOptions);
      }
    } else if (data.action === "cancelled") {
      const durationMs = data.closeTimestamp - data.signal?.scheduledAt;
      const durationMin = Math.round(durationMs / 60000);

      await ReportWriter.writeData("schedule", {
        timestamp: data.closeTimestamp,
        action: "cancelled",
        ...baseEvent,
        signalId: data.signal?.id,
        position: data.signal?.position,
        note: data.signal?.note,
        priceOpen: data.signal?.priceOpen,
        priceTakeProfit: data.signal?.priceTakeProfit,
        priceStopLoss: data.signal?.priceStopLoss,
        originalPriceTakeProfit: data.signal?.originalPriceTakeProfit,
        originalPriceStopLoss: data.signal?.originalPriceStopLoss,
        totalEntries: data.signal?.totalEntries,
        originalPriceOpen: data.signal?.originalPriceOpen,
        partialExecuted: data.signal?.partialExecuted,
        scheduledAt: data.signal?.scheduledAt,
        pendingAt: data.signal?.pendingAt,
        minuteEstimatedTime: data.signal?.minuteEstimatedTime,
        closeTime: data.closeTimestamp,
        duration: durationMin,
        cancelReason: data.reason,
        cancelId: data.cancelId,
        totalPartials: data.signal?.totalPartials,
        cost: data.signal?.cost,
        pnlPercentage: data.signal?.pnl?.pnlPercentage,
        pnlCost: data.signal?.pnl?.pnlCost,
        pnlEntries: data.signal?.pnl?.pnlEntries,
        pnlPriceOpen: data.signal?.pnl?.priceOpen,
        pnlPriceClose: data.signal?.pnl?.priceClose,
      }, searchOptions);
    }
  };

  /**
   * Subscribes to signal emitter to receive scheduled signal events.
   * Protected against multiple subscriptions.
   * Returns an unsubscribe function to stop receiving events.
   *
   * @returns Unsubscribe function to stop receiving scheduled signal events
   *
   * @example
   * ```typescript
   * const service = new ScheduleReportService();
   * const unsubscribe = service.subscribe();
   * // ... later
   * unsubscribe();
   * ```
   */
  public subscribe = singleshot(() => {
    this.loggerService.log(SCHEDULE_REPORT_METHOD_NAME_SUBSCRIBE);
    const unsubscribe = signalEmitter.subscribe(this.tick);
    return () => {
      this.subscribe.clear();
      unsubscribe();
    };
  });

  /**
   * Unsubscribes from signal emitter to stop receiving events.
   * Calls the unsubscribe function returned by subscribe().
   * If not subscribed, does nothing.
   *
   * @example
   * ```typescript
   * const service = new ScheduleReportService();
   * service.subscribe();
   * // ... later
   * await service.unsubscribe();
   * ```
   */
  public unsubscribe = async () => {
    this.loggerService.log(SCHEDULE_REPORT_METHOD_NAME_UNSUBSCRIBE);
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };
}

export default ScheduleReportService;

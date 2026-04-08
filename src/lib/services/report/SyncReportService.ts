import { inject } from "../../../lib/core/di";
import LoggerService, { TLoggerService } from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { singleshot, trycatch } from "functools-kit";
import { syncSubject } from "../../../config/emitters";
import { ReportWriter } from "../../../classes/Writer";
import SignalSyncContract from "../../../contract/SignalSync.contract";

const SYNC_REPORT_METHOD_NAME_SUBSCRIBE = "SyncReportService.subscribe";
const SYNC_REPORT_METHOD_NAME_UNSUBSCRIBE = "SyncReportService.unsubscribe";
const SYNC_REPORT_METHOD_NAME_TICK = "SyncReportService.tick";

/**
 * Service for logging signal synchronization events to JSONL report files.
 *
 * Captures all signal lifecycle sync events (signal-open, signal-close)
 * emitted by syncSubject and stores them in the Report database for
 * external order management audit trails.
 *
 * Features:
 * - Listens to sync events via syncSubject
 * - Logs signal-open events (scheduled limit order filled) with full signal details
 * - Logs signal-close events (position exited) with PNL and close reason
 * - Stores events in ReportWriter.writeData() for persistence
 * - Protected against multiple subscriptions using singleshot
 *
 * @example
 * ```typescript
 * import { SyncReportService } from "backtest-kit";
 *
 * const reportService = new SyncReportService();
 *
 * // Subscribe to sync events
 * const unsubscribe = reportService.subscribe();
 *
 * // Run strategy...
 * // Sync events are automatically logged
 *
 * // Later: unsubscribe
 * await reportService.unsubscribe();
 * ```
 */
export class SyncReportService {
  /** Logger service for debug output */
  private readonly loggerService = inject<TLoggerService>(TYPES.loggerService);

  /**
   * Processes signal sync events and logs them to the database.
   * Handles both signal-open and signal-close action types.
   *
   * @param data - Signal sync contract with lifecycle information
   *
   * @internal
   */
  private tick = async (data: SignalSyncContract) => {
    this.loggerService.log(SYNC_REPORT_METHOD_NAME_TICK, { data });

    const baseEvent = {
      timestamp: data.timestamp,
      action: data.action,
      symbol: data.symbol,
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      backtest: data.backtest,
      signalId: data.signalId,
      position: data.signal?.position,
      note: data.signal?.note,
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
      cost: data.signal?.cost,
      partialExecuted: data.signal?.partialExecuted,
      minuteEstimatedTime: data.signal?.minuteEstimatedTime,
      _partial: data.signal?._partial,
      pnlPercentage: data.pnl.pnlPercentage,
      pnlCost: data.pnl.pnlCost,
      pnlEntries: data.pnl.pnlEntries,
      pnlPriceOpen: data.pnl.priceOpen,
      pnlPriceClose: data.pnl.priceClose,
      currentPrice: data.currentPrice,
    };

    const searchOptions = {
      symbol: data.symbol,
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      signalId: data.signalId,
      walkerName: "",
    };

    if (data.action === "signal-open") {
      await ReportWriter.writeData("sync", baseEvent, searchOptions);
    } else if (data.action === "signal-close") {
      await ReportWriter.writeData("sync", {
        ...baseEvent,
        closeReason: data.closeReason,
      }, searchOptions);
    }
  };

  /**
   * Subscribes to syncSubject to receive signal sync events.
   * Protected against multiple subscriptions.
   * Returns an unsubscribe function to stop receiving events.
   *
   * @returns Unsubscribe function to stop receiving sync events
   *
   * @example
   * ```typescript
   * const service = new SyncReportService();
   * const unsubscribe = service.subscribe();
   * // ... later
   * unsubscribe();
   * ```
   */
  public subscribe = singleshot(() => {
    this.loggerService.log(SYNC_REPORT_METHOD_NAME_SUBSCRIBE);
    const unsubscribe = syncSubject.subscribe(trycatch(this.tick));
    return () => {
      this.subscribe.clear();
      unsubscribe();
    };
  });

  /**
   * Unsubscribes from syncSubject to stop receiving sync events.
   * Calls the unsubscribe function returned by subscribe().
   * If not subscribed, does nothing.
   *
   * @example
   * ```typescript
   * const service = new SyncReportService();
   * service.subscribe();
   * // ... later
   * await service.unsubscribe();
   * ```
   */
  public unsubscribe = async () => {
    this.loggerService.log(SYNC_REPORT_METHOD_NAME_UNSUBSCRIBE);
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };
}

export default SyncReportService;

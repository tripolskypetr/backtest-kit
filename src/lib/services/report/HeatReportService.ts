import { IStrategyTickResult } from "../../../interfaces/Strategy.interface";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { singleshot } from "functools-kit";
import { signalEmitter } from "../../../config/emitters";
import { Report } from "../../../classes/Report";

const HEAT_REPORT_METHOD_NAME_SUBSCRIBE = "HeatReportService.subscribe";
const HEAT_REPORT_METHOD_NAME_UNSUBSCRIBE = "HeatReportService.unsubscribe";
const HEAT_REPORT_METHOD_NAME_TICK = "HeatReportService.tick";

/**
 * Service for logging heatmap (closed signals) events to SQLite database.
 *
 * Captures closed signal events across all symbols for portfolio-wide
 * heatmap analysis and stores them in the Report database.
 *
 * Features:
 * - Listens to signal events via signalEmitter
 * - Logs only closed signals with PNL data
 * - Stores events in Report.writeData() for heatmap generation
 * - Protected against multiple subscriptions using singleshot
 *
 * @example
 * ```typescript
 * import { HeatReportService } from "backtest-kit";
 *
 * const reportService = new HeatReportService();
 *
 * // Subscribe to signal events
 * const unsubscribe = reportService.subscribe();
 *
 * // Run strategy...
 * // Closed signals are automatically logged
 *
 * // Later: unsubscribe
 * await reportService.unsubscribe();
 * ```
 */
export class HeatReportService {
  /** Logger service for debug output */
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * Processes signal tick events and logs closed signals to the database.
   * Only processes closed signals - other actions are ignored.
   *
   * @param data - Strategy tick result with signal lifecycle information
   *
   * @internal
   */
  private tick = async (data: IStrategyTickResult) => {
    this.loggerService.log(HEAT_REPORT_METHOD_NAME_TICK, { data });

    if (data.action !== "closed") {
      return;
    }

    await Report.writeData("heat", {
      timestamp: Date.now(),
      action: data.action,
      symbol: data.symbol,
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      backtest: data.backtest,
      signalId: data.signal?.id,
      position: data.signal?.position,
      note: data.signal?.note,
      priceOpen: data.signal?.priceOpen,
      priceTakeProfit: data.signal?.priceTakeProfit,
      priceStopLoss: data.signal?.priceStopLoss,
      originalPriceTakeProfit: data.signal?.originalPriceTakeProfit,
      originalPriceStopLoss: data.signal?.originalPriceStopLoss,
      pnl: data.pnl.pnlPercentage,
      closeReason: data.closeReason,
      openTime: data.signal?.pendingAt,
      scheduledAt: data.signal?.scheduledAt,
      closeTime: data.closeTimestamp,
    }, {
      symbol: data.symbol,
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      signalId: data.signal?.id,
      walkerName: "",
    });
  };

  /**
   * Subscribes to signal emitter to receive closed signal events.
   * Protected against multiple subscriptions.
   * Returns an unsubscribe function to stop receiving events.
   *
   * @returns Unsubscribe function to stop receiving signal events
   *
   * @example
   * ```typescript
   * const service = new HeatReportService();
   * const unsubscribe = service.subscribe();
   * // ... later
   * unsubscribe();
   * ```
   */
  public subscribe = singleshot(() => {
    this.loggerService.log(HEAT_REPORT_METHOD_NAME_SUBSCRIBE);
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
   * const service = new HeatReportService();
   * service.subscribe();
   * // ... later
   * await service.unsubscribe();
   * ```
   */
  public unsubscribe = async () => {
    this.loggerService.log(HEAT_REPORT_METHOD_NAME_UNSUBSCRIBE);
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };
}

export default HeatReportService;

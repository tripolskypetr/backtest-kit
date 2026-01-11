import { ISignalRow } from "../../../interfaces/Strategy.interface";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { singleshot } from "functools-kit";
import { breakevenSubject } from "../../../config/emitters";
import { Report } from "../../../classes/Report";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";

const BREAKEVEN_REPORT_METHOD_NAME_SUBSCRIBE = "BreakevenReportService.subscribe";
const BREAKEVEN_REPORT_METHOD_NAME_UNSUBSCRIBE = "BreakevenReportService.unsubscribe";
const BREAKEVEN_REPORT_METHOD_NAME_TICK = "BreakevenReportService.tickBreakeven";

/**
 * Service for logging breakeven events to SQLite database.
 *
 * Captures all breakeven events (when signal reaches breakeven point)
 * and stores them in the Report database for analysis and tracking.
 *
 * Features:
 * - Listens to breakeven events via breakevenSubject
 * - Logs all breakeven achievements with full signal details
 * - Stores events in Report.writeData() for persistence
 * - Protected against multiple subscriptions using singleshot
 *
 * @example
 * ```typescript
 * import { BreakevenReportService } from "backtest-kit";
 *
 * const reportService = new BreakevenReportService();
 *
 * // Subscribe to breakeven events
 * const unsubscribe = reportService.subscribe();
 *
 * // Run strategy...
 * // Breakeven events are automatically logged
 *
 * // Later: unsubscribe
 * await reportService.unsubscribe();
 * ```
 */
export class BreakevenReportService {
  /** Logger service for debug output */
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * Processes breakeven events and logs them to the database.
   *
   * @param data - Breakeven event data with signal and price information
   *
   * @internal
   */
  private tickBreakeven = async (data: {
    symbol: string;
    data: ISignalRow;
    currentPrice: number;
    backtest: boolean;
    timestamp: number;
    exchangeName: ExchangeName;
    frameName: FrameName;
  }) => {
    this.loggerService.log(BREAKEVEN_REPORT_METHOD_NAME_TICK, { data });

    await Report.writeData("breakeven", {
      timestamp: data.timestamp,
      symbol: data.symbol,
      strategyName: data.data.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      backtest: data.backtest,
      signalId: data.data.id,
      position: data.data.position,
      currentPrice: data.currentPrice,
      priceOpen: data.data.priceOpen,
      priceTakeProfit: data.data.priceTakeProfit,
      priceStopLoss: data.data.priceStopLoss,
      _partial: data.data._partial,
      note: data.data.note,
      pendingAt: data.data.pendingAt,
      scheduledAt: data.data.scheduledAt,
      minuteEstimatedTime: data.data.minuteEstimatedTime,
    }, {
      symbol: data.symbol,
      strategyName: data.data.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      signalId: data.data.id,
      walkerName: "",
    });
  };

  /**
   * Subscribes to breakeven signal emitter to receive breakeven events.
   * Protected against multiple subscriptions.
   * Returns an unsubscribe function to stop receiving events.
   *
   * @returns Unsubscribe function to stop receiving breakeven events
   *
   * @example
   * ```typescript
   * const service = new BreakevenReportService();
   * const unsubscribe = service.subscribe();
   * // ... later
   * unsubscribe();
   * ```
   */
  public subscribe = singleshot(() => {
    this.loggerService.log(BREAKEVEN_REPORT_METHOD_NAME_SUBSCRIBE);
    const unsubscribe = breakevenSubject.subscribe(this.tickBreakeven);
    return () => {
      this.subscribe.clear();
      unsubscribe();
    };
  });

  /**
   * Unsubscribes from breakeven signal emitter to stop receiving events.
   * Calls the unsubscribe function returned by subscribe().
   * If not subscribed, does nothing.
   *
   * @example
   * ```typescript
   * const service = new BreakevenReportService();
   * service.subscribe();
   * // ... later
   * await service.unsubscribe();
   * ```
   */
  public unsubscribe = async () => {
    this.loggerService.log(BREAKEVEN_REPORT_METHOD_NAME_UNSUBSCRIBE);
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };
}

export default BreakevenReportService;

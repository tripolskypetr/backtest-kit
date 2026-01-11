import { PerformanceContract } from "../../../contract/Performance.contract";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { singleshot } from "functools-kit";
import { performanceEmitter } from "../../../config/emitters";
import { Report } from "../../../classes/Report";

const PERFORMANCE_REPORT_METHOD_NAME_SUBSCRIBE = "PerformanceReportService.subscribe";
const PERFORMANCE_REPORT_METHOD_NAME_UNSUBSCRIBE = "PerformanceReportService.unsubscribe";
const PERFORMANCE_REPORT_METHOD_NAME_TRACK = "PerformanceReportService.track";

/**
 * Service for logging performance metrics to SQLite database.
 *
 * Captures all performance timing events from strategy execution
 * and stores them in the Report database for bottleneck analysis and optimization.
 *
 * Features:
 * - Listens to performance events via performanceEmitter
 * - Logs all timing metrics with duration and metadata
 * - Stores events in Report.writeData() for performance analysis
 * - Protected against multiple subscriptions using singleshot
 *
 * @example
 * ```typescript
 * import { PerformanceReportService } from "backtest-kit";
 *
 * const reportService = new PerformanceReportService();
 *
 * // Subscribe to performance events
 * const unsubscribe = reportService.subscribe();
 *
 * // Run strategy...
 * // Performance metrics are automatically logged
 *
 * // Later: unsubscribe
 * await reportService.unsubscribe();
 * ```
 */
export class PerformanceReportService {
  /** Logger service for debug output */
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * Processes performance tracking events and logs them to the database.
   *
   * @param event - Performance contract with timing and metric information
   *
   * @internal
   */
  private track = async (event: PerformanceContract) => {
    this.loggerService.log(PERFORMANCE_REPORT_METHOD_NAME_TRACK, { event });

    await Report.writeData("performance", {
      timestamp: event.timestamp,
      metricType: event.metricType,
      duration: event.duration,
      symbol: event.symbol,
      strategyName: event.strategyName,
      exchangeName: event.exchangeName,
      frameName: event.frameName,
      backtest: event.backtest,
      previousTimestamp: event.previousTimestamp,
    }, {
      symbol: event.symbol,
      strategyName: event.strategyName,
      exchangeName: event.exchangeName,
      frameName: event.frameName,
      signalId: "",
      walkerName: "",
    });
  };

  /**
   * Subscribes to performance emitter to receive timing events.
   * Protected against multiple subscriptions.
   * Returns an unsubscribe function to stop receiving events.
   *
   * @returns Unsubscribe function to stop receiving performance events
   *
   * @example
   * ```typescript
   * const service = new PerformanceReportService();
   * const unsubscribe = service.subscribe();
   * // ... later
   * unsubscribe();
   * ```
   */
  public subscribe = singleshot(() => {
    this.loggerService.log(PERFORMANCE_REPORT_METHOD_NAME_SUBSCRIBE);
    const unsubscribe = performanceEmitter.subscribe(this.track);
    return () => {
      this.subscribe.clear();
      unsubscribe();
    };
  });

  /**
   * Unsubscribes from performance emitter to stop receiving events.
   * Calls the unsubscribe function returned by subscribe().
   * If not subscribed, does nothing.
   *
   * @example
   * ```typescript
   * const service = new PerformanceReportService();
   * service.subscribe();
   * // ... later
   * await service.unsubscribe();
   * ```
   */
  public unsubscribe = async () => {
    this.loggerService.log(PERFORMANCE_REPORT_METHOD_NAME_UNSUBSCRIBE);
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };
}

export default PerformanceReportService;

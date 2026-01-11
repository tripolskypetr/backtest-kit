import { WalkerContract } from "../../../contract/Walker.contract";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { singleshot } from "functools-kit";
import { walkerEmitter } from "../../../config/emitters";
import { Report } from "../../../classes/Report";

const WALKER_REPORT_METHOD_NAME_SUBSCRIBE = "WalkerReportService.subscribe";
const WALKER_REPORT_METHOD_NAME_UNSUBSCRIBE = "WalkerReportService.unsubscribe";
const WALKER_REPORT_METHOD_NAME_TICK = "WalkerReportService.tick";

/**
 * Service for logging walker optimization progress to SQLite database.
 *
 * Captures walker strategy optimization results and stores them in the Report database
 * for tracking parameter optimization and comparing strategy performance.
 *
 * Features:
 * - Listens to walker events via walkerEmitter
 * - Logs each strategy test result with metrics and statistics
 * - Tracks best strategy and optimization progress
 * - Stores events in Report.writeData() for optimization analysis
 * - Protected against multiple subscriptions using singleshot
 *
 * @example
 * ```typescript
 * import { WalkerReportService } from "backtest-kit";
 *
 * const reportService = new WalkerReportService();
 *
 * // Subscribe to walker optimization events
 * const unsubscribe = reportService.subscribe();
 *
 * // Run walker optimization...
 * // Each strategy result is automatically logged
 *
 * // Later: unsubscribe
 * await reportService.unsubscribe();
 * ```
 */
export class WalkerReportService {
  /** Logger service for debug output */
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * Processes walker optimization events and logs them to the database.
   *
   * @param data - Walker contract with strategy optimization results
   *
   * @internal
   */
  private tick = async (data: WalkerContract) => {
    this.loggerService.log(WALKER_REPORT_METHOD_NAME_TICK, { data });

    await Report.writeData("walker", {
      timestamp: Date.now(),
      walkerName: data.walkerName,
      symbol: data.symbol,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      strategyName: data.strategyName,
      metric: data.metric,
      metricValue: data.metricValue,
      strategiesTested: data.strategiesTested,
      totalStrategies: data.totalStrategies,
      bestStrategy: data.bestStrategy,
      bestMetric: data.bestMetric,
      totalSignals: data.stats.totalSignals,
      winCount: data.stats.winCount,
      lossCount: data.stats.lossCount,
      winRate: data.stats.winRate,
      avgPnl: data.stats.avgPnl,
      totalPnl: data.stats.totalPnl,
      stdDev: data.stats.stdDev,
      sharpeRatio: data.stats.sharpeRatio,
      annualizedSharpeRatio: data.stats.annualizedSharpeRatio,
      certaintyRatio: data.stats.certaintyRatio,
      expectedYearlyReturns: data.stats.expectedYearlyReturns,
    }, {
      symbol: data.symbol,
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      signalId: "",
      walkerName: data.walkerName,
    });
  };

  /**
   * Subscribes to walker emitter to receive optimization progress events.
   * Protected against multiple subscriptions.
   * Returns an unsubscribe function to stop receiving events.
   *
   * @returns Unsubscribe function to stop receiving walker optimization events
   *
   * @example
   * ```typescript
   * const service = new WalkerReportService();
   * const unsubscribe = service.subscribe();
   * // ... later
   * unsubscribe();
   * ```
   */
  public subscribe = singleshot(() => {
    this.loggerService.log(WALKER_REPORT_METHOD_NAME_SUBSCRIBE);
    const unsubscribe = walkerEmitter.subscribe(this.tick);
    return () => {
      this.subscribe.clear();
      unsubscribe();
    };
  });

  /**
   * Unsubscribes from walker emitter to stop receiving events.
   * Calls the unsubscribe function returned by subscribe().
   * If not subscribed, does nothing.
   *
   * @example
   * ```typescript
   * const service = new WalkerReportService();
   * service.subscribe();
   * // ... later
   * await service.unsubscribe();
   * ```
   */
  public unsubscribe = async () => {
    this.loggerService.log(WALKER_REPORT_METHOD_NAME_UNSUBSCRIBE);
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };
}

export default WalkerReportService;

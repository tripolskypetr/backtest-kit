import { ISignalRow } from "../../../interfaces/Strategy.interface";
import { PartialLevel } from "../../../interfaces/Partial.interface";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { singleshot } from "functools-kit";
import { partialProfitSubject, partialLossSubject } from "../../../config/emitters";
import { Report } from "../../../classes/Report";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";

const PARTIAL_REPORT_METHOD_NAME_SUBSCRIBE = "PartialReportService.subscribe";
const PARTIAL_REPORT_METHOD_NAME_UNSUBSCRIBE = "PartialReportService.unsubscribe";
const PARTIAL_REPORT_METHOD_NAME_TICK_PROFIT = "PartialReportService.tickProfit";
const PARTIAL_REPORT_METHOD_NAME_TICK_LOSS = "PartialReportService.tickLoss";

/**
 * Service for logging partial profit/loss events to SQLite database.
 *
 * Captures all partial position exit events (profit and loss levels)
 * and stores them in the Report database for tracking partial closures.
 *
 * Features:
 * - Listens to partial profit events via partialProfitSubject
 * - Listens to partial loss events via partialLossSubject
 * - Logs all partial exit events with level and price information
 * - Stores events in Report.writeData() for persistence
 * - Protected against multiple subscriptions using singleshot
 *
 * @example
 * ```typescript
 * import { PartialReportService } from "backtest-kit";
 *
 * const reportService = new PartialReportService();
 *
 * // Subscribe to partial events
 * const unsubscribe = reportService.subscribe();
 *
 * // Run strategy with partial exits...
 * // Partial events are automatically logged
 *
 * // Later: unsubscribe
 * await reportService.unsubscribe();
 * ```
 */
export class PartialReportService {
  /** Logger service for debug output */
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  /**
   * Processes partial profit events and logs them to the database.
   *
   * @param data - Partial profit event data with signal, level, and price information
   *
   * @internal
   */
  private tickProfit = async (data: {
    symbol: string;
    data: ISignalRow;
    currentPrice: number;
    level: PartialLevel;
    backtest: boolean;
    timestamp: number;
    exchangeName: ExchangeName;
    frameName: FrameName;
  }) => {
    this.loggerService.log(PARTIAL_REPORT_METHOD_NAME_TICK_PROFIT, { data });

    await Report.writeData("partial", {
      timestamp: data.timestamp,
      action: "profit",
      symbol: data.symbol,
      strategyName: data.data.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      backtest: data.backtest,
      signalId: data.data.id,
      position: data.data.position,
      currentPrice: data.currentPrice,
      level: data.level,
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
   * Processes partial loss events and logs them to the database.
   *
   * @param data - Partial loss event data with signal, level, and price information
   *
   * @internal
   */
  private tickLoss = async (data: {
    symbol: string;
    data: ISignalRow;
    currentPrice: number;
    level: PartialLevel;
    backtest: boolean;
    timestamp: number;
    exchangeName: ExchangeName;
    frameName: FrameName;
  }) => {
    this.loggerService.log(PARTIAL_REPORT_METHOD_NAME_TICK_LOSS, { data });

    await Report.writeData("partial", {
      timestamp: data.timestamp,
      action: "loss",
      symbol: data.symbol,
      strategyName: data.data.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      backtest: data.backtest,
      signalId: data.data.id,
      position: data.data.position,
      currentPrice: data.currentPrice,
      level: data.level,
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
   * Subscribes to partial profit/loss emitters to receive partial exit events.
   * Protected against multiple subscriptions.
   * Returns an unsubscribe function to stop receiving events.
   *
   * @returns Unsubscribe function to stop receiving partial events
   *
   * @example
   * ```typescript
   * const service = new PartialReportService();
   * const unsubscribe = service.subscribe();
   * // ... later
   * unsubscribe();
   * ```
   */
  public subscribe = singleshot(() => {
    this.loggerService.log(PARTIAL_REPORT_METHOD_NAME_SUBSCRIBE);
    const unProfit = partialProfitSubject.subscribe(this.tickProfit);
    const unLoss = partialLossSubject.subscribe(this.tickLoss);
    return () => {
      this.subscribe.clear();
      unProfit();
      unLoss();
    };
  });

  /**
   * Unsubscribes from partial profit/loss emitters to stop receiving events.
   * Calls the unsubscribe function returned by subscribe().
   * If not subscribed, does nothing.
   *
   * @example
   * ```typescript
   * const service = new PartialReportService();
   * service.subscribe();
   * // ... later
   * await service.unsubscribe();
   * ```
   */
  public unsubscribe = async () => {
    this.loggerService.log(PARTIAL_REPORT_METHOD_NAME_UNSUBSCRIBE);
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };
}

export default PartialReportService;

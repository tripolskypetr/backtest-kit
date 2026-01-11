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

export class PerformanceReportService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

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

  public subscribe = singleshot(() => {
    this.loggerService.log(PERFORMANCE_REPORT_METHOD_NAME_SUBSCRIBE);
    const unsubscribe = performanceEmitter.subscribe(this.track);
    return () => {
      this.subscribe.clear();
      unsubscribe();
    };
  });

  public unsubscribe = async () => {
    this.loggerService.log(PERFORMANCE_REPORT_METHOD_NAME_UNSUBSCRIBE);
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };
}

export default PerformanceReportService;

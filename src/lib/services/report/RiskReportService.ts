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

export class RiskReportService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

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
    }, {
      symbol: data.symbol,
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      signalId: "",
      walkerName: "",
    });
  };

  public subscribe = singleshot(() => {
    this.loggerService.log(RISK_REPORT_METHOD_NAME_SUBSCRIBE);
    const unsubscribe = riskSubject.subscribe(this.tickRejection);
    return () => {
      this.subscribe.clear();
      unsubscribe();
    };
  });

  public unsubscribe = async () => {
    this.loggerService.log(RISK_REPORT_METHOD_NAME_UNSUBSCRIBE);
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };
}

export default RiskReportService;

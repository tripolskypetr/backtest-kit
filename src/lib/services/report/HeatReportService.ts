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

export class HeatReportService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

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
      pnl: data.pnl.pnlPercentage,
      closeReason: data.closeReason,
      openTime: data.signal?.pendingAt,
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

  public subscribe = singleshot(() => {
    this.loggerService.log(HEAT_REPORT_METHOD_NAME_SUBSCRIBE);
    const unsubscribe = signalEmitter.subscribe(this.tick);
    return () => {
      this.subscribe.clear();
      unsubscribe();
    };
  });

  public unsubscribe = async () => {
    this.loggerService.log(HEAT_REPORT_METHOD_NAME_UNSUBSCRIBE);
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };
}

export default HeatReportService;

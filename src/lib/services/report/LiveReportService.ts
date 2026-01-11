import { IStrategyTickResult } from "../../../interfaces/Strategy.interface";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { singleshot } from "functools-kit";
import { signalLiveEmitter } from "../../../config/emitters";
import { Report } from "../../../classes/Report";

const LIVE_REPORT_METHOD_NAME_SUBSCRIBE = "LiveReportService.subscribe";
const LIVE_REPORT_METHOD_NAME_UNSUBSCRIBE = "LiveReportService.unsubscribe";
const LIVE_REPORT_METHOD_NAME_TICK = "LiveReportService.tick";

export class LiveReportService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private tick = async (data: IStrategyTickResult) => {
    this.loggerService.log(LIVE_REPORT_METHOD_NAME_TICK, { data });

    const baseEvent = {
      timestamp: Date.now(),
      action: data.action,
      symbol: data.symbol,
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      backtest: false,
      currentPrice: data.currentPrice,
    };

    const searchOptions = {
      symbol: data.symbol,
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      signalId: data.action === "idle" ? "" : data.signal?.id,
      walkerName: "",
    };

    if (data.action === "idle") {
      await Report.writeData("live", baseEvent, searchOptions);
    } else if (data.action === "opened") {
      await Report.writeData("live", {
        ...baseEvent,
        signalId: data.signal?.id,
        position: data.signal?.position,
        note: data.signal?.note,
        priceOpen: data.signal?.priceOpen,
        priceTakeProfit: data.signal?.priceTakeProfit,
        priceStopLoss: data.signal?.priceStopLoss,
      }, { ...searchOptions, signalId: data.signal?.id });
    } else if (data.action === "active") {
      await Report.writeData("live", {
        ...baseEvent,
        signalId: data.signal?.id,
        position: data.signal?.position,
        note: data.signal?.note,
        priceOpen: data.signal?.priceOpen,
        priceTakeProfit: data.signal?.priceTakeProfit,
        priceStopLoss: data.signal?.priceStopLoss,
        percentTp: data.percentTp,
        percentSl: data.percentSl,
      }, { ...searchOptions, signalId: data.signal?.id });
    } else if (data.action === "closed") {
      const durationMs = data.closeTimestamp - data.signal?.pendingAt;
      const durationMin = Math.round(durationMs / 60000);

      await Report.writeData("live", {
        ...baseEvent,
        signalId: data.signal?.id,
        position: data.signal?.position,
        note: data.signal?.note,
        priceOpen: data.signal?.priceOpen,
        priceTakeProfit: data.signal?.priceTakeProfit,
        priceStopLoss: data.signal?.priceStopLoss,
        pnl: data.pnl.pnlPercentage,
        closeReason: data.closeReason,
        duration: durationMin,
        closeTime: data.closeTimestamp,
      }, { ...searchOptions, signalId: data.signal?.id });
    }
  };

  public subscribe = singleshot(() => {
    this.loggerService.log(LIVE_REPORT_METHOD_NAME_SUBSCRIBE);
    const unsubscribe = signalLiveEmitter.subscribe(this.tick);
    return () => {
      this.subscribe.clear();
      unsubscribe();
    };
  });

  public unsubscribe = async () => {
    this.loggerService.log(LIVE_REPORT_METHOD_NAME_UNSUBSCRIBE);
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };
}

export default LiveReportService;

import { IStrategyTickResult } from "../../../interfaces/Strategy.interface";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { singleshot } from "functools-kit";
import { signalBacktestEmitter } from "../../../config/emitters";
import { Report } from "../../../classes/Report";

const BACKTEST_REPORT_METHOD_NAME_SUBSCRIBE = "BacktestReportService.subscribe";
const BACKTEST_REPORT_METHOD_NAME_UNSUBSCRIBE = "BacktestReportService.unsubscribe";
const BACKTEST_REPORT_METHOD_NAME_TICK = "BacktestReportService.tick";

export class BacktestReportService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private tick = async (data: IStrategyTickResult) => {
    this.loggerService.log(BACKTEST_REPORT_METHOD_NAME_TICK, { data });

    const baseEvent = {
      timestamp: Date.now(),
      action: data.action,
      symbol: data.symbol,
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      backtest: true,
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
      await Report.writeData("backtest", baseEvent, searchOptions);
    } else if (data.action === "opened") {
      await Report.writeData("backtest", {
        ...baseEvent,
        signalId: data.signal?.id,
        position: data.signal?.position,
        note: data.signal?.note,
        priceOpen: data.signal?.priceOpen,
        priceTakeProfit: data.signal?.priceTakeProfit,
        priceStopLoss: data.signal?.priceStopLoss,
        originalPriceTakeProfit: data.signal?.originalPriceTakeProfit,
        originalPriceStopLoss: data.signal?.originalPriceStopLoss,
        totalExecuted: data.signal?.totalExecuted,
        openTime: data.signal?.pendingAt,
        scheduledAt: data.signal?.scheduledAt,
        minuteEstimatedTime: data.signal?.minuteEstimatedTime,
      }, { ...searchOptions, signalId: data.signal?.id });
    } else if (data.action === "active") {
      await Report.writeData("backtest", {
        ...baseEvent,
        signalId: data.signal?.id,
        position: data.signal?.position,
        note: data.signal?.note,
        priceOpen: data.signal?.priceOpen,
        priceTakeProfit: data.signal?.priceTakeProfit,
        priceStopLoss: data.signal?.priceStopLoss,
        originalPriceTakeProfit: data.signal?.originalPriceTakeProfit,
        originalPriceStopLoss: data.signal?.originalPriceStopLoss,
        _partial: data.signal?._partial,
        totalExecuted: data.signal?.totalExecuted,
        openTime: data.signal?.pendingAt,
        scheduledAt: data.signal?.scheduledAt,
        minuteEstimatedTime: data.signal?.minuteEstimatedTime,
        percentTp: data.percentTp,
        percentSl: data.percentSl,
      }, { ...searchOptions, signalId: data.signal?.id });
    } else if (data.action === "closed") {
      const durationMs = data.closeTimestamp - data.signal?.pendingAt;
      const durationMin = Math.round(durationMs / 60000);

      await Report.writeData("backtest", {
        ...baseEvent,
        signalId: data.signal?.id,
        position: data.signal?.position,
        note: data.signal?.note,
        priceOpen: data.signal?.priceOpen,
        priceTakeProfit: data.signal?.priceTakeProfit,
        priceStopLoss: data.signal?.priceStopLoss,
        originalPriceTakeProfit: data.signal?.originalPriceTakeProfit,
        originalPriceStopLoss: data.signal?.originalPriceStopLoss,
        _partial: data.signal?._partial,
        totalExecuted: data.signal?.totalExecuted,
        openTime: data.signal?.pendingAt,
        scheduledAt: data.signal?.scheduledAt,
        minuteEstimatedTime: data.signal?.minuteEstimatedTime,
        pnl: data.pnl.pnlPercentage,
        pnlPriceOpen: data.pnl.priceOpen,
        pnlPriceClose: data.pnl.priceClose,
        closeReason: data.closeReason,
        closeTime: data.closeTimestamp,
        duration: durationMin,
      }, { ...searchOptions, signalId: data.signal?.id });
    }
  };

  public subscribe = singleshot(() => {
    this.loggerService.log(BACKTEST_REPORT_METHOD_NAME_SUBSCRIBE);
    const unsubscribe = signalBacktestEmitter.subscribe(this.tick);
    return () => {
      this.subscribe.clear();
      unsubscribe();
    };
  });

  public unsubscribe = async () => {
    this.loggerService.log(BACKTEST_REPORT_METHOD_NAME_UNSUBSCRIBE);
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };
}

export default BacktestReportService;

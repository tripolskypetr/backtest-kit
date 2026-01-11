import { IStrategyTickResult } from "../../../interfaces/Strategy.interface";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { singleshot } from "functools-kit";
import { signalEmitter } from "../../../config/emitters";
import { Report } from "../../../classes/Report";

const SCHEDULE_REPORT_METHOD_NAME_SUBSCRIBE = "ScheduleReportService.subscribe";
const SCHEDULE_REPORT_METHOD_NAME_UNSUBSCRIBE = "ScheduleReportService.unsubscribe";
const SCHEDULE_REPORT_METHOD_NAME_TICK = "ScheduleReportService.tick";

export class ScheduleReportService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private tick = async (data: IStrategyTickResult) => {
    this.loggerService.log(SCHEDULE_REPORT_METHOD_NAME_TICK, { data });

    const baseEvent = {
      symbol: data.symbol,
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      backtest: data.backtest,
      currentPrice: data.currentPrice,
    };

    const searchOptions = {
      symbol: data.symbol,
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      signalId: data.signal?.id,
      walkerName: "",
    };

    if (data.action === "scheduled") {
      await Report.writeData("schedule", {
        timestamp: data.signal?.scheduledAt,
        action: "scheduled",
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
        pendingAt: data.signal?.pendingAt,
        minuteEstimatedTime: data.signal?.minuteEstimatedTime,
      }, searchOptions);
    } else if (data.action === "opened") {
      if (data.signal?.scheduledAt !== data.signal?.pendingAt) {
        const durationMs = data.signal?.pendingAt - data.signal?.scheduledAt;
        const durationMin = Math.round(durationMs / 60000);

        await Report.writeData("schedule", {
          timestamp: data.signal?.pendingAt,
          action: "opened",
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
          scheduledAt: data.signal?.scheduledAt,
          pendingAt: data.signal?.pendingAt,
          minuteEstimatedTime: data.signal?.minuteEstimatedTime,
          duration: durationMin,
        }, searchOptions);
      }
    } else if (data.action === "cancelled") {
      const durationMs = data.closeTimestamp - data.signal?.scheduledAt;
      const durationMin = Math.round(durationMs / 60000);

      await Report.writeData("schedule", {
        timestamp: data.closeTimestamp,
        action: "cancelled",
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
        scheduledAt: data.signal?.scheduledAt,
        pendingAt: data.signal?.pendingAt,
        minuteEstimatedTime: data.signal?.minuteEstimatedTime,
        closeTime: data.closeTimestamp,
        duration: durationMin,
        cancelReason: data.reason,
        cancelId: data.cancelId,
      }, searchOptions);
    }
  };

  public subscribe = singleshot(() => {
    this.loggerService.log(SCHEDULE_REPORT_METHOD_NAME_SUBSCRIBE);
    const unsubscribe = signalEmitter.subscribe(this.tick);
    return () => {
      this.subscribe.clear();
      unsubscribe();
    };
  });

  public unsubscribe = async () => {
    this.loggerService.log(SCHEDULE_REPORT_METHOD_NAME_UNSUBSCRIBE);
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };
}

export default ScheduleReportService;

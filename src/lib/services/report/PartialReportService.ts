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

export class PartialReportService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

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

  public unsubscribe = async () => {
    this.loggerService.log(PARTIAL_REPORT_METHOD_NAME_UNSUBSCRIBE);
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };
}

export default PartialReportService;

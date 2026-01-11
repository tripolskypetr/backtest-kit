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

    if (data.action !== "closed") {
      return;
    }

    await Report.writeData("backtest", {
      timestamp: Date.now(),
      action: data.action,
      symbol: data.symbol,
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      backtest: true,
      signalId: data.signal?.id,
      position: data.signal?.position,
      pnl: data.pnl.pnlPercentage,
      closeReason: data.closeReason,
      openTime: data.signal?.pendingAt,
      closeTime: data.closeTimestamp,
      priceOpen: data.signal?.priceOpen,
      priceTakeProfit: data.signal?.priceTakeProfit,
      priceStopLoss: data.signal?.priceStopLoss,
      currentPrice: data.currentPrice,
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

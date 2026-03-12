import { IPublicSignalRow } from "../../../interfaces/Strategy.interface";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { singleshot } from "functools-kit";
import { highestProfitSubject } from "../../../config/emitters";
import { Report } from "../../../classes/Report";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";

const HIGHEST_PROFIT_REPORT_METHOD_NAME_SUBSCRIBE = "HighestProfitReportService.subscribe";
const HIGHEST_PROFIT_REPORT_METHOD_NAME_UNSUBSCRIBE = "HighestProfitReportService.unsubscribe";
const HIGHEST_PROFIT_REPORT_METHOD_NAME_TICK = "HighestProfitReportService.tick";

/**
 * Service for logging highest profit events to the JSONL report database.
 *
 * Listens to highestProfitSubject and writes each new price record to
 * Report.writeData() for persistence and analytics.
 */
export class HighestProfitReportService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private tick = async (data: {
    symbol: string;
    signal: IPublicSignalRow;
    currentPrice: number;
    backtest: boolean;
    timestamp: number;
    exchangeName: ExchangeName;
    frameName: FrameName;
  }) => {
    this.loggerService.log(HIGHEST_PROFIT_REPORT_METHOD_NAME_TICK, { data });

    await Report.writeData("highest_profit", {
      timestamp: data.timestamp,
      symbol: data.symbol,
      strategyName: data.signal.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      backtest: data.backtest,
      signalId: data.signal.id,
      position: data.signal.position,
      currentPrice: data.currentPrice,
      priceOpen: data.signal.priceOpen,
      priceTakeProfit: data.signal.priceTakeProfit,
      priceStopLoss: data.signal.priceStopLoss,
    }, {
      symbol: data.symbol,
      strategyName: data.signal.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      signalId: data.signal.id,
      walkerName: "",
    });
  };

  public subscribe = singleshot(() => {
    this.loggerService.log(HIGHEST_PROFIT_REPORT_METHOD_NAME_SUBSCRIBE);
    const unsub = highestProfitSubject.subscribe(this.tick);
    return () => {
      this.subscribe.clear();
      unsub();
    };
  });

  public unsubscribe = async () => {
    this.loggerService.log(HIGHEST_PROFIT_REPORT_METHOD_NAME_UNSUBSCRIBE);
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };
}

export default HighestProfitReportService;

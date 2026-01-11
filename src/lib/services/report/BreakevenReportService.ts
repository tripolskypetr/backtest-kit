import { ISignalRow } from "../../../interfaces/Strategy.interface";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { singleshot } from "functools-kit";
import { breakevenSubject } from "../../../config/emitters";
import { Report } from "../../../classes/Report";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";

const BREAKEVEN_REPORT_METHOD_NAME_SUBSCRIBE = "BreakevenReportService.subscribe";
const BREAKEVEN_REPORT_METHOD_NAME_UNSUBSCRIBE = "BreakevenReportService.unsubscribe";
const BREAKEVEN_REPORT_METHOD_NAME_TICK = "BreakevenReportService.tickBreakeven";

export class BreakevenReportService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private tickBreakeven = async (data: {
    symbol: string;
    data: ISignalRow;
    currentPrice: number;
    backtest: boolean;
    timestamp: number;
    exchangeName: ExchangeName;
    frameName: FrameName;
  }) => {
    this.loggerService.log(BREAKEVEN_REPORT_METHOD_NAME_TICK, { data });

    await Report.writeData("breakeven", {
      timestamp: data.timestamp,
      symbol: data.symbol,
      strategyName: data.data.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      backtest: data.backtest,
      signalId: data.data.id,
      position: data.data.position,
      currentPrice: data.currentPrice,
      priceOpen: data.data.priceOpen,
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
    this.loggerService.log(BREAKEVEN_REPORT_METHOD_NAME_SUBSCRIBE);
    const unsubscribe = breakevenSubject.subscribe(this.tickBreakeven);
    return () => {
      this.subscribe.clear();
      unsubscribe();
    };
  });

  public unsubscribe = async () => {
    this.loggerService.log(BREAKEVEN_REPORT_METHOD_NAME_UNSUBSCRIBE);
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };
}

export default BreakevenReportService;

import { WalkerContract } from "../../../contract/Walker.contract";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { singleshot } from "functools-kit";
import { walkerEmitter } from "../../../config/emitters";
import { Report } from "../../../classes/Report";

const WALKER_REPORT_METHOD_NAME_SUBSCRIBE = "WalkerReportService.subscribe";
const WALKER_REPORT_METHOD_NAME_UNSUBSCRIBE = "WalkerReportService.unsubscribe";
const WALKER_REPORT_METHOD_NAME_TICK = "WalkerReportService.tick";

export class WalkerReportService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private tick = async (data: WalkerContract) => {
    this.loggerService.log(WALKER_REPORT_METHOD_NAME_TICK, { data });

    await Report.writeData("walker", {
      timestamp: Date.now(),
      walkerName: data.walkerName,
      symbol: data.symbol,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      strategyName: data.strategyName,
      metric: data.metric,
      metricValue: data.metricValue,
      strategiesTested: data.strategiesTested,
      totalStrategies: data.totalStrategies,
      bestStrategy: data.bestStrategy,
      bestMetric: data.bestMetric,
      totalSignals: data.stats.totalSignals,
      winCount: data.stats.winCount,
      lossCount: data.stats.lossCount,
      winRate: data.stats.winRate,
      avgPnl: data.stats.avgPnl,
      totalPnl: data.stats.totalPnl,
      stdDev: data.stats.stdDev,
      sharpeRatio: data.stats.sharpeRatio,
      annualizedSharpeRatio: data.stats.annualizedSharpeRatio,
      certaintyRatio: data.stats.certaintyRatio,
      expectedYearlyReturns: data.stats.expectedYearlyReturns,
    }, {
      symbol: data.symbol,
      strategyName: data.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      signalId: "",
      walkerName: data.walkerName,
    });
  };

  public subscribe = singleshot(() => {
    this.loggerService.log(WALKER_REPORT_METHOD_NAME_SUBSCRIBE);
    const unsubscribe = walkerEmitter.subscribe(this.tick);
    return () => {
      this.subscribe.clear();
      unsubscribe();
    };
  });

  public unsubscribe = async () => {
    this.loggerService.log(WALKER_REPORT_METHOD_NAME_UNSUBSCRIBE);
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };
}

export default WalkerReportService;

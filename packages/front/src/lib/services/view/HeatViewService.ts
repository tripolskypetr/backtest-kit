import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { Backtest, Heat, Live } from "tradeforge";
import { getConfig } from "../../../config/params";
import HeatMockService from "../mock/HeatMockService";

export class HeatViewService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private readonly heatMockService = inject<HeatMockService>(TYPES.heatMockService);

  public getStrategyHeatData = async () => {
    this.loggerService.log("heatViewService getStrategyHeatData");

    if (getConfig().CC_ENABLE_MOCK) {
        return await this.heatMockService.getStrategyHeatData();
    }

    const [backtestItem] = await Backtest.list();
    const [liveItem] = await Live.list();

    if (backtestItem) {
      return await Heat.getData({
        strategyName: backtestItem.strategyName,
        exchangeName: backtestItem.exchangeName,
        frameName: backtestItem.frameName,
      }, true);
    }

    if (liveItem) {
      return await Heat.getData({
        strategyName: liveItem.strategyName,
        exchangeName: liveItem.exchangeName,
        frameName: "",
      }, false);
    }

    return null;
  };

  public getStrategyHeatReport = async () => {
    this.loggerService.log("heatViewService getStrategyHeatReport");

    if (getConfig().CC_ENABLE_MOCK) {
      return await this.heatMockService.getStrategyHeatReport();
    }

    const [backtestItem] = await Backtest.list();
    const [liveItem] = await Live.list();

    if (backtestItem) {
      return await Heat.getReport({
        strategyName: backtestItem.strategyName,
        exchangeName: backtestItem.exchangeName,
        frameName: backtestItem.frameName,
      }, true);
    }

    if (liveItem) {
      return await Heat.getReport({
        strategyName: liveItem.strategyName,
        exchangeName: liveItem.exchangeName,
        frameName: "",
      }, false);
    }

    return null;
  };
}

export default HeatViewService;

import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { Backtest, Heat, Live } from "backtest-kit";
import { CC_ENABLE_MOCK } from "../../../config/params";
import HeatMockService from "../mock/HeatMockService";

export class HeatViewService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private readonly heatMockService = inject<HeatMockService>(TYPES.heatMockService);

  public getStrategyHeat = async () => {
    this.loggerService.log("heatViewService getStrategyHeat");

    if (CC_ENABLE_MOCK) {
        return await this.heatMockService.getStrategyHeat();
    }

    const [backtestItem] = await Backtest.list();
    const [liveItem] = await Live.list();

    if (backtestItem) {
      return await Heat.getData({
        strategyName: backtestItem.strategyName,
        exchangeName: backtestItem.exchangeName,
        frameName: backtestItem.frameName,
      });
    }

    if (liveItem) {
      return await Heat.getData({
        strategyName: liveItem.strategyName,
        exchangeName: liveItem.exchangeName,
        frameName: "",
      });
    }

    return null;
  };
}

export default HeatViewService;

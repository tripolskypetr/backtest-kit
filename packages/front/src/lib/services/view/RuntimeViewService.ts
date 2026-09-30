import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { Backtest, IRuntimeInfo, lib, Live } from "tradeforge";
import { getConfig } from "../../../config/params";
import RuntimeMockService from "../mock/RuntimeMockService";

export class RuntimeViewService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private readonly runtimeMockService = inject<RuntimeMockService>(TYPES.runtimeMockService);

  public getRuntimeInfo = async (): Promise<IRuntimeInfo> => {
    this.loggerService.log("runtimeViewService getRuntimeInfo");

    if (getConfig().CC_ENABLE_MOCK) {
      return await this.runtimeMockService.getRuntimeInfo();
    }

    const [backtestItem] = await Backtest.list();
    const [liveItem] = await Live.list();

    if (backtestItem) {
      return await lib.runtimeMetaService.getRuntimeInfo(
        backtestItem.symbol,
        {
          strategyName: backtestItem.strategyName,
          exchangeName: backtestItem.exchangeName,
          frameName: backtestItem.frameName,
        },
        true,
      )
    }

    if (liveItem) {
      return await lib.runtimeMetaService.getRuntimeInfo(
        liveItem.symbol,
        {
          strategyName: liveItem.strategyName,
          exchangeName: liveItem.exchangeName,
          frameName: "",
        },
        false,
      )
    }

    return null;
  };
}

export default RuntimeViewService;

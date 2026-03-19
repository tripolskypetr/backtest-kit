import LoggerService from "../base/LoggerService";
import { fetchApi, inject, randomString } from "react-declarative";
import TYPES from "../../core/TYPES";
import { CC_CLIENT_ID, CC_SERVICE_NAME, CC_USER_ID } from "../../../config/params";
import { HeatmapStatisticsModel } from "backtest-kit";

export class HeatMockService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public getStrategyHeat = async (): Promise<HeatmapStatisticsModel> => {
    this.loggerService.log("heatMockService getStrategyHeat");
    const { data, error } = await fetchApi("/api/v1/mock/heat", {
      method: "POST",
      body: JSON.stringify({
        clientId: CC_CLIENT_ID,
        serviceName: CC_SERVICE_NAME,
        userId: CC_USER_ID,
        requestId: randomString(),
      }),
    });
    if (error) {
      throw new Error(error);
    }
    return data;
  };
}

export default HeatMockService;

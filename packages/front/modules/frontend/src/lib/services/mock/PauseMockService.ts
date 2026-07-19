import LoggerService from "../base/LoggerService";
import { fetchApi, inject, randomString } from "react-declarative";
import TYPES from "../../core/TYPES";
import { CC_CLIENT_ID, CC_SERVICE_NAME, CC_USER_ID } from "../../../config/params";

export class PauseMockService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public getPaused = async (
    symbol: string,
    context: { strategyName: string; exchangeName: string },
  ): Promise<boolean> => {
    this.loggerService.log("pauseMockService getPaused", { symbol, context });
    const { data, error } = await fetchApi("/api/v1/mock/pause_status", {
      method: "POST",
      body: JSON.stringify({
        clientId: CC_CLIENT_ID,
        serviceName: CC_SERVICE_NAME,
        userId: CC_USER_ID,
        requestId: randomString(),
        symbol,
        context,
      }),
    });
    if (error) {
      throw new Error(error);
    }
    return data;
  };

  public setPaused = async (
    symbol: string,
    context: { strategyName: string; exchangeName: string },
    paused: boolean,
  ): Promise<void> => {
    this.loggerService.log("pauseMockService setPaused", {
      symbol,
      context,
      paused,
    });
    const { error } = await fetchApi("/api/v1/mock/pause_set", {
      method: "POST",
      body: JSON.stringify({
        clientId: CC_CLIENT_ID,
        serviceName: CC_SERVICE_NAME,
        userId: CC_USER_ID,
        requestId: randomString(),
        symbol,
        context,
        paused,
      }),
    });
    if (error) {
      throw new Error(error);
    }
  };
}

export default PauseMockService;

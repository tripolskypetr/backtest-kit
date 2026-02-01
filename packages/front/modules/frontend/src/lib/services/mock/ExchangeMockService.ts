import { fetchApi, inject, randomString } from "react-declarative";
import TYPES from "../../core/TYPES";
import LoggerService from "../base/LoggerService";
import { CandleInterval, ICandleData } from "backtest-kit";
import { CC_CLIENT_ID, CC_SERVICE_NAME, CC_USER_ID } from "../../../config/params";

export class ExchangeMockService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public getSignalCandles = async (signalId: string, interval: CandleInterval): Promise<ICandleData> => {
    this.loggerService.log("exchangeMockService getSignalCandles", {
      signalId,
      interval,
    });
    const { data, error } = await fetchApi("/api/v1/mock/candles_signal", {
      method: "POST",
      body: JSON.stringify({
        clientId: CC_CLIENT_ID,
        serviceName: CC_SERVICE_NAME,
        userId: CC_USER_ID,
        requestId: randomString(),
        signalId,
        interval,
      }),
    });
    if (error) {
      throw new Error(error);
    }
    return data;
  };

  public getPointCandles = async (dto: {
    currentTime: number;
    interval: CandleInterval;
    symbol: string;
    exchangeName: string;
  }): Promise<ICandleData> => {
    this.loggerService.log("exchangeMockService getPointCandles", {
      dto,
    });
    const { data, error } = await fetchApi("/api/v1/mock/candles_point", {
      method: "POST",
      body: JSON.stringify({
        clientId: CC_CLIENT_ID,
        serviceName: CC_SERVICE_NAME,
        userId: CC_USER_ID,
        requestId: randomString(),
        ...dto,
      }),
    });
    if (error) {
      throw new Error(error);
    }
    return data;
  };
}

export default ExchangeMockService;

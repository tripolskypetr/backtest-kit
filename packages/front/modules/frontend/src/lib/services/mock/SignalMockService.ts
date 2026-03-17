import LoggerService from "../base/LoggerService";
import { fetchApi, inject, randomString } from "react-declarative";
import TYPES from "../../core/TYPES";
import { CC_CLIENT_ID, CC_SERVICE_NAME, CC_USER_ID } from "../../../config/params";

export class SignalMockService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public getLastUpdateTimestamp = async (signalId: string): Promise<number> => {
    this.loggerService.log("signalMockService getLastUpdateTimestamp", {
      signalId,
    });
    const { data, error } = await fetchApi(`/api/v1/mock/signal_last_update/${signalId}`, {
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

export default SignalMockService;

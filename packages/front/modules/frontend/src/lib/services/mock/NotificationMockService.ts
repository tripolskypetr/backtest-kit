import { fetchApi, inject, randomString } from "react-declarative";
import LoggerService from "../base/LoggerService";
import TYPES from "../../core/TYPES";
import { NotificationModel } from "backtest-kit";
import { CC_CLIENT_ID, CC_SERVICE_NAME, CC_USER_ID } from "../../../config/params";

export class NotificationMockService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public getData = async (): Promise<NotificationModel> => {
    this.loggerService.log("notificationMockService getData");
    const { data, error } = await fetchApi("/api/v1/mock/notification", {
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

export default NotificationMockService;

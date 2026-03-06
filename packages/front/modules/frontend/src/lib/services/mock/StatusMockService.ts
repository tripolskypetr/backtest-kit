import LoggerService from "../base/LoggerService";
import { fetchApi, inject, randomString } from "react-declarative";
import TYPES from "../../core/TYPES";
import { CC_CLIENT_ID, CC_SERVICE_NAME, CC_USER_ID } from "../../../config/params";
import IStatusOne from "../../../model/Status.model";

export class StatusMockService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public getStatusList = async () => {
    this.loggerService.log("statusMockService getStatusList");
    const { data, error } = await fetchApi("/api/v1/mock/status_list", {
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

  public getStatusMap = async () => {
    this.loggerService.log("statusMockService getStatusMap");
    const list = await this.getStatusList();
    return (list as { id: string }[]).reduce(
      (acm, cur) => ({ ...acm, [cur.id]: cur }),
      {},
    );
  };

  public getStatusOne = async (id: string): Promise<IStatusOne | null> => {
    this.loggerService.log("statusMockService getStatusOne", { id });
    const { data, error } = await fetchApi(`/api/v1/mock/status_one/${id}`, {
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

export default StatusMockService;

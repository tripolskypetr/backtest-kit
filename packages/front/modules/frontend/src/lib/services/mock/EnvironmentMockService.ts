import LoggerService from "../base/LoggerService";
import { fetchApi, inject, randomString } from "react-declarative";
import TYPES from "../../core/TYPES";
import { CC_CLIENT_ID, CC_SERVICE_NAME, CC_USER_ID } from "../../../config/params";

export interface EnvironmentData {
  quickchart_host: string;
  telegram_channel: string;
  wwwroot_host: string;
  wwwroot_path: string;
  wwwroot_port: number;
}

export class EnvironmentMockService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public getEnvironmentData = async (): Promise<EnvironmentData> => {
    this.loggerService.log("environmentMockService getEnvironmentData");
    const { data, error } = await fetchApi("/api/v1/mock/environment_data", {
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

export default EnvironmentMockService;

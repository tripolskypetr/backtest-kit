import LoggerService from "../base/LoggerService";
import { fetchApi, inject, randomString } from "react-declarative";
import TYPES from "../../core/TYPES";
import { CC_CLIENT_ID, CC_SERVICE_NAME, CC_USER_ID } from "../../../config/params";

export interface SetupData {
  broker_enabled: boolean;
  dump_enabled: boolean;
  markdown_enabled: boolean;
  memory_enabled: boolean;
  notification_enabled: boolean;
  recent_enabled: boolean;
  report_enabled: boolean;
  state_enabled: boolean;
  storage_enabled: boolean;
  running_mode: "backtest" | "live" | "none";
  enable_long: boolean;
  enable_short: boolean;
}

export class SetupMockService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public getSetupData = async (): Promise<SetupData> => {
    this.loggerService.log("setupMockService getSetupData");
    const { data, error } = await fetchApi("/api/v1/mock/setup_data", {
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

export default SetupMockService;

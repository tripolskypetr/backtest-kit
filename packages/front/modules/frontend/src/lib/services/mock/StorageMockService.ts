import { type IStorageSignalRow } from "backtest-kit";
import LoggerService from "../base/LoggerService";
import { fetchApi, inject, randomString } from "react-declarative";
import TYPES from "../../core/TYPES";
import { CC_CLIENT_ID, CC_SERVICE_NAME, CC_USER_ID } from "../../../config/params";

export class StorageMockService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public findSignalById = async (signalId: string): Promise<IStorageSignalRow | null> => {
    this.loggerService.log("storageMockService findSignalById", {
      signalId,
    });
    const { data, error } = await fetchApi(`/api/v1/mock/storage_one/${signalId}`, {
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

  public listSignalLive = async (): Promise<IStorageSignalRow[]> => {
    this.loggerService.log("storageMockService listSignalLive");
    const { data, error } = await fetchApi("/api/v1/mock/storage_list/live", {
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

  public listSignalBacktest = async (): Promise<IStorageSignalRow[]> => {
    this.loggerService.log("storageMockService listSignalBacktest");
    const { data, error } = await fetchApi("/api/v1/mock/storage_list/backtest", {
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

export default StorageMockService;

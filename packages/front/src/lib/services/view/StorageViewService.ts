import { Storage } from "backtest-kit";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { singleshot } from "functools-kit";
import StorageMockService from "../mock/StorageMockService";
import { CC_ENABLE_MOCK } from "../../../config/params";

export class StorageViewService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly storageMockService = inject<StorageMockService>(TYPES.storageMockService);

  public findSignalById = async (signalId: string) => {
    this.loggerService.log("storageViewService findSignalById", {
      signalId,
    });
    if (CC_ENABLE_MOCK) {
      return await this.storageMockService.findSignalById(signalId);
    }
    return await Storage.findSignalById(signalId);
  };

  public listSignalLive = async () => {
    this.loggerService.log("storageViewService listSignalLive");
    if (CC_ENABLE_MOCK) {
      return await this.storageMockService.listSignalLive();
    }
    return await Storage.listSignalLive();
  }

  public listSignalBacktest = async () => {
    this.loggerService.log("storageViewService listSignalBacktest");
    if (CC_ENABLE_MOCK) {
      return await this.storageMockService.listSignalBacktest();
    }
    return await Storage.listSignalBacktest();
  }

  protected init = singleshot(async () => {
    this.loggerService.log("storageViewService init");
    if (CC_ENABLE_MOCK) {
      return;
    }
    Storage.enable();
  });
}

export default StorageViewService;

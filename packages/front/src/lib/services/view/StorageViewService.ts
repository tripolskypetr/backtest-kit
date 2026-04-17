import { Storage } from "backtest-kit";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { singleshot } from "functools-kit";
import StorageMockService from "../mock/StorageMockService";
import { CC_ENABLE_MOCK } from "../../../config/params";

export class StorageViewService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly storageMockService = inject<StorageMockService>(
    TYPES.storageMockService,
  );

  public findSignalById = async (signalId: string) => {
    this.loggerService.log("storageViewService findSignalById", {
      signalId,
    });
    if (CC_ENABLE_MOCK) {
      return await this.storageMockService.findSignalById(signalId);
    }
    if (!Storage.enable.hasValue()) {
      console.warn("@backtest-kit/ui storageViewService findSignalById storage not enabled");
      return null;
    }
    return await Storage.findSignalById(signalId);
  };

  public listSignalLive = async () => {
    this.loggerService.log("storageViewService listSignalLive");
    if (CC_ENABLE_MOCK) {
      return await this.storageMockService.listSignalLive();
    }
    if (!Storage.enable.hasValue()) {
      console.warn("@backtest-kit/ui storageViewService listSignalLive storage not enabled");
      return [];
    }
    const signalList = await Storage.listSignalLive();
    signalList.sort((a, b) => {
      const aHasTime = "createdAt" in a;
      const bHasTime = "createdAt" in b;
      if (!aHasTime && bHasTime) {
        return -1;
      }
      if (aHasTime && !bHasTime) {
        return 1;
      }
      const aTime = aHasTime ? a.createdAt : 0;
      const bTime = bHasTime ? b.createdAt : 0;
      return bTime - aTime;
    });
    return signalList;
  };

  public listSignalBacktest = async () => {
    this.loggerService.log("storageViewService listSignalBacktest");
    if (CC_ENABLE_MOCK) {
      return await this.storageMockService.listSignalBacktest();
    }
    if (!Storage.enable.hasValue()) {
      console.warn("@backtest-kit/ui storageViewService listSignalBacktest storage not enabled");
      return [];
    }
    const signalList = await Storage.listSignalBacktest();
    signalList.sort((a, b) => {
      const aHasTime = "createdAt" in a;
      const bHasTime = "createdAt" in b;
      if (!aHasTime && bHasTime) {
        return -1;
      }
      if (aHasTime && !bHasTime) {
        return 1;
      }
      const aTime = aHasTime ? a.createdAt : 0;
      const bTime = bHasTime ? b.createdAt : 0;
      return bTime - aTime;
    });
    return signalList;
  };
}

export default StorageViewService;

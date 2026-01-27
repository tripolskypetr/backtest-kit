import { Storage } from "backtest-kit";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { singleshot } from "functools-kit";

export class StorageViewService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public findSignalById = async (signalId: string) => {
    this.loggerService.log("storageViewService findSignalById", {
      signalId,
    });
    return await Storage.findSignalById(signalId);
  };

  public listSignalLive = async () => {
    this.loggerService.log("storageViewService listSignalLive");
    return await Storage.listSignalLive();
  }

  public listSignalBacktest = async () => {
    this.loggerService.log("storageViewService listSignalBacktest");
    return await Storage.listSignalBacktest();
  }

  protected init = singleshot(async () => {
    this.loggerService.log("storageViewService init");
    Storage.enable();
  });
}

export default StorageViewService;

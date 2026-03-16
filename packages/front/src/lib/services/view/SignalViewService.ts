import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { StorageBacktest, StorageLive } from "backtest-kit";

export class SignalViewService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public getLastUpdateTimestamp = async (
    signalId: string,
  ) => {
    this.loggerService.log("signalViewService getLastUpdateTimestamp", {
        signalId,
    });
    {
        const liveSignal = await StorageLive.findById(signalId);
        if (liveSignal) {
            return liveSignal.updatedAt;
        }
    }
    {
        const backtestSignal = await StorageBacktest.findById(signalId);
        if (backtestSignal) {
            return backtestSignal.updatedAt;
        }
    }
    throw new Error(`SignalViewService getLastUpdateTimestamp signal not found signalId=${signalId}`)
  };
}

export default SignalViewService;

import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { Backtest, Exchange, Live, StorageBacktest, StorageLive } from "backtest-kit";
import SignalMockService from "../mock/SignalMockService";
import { CC_ENABLE_MOCK } from "../../../config/params";

export class SignalViewService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly signalMockService = inject<SignalMockService>(TYPES.signalMockService);

  public getLastUpdateTimestamp = async (
    signalId: string,
  ) => {
    this.loggerService.log("signalViewService getLastUpdateTimestamp", {
        signalId,
    });
    if (CC_ENABLE_MOCK) {
        return await this.signalMockService.getLastUpdateTimestamp(signalId);
    }
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

  public getPendingSignal = async (symbol: string) => {
    this.loggerService.log("signalViewService getPendingSignal", {
        symbol,
    });
    if (CC_ENABLE_MOCK) {
        return await this.signalMockService.getPendingSignal(symbol);
    }
    {
        const liveList = await Live.list();
        const liveTarget = liveList.find((live) => live.symbol === symbol);
        if (liveTarget) {
            const currentPrice = await Exchange.getAveragePrice(symbol, {
                exchangeName: liveTarget.exchangeName,
            })
            return await Live.getPendingSignal(symbol, currentPrice, {
                strategyName: liveTarget.strategyName,
                exchangeName: liveTarget.exchangeName,
            });
        }
    }
    return null;
  }
}

export default SignalViewService;

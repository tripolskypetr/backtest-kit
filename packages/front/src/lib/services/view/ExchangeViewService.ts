import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { inject } from "../../../lib/core/di";
import { CandleInterval } from "backtest-kit";
import StorageViewService from "./StorageViewService";
import ExchangeService from "../base/ExchangeService";
import ExchangeMockService from "../mock/ExchangeMockService";
import { CC_ENABLE_MOCK } from "../../../config/params";

export class ExchangeViewService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly storageViewService = inject<StorageViewService>(
    TYPES.storageViewService,
  );
  private readonly exchangeService = inject<ExchangeService>(
    TYPES.exchangeService,
  );
  private readonly exchangeMockService = inject<ExchangeMockService>(TYPES.exchangeMockService);

  public getSignalCandles = async (signalId: string, interval: CandleInterval) => {
    this.loggerService.log("exchangeViewService getCandles", {
      signalId,
      interval,
    });
    if (CC_ENABLE_MOCK) {
      return await this.exchangeMockService.getSignalCandles(signalId, interval);
    }
    const signal = await this.storageViewService.findSignalById(signalId);
    if (!signal) {
      throw new Error(`Signal with ID ${signalId} not found`);
    }
    const {
      pendingAt,
      scheduledAt,
      createdAt = pendingAt || scheduledAt,
      updatedAt,
    } = signal;
    return await this.exchangeService.getRangeCandles({
      symbol: signal.symbol,
      exchangeName: signal.exchangeName,
      signalStartTime: createdAt,
      signalStopTime: updatedAt,
      interval,
    });
  };
}

export default ExchangeViewService;

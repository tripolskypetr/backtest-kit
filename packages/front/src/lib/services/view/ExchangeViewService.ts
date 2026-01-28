import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { inject } from "../../../lib/core/di";
import { CandleInterval } from "backtest-kit";
import StorageViewService from "./StorageViewService";
import ExchangeService from "../base/ExchangeService";

export class ExchangeViewService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly storageViewService = inject<StorageViewService>(
    TYPES.storageViewService,
  );
  private readonly exchangeService = inject<ExchangeService>(
    TYPES.exchangeService,
  );

  public getCandles = async (signalId: string, interval: CandleInterval) => {
    this.loggerService.log("exchangeViewService getCandles", {
      signalId,
      interval,
    });
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
    return await this.exchangeService.getCandles({
      symbol: signal.symbol,
      exchangeName: signal.exchangeName,
      signalStartTime: createdAt,
      signalStopTime: updatedAt,
      interval,
    });
  };
}

export default ExchangeViewService;

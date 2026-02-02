import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { inject } from "../../../lib/core/di";
import { CandleInterval } from "backtest-kit";
import StorageMockService from "./StorageMockService";
import ExchangeService from "../base/ExchangeService";

export class ExchangeMockService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly storageMockService = inject<StorageMockService>(
    TYPES.storageMockService,
  );
  private readonly exchangeService = inject<ExchangeService>(
    TYPES.exchangeService,
  );

  public getSignalCandles = async (signalId: string, interval: CandleInterval) => {
    this.loggerService.log("exchangeMockService getSignalCandles", {
      signalId,
      interval,
    });
    const signal = await this.storageMockService.findSignalById(signalId);
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

export default ExchangeMockService;

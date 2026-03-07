import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { inject } from "../../../lib/core/di";
import { CandleInterval } from "backtest-kit";
import StorageMockService from "./StorageMockService";
import ExchangeService from "../base/ExchangeService";

const MS_PER_MINUTE = 60_000;

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

  public getLiveCandles = async (signalId: string, interval: CandleInterval) => {
    this.loggerService.log("exchangeMockService getLiveCandles", {
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
      minuteEstimatedTime,
    } = signal;
    const eventAt = pendingAt || scheduledAt;
    return await this.exchangeService.getRangeCandles({
      symbol: signal.symbol,
      exchangeName: signal.exchangeName,
      signalStartTime: eventAt,
      signalStopTime: eventAt + minuteEstimatedTime * MS_PER_MINUTE,
      interval,
    });
  };
}

export default ExchangeMockService;

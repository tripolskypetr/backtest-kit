import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { inject } from "../../../lib/core/di";
import { Backtest, CandleInterval, Live, alignToInterval, listExchangeSchema } from "backtest-kit";
import StorageMockService from "./StorageMockService";
import ExchangeService from "../base/ExchangeService";

const HISTORY_LAST_CANDLES_LIMIT = 200;

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
    const { pendingAt, scheduledAt, updatedAt } = signal;
    const eventAt = pendingAt || scheduledAt;
    return await this.exchangeService.getRangeCandles({
      symbol: signal.symbol,
      exchangeName: signal.exchangeName,
      signalStartTime: eventAt,
      signalStopTime: alignToInterval(new Date(updatedAt), interval).getTime(),
      interval,
    });
  };

  
  public getLastCandles = async (symbol: string, interval: CandleInterval) => {
    this.loggerService.log("exchangeMockService getLastCandles", {
      symbol,
      interval,
    });

    const [backtestItem] = await Backtest.list();
    const [liveItem] = await Live.list();

    const [exchangeItem] = await listExchangeSchema();

    if (backtestItem) {
      return await this.exchangeService.getLastCandles({
        symbol,
        limit: HISTORY_LAST_CANDLES_LIMIT,
        exchangeName: backtestItem.exchangeName,
        interval,
      });
    }

    if (liveItem) {
      return await this.exchangeService.getLastCandles({
        symbol,
        limit: HISTORY_LAST_CANDLES_LIMIT,
        exchangeName: liveItem.exchangeName,
        interval,
      });
    }

    if (exchangeItem) {
      return await this.exchangeService.getLastCandles({
        symbol,
        limit: HISTORY_LAST_CANDLES_LIMIT,
        exchangeName: exchangeItem.exchangeName,
        interval,
      });
    }

    throw new Error(`exchangeMockService getLastCandles no pending strategy symbol=${symbol} interval=${interval}`);
  };
}

export default ExchangeMockService;

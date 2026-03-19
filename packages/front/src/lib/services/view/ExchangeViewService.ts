import LoggerService from "../base/LoggerService";
import { TYPES } from "../../../lib/core/types";
import { inject } from "../../../lib/core/di";
import {
  Backtest,
  CandleInterval,
  Live,
  alignToInterval,
  listExchangeSchema,
} from "backtest-kit";
import StorageViewService from "./StorageViewService";
import ExchangeService from "../base/ExchangeService";
import ExchangeMockService from "../mock/ExchangeMockService";
import SignalViewService from "./SignalViewService";
import { CC_ENABLE_MOCK } from "../../../config/params";

const HISTORY_LAST_CANDLES_LIMIT = 200;

export class ExchangeViewService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  private readonly storageViewService = inject<StorageViewService>(
    TYPES.storageViewService,
  );
  private readonly exchangeService = inject<ExchangeService>(
    TYPES.exchangeService,
  );
  private readonly exchangeMockService = inject<ExchangeMockService>(
    TYPES.exchangeMockService,
  );
  private readonly signalViewService = inject<SignalViewService>(
    TYPES.signalViewService,
  );

  public getSignalCandles = async (
    signalId: string,
    interval: CandleInterval,
  ) => {
    this.loggerService.log("exchangeViewService getCandles", {
      signalId,
      interval,
    });
    if (CC_ENABLE_MOCK) {
      return await this.exchangeMockService.getSignalCandles(
        signalId,
        interval,
      );
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

  public getLiveCandles = async (
    signalId: string,
    interval: CandleInterval,
  ) => {
    this.loggerService.log("exchangeViewService getLiveCandles", {
      signalId,
      interval,
    });
    if (CC_ENABLE_MOCK) {
      return await this.exchangeMockService.getLiveCandles(signalId, interval);
    }
    const signal = await this.storageViewService.findSignalById(signalId);
    if (!signal) {
      throw new Error(`Signal with ID ${signalId} not found`);
    }
    const { pendingAt, scheduledAt } = signal;
    const eventAt = pendingAt || scheduledAt;
    const updatedAt =
      await this.signalViewService.getLastUpdateTimestamp(signalId);
    return await this.exchangeService.getRangeCandles({
      symbol: signal.symbol,
      exchangeName: signal.exchangeName,
      signalStartTime: eventAt,
      signalStopTime: alignToInterval(new Date(updatedAt), interval).getTime(),
      interval,
    });
  };

  public getLastCandles = async (symbol: string, interval: CandleInterval) => {
    this.loggerService.log("exchangeViewService getLastCandles", {
      symbol,
      interval,
    });

    if (CC_ENABLE_MOCK) {
      return await this.exchangeMockService.getLastCandles(symbol, interval);
    }

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

    throw new Error(`exchangeViewService getLastCandles no pending strategy symbol=${symbol} interval=${interval}`);
  };
}

export default ExchangeViewService;

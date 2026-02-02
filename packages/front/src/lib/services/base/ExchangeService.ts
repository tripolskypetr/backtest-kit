import { inject } from "../../../lib/core/di";
import LoggerService from "./LoggerService";
import { TYPES } from "../../../lib/core/types";
import { CandleInterval, Exchange } from "backtest-kit";

type ExchangeName = string;

const INTERVAL_MINUTES: Record<CandleInterval, number> = {
  "1m": 1,
  "3m": 3,
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "1h": 60,
  "2h": 120,
  "4h": 240,
  "6h": 360,
  "8h": 480,
};

const STEP_TICKS: Record<CandleInterval, number> = {
  "1m": 960,
  "3m": 960,
  "5m": 960,
  "15m": 960,
  "30m": 960,
  "1h": 960,
  "2h": 960,
  "4h": 960,
  "6h": 960,
  "8h": 960,
};

export class ExchangeService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public getRangeCandles = async (dto: {
    symbol: string;
    interval: CandleInterval;
    exchangeName: ExchangeName;
    signalStartTime: number;
    signalStopTime: number;
  }) => {
    this.loggerService.log("exchangeService getRangeCandles", {
      dto,
    });

    const step = INTERVAL_MINUTES[dto.interval];
    const tick = STEP_TICKS[dto.interval];

    if (!step || !tick) {
      throw new Error(`Unsupported interval: ${dto.interval}`);
    }

    const offsetMs = tick * step * 60 * 1000;

    const sDate = dto.signalStartTime - offsetMs;
    const eDate = Math.min(dto.signalStopTime + offsetMs, Date.now() - 1);

    return await Exchange.getRawCandles(
      dto.symbol,
      dto.interval,
      {
        exchangeName: dto.exchangeName,
      },
      undefined,
      sDate,
      eDate,
    );
  };

  public getPointCandles = async (dto: {
    symbol: string;
    interval: CandleInterval;
    exchangeName: ExchangeName;
    currentTime: number;
  }) => {
    this.loggerService.log("exchangeService getPointCandles", {
      dto,
    });

    const step = INTERVAL_MINUTES[dto.interval];
    const tick = STEP_TICKS[dto.interval];

    if (!step || !tick) {
      throw new Error(`Unsupported interval: ${dto.interval}`);
    }

    const offsetMs = tick * step * 60 * 1000;

    const sDate = dto.currentTime - offsetMs;
    const eDate = Math.min(dto.currentTime + offsetMs, Date.now() - 1);

    return await Exchange.getRawCandles(
      dto.symbol,
      dto.interval,
      {
        exchangeName: dto.exchangeName,
      },
      undefined,
      sDate,
      eDate,
    );
  }
}

export default ExchangeService;

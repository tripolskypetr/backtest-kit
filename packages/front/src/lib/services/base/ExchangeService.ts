import { inject } from "../../../lib/core/di";
import LoggerService from "./LoggerService";
import { TYPES } from "../../../lib/core/types";
import { CandleInterval, Exchange, alignToInterval, listExchangeSchema } from "backtest-kit";

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
  "12h": 720,
  "1d": 1440,
};

/**
 * Candles fetched on each side of the signal window so the chart has room to
 * scroll. Minute intervals keep 960 ticks (16 hours of 1m up to 20 days of
 * 30m). Hour intervals are scaled to the same 40 calendar days 960 × 1h gives,
 * so a coarser interval does not demand more history: the daily count would
 * otherwise reach 2.6 years before the signal — more than many symbols have,
 * and Exchange.getRawCandles rejects a short batch (count mismatch). The
 * daily padding is one quarter.
 */
const STEP_TICKS: Record<CandleInterval, number> = {
  "1m": 960,
  "3m": 960,
  "5m": 960,
  "15m": 960,
  "30m": 960,
  "1h": 960, // 40 days
  "2h": 480, // 40 days
  "4h": 240, // 40 days
  "6h": 160, // 40 days
  "8h": 120, // 40 days
  "12h": 80, // 40 days
  "1d": 90, // 90 days
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
    const eDate = Math.min(dto.signalStopTime + offsetMs, alignToInterval(new Date(), "1m").getTime());

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
    const eDate = Math.min(dto.currentTime + offsetMs, alignToInterval(new Date(), "1m").getTime());

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

  public getLastCandles = async (dto: {
    symbol: string;
    interval: CandleInterval;
    exchangeName: ExchangeName;
    limit: number;
  }) => {
    this.loggerService.log("exchangeService getLastCandles", {
      dto,
    })
    return await Exchange.getCandles(
      dto.symbol,
      dto.interval,
      dto.limit,
      {
        exchangeName: dto.exchangeName,
      },
    );
  }

  public getRawCandles = async (dto: {
    symbol: string;
    interval: CandleInterval;
    limit?: number,
    sDate?: number,
    eDate?: number,
  }) => {
    this.loggerService.log("exchangeService getRawCandles", {
      dto,
    })
    const [exchange = null] = await listExchangeSchema();
    if (exchange === null) {
      throw new Error("exchangeService getRawCandles no exchange registered");
    }
    return await Exchange.getRawCandles(
      dto.symbol,
      dto.interval,
      {
        exchangeName: exchange.exchangeName,
      },
      dto.limit,
      dto.sDate,
      dto.eDate,
    );
  }
}

export default ExchangeService;

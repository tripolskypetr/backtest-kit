import { inject } from "src/lib/core/di";
import LoggerService from "./LoggerService";
import { TYPES } from "src/lib/core/types";
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
  "3m": 320,
  "5m": 192,
  "15m": 64,
  "30m": 32,
  "1h": 16,
  "2h": 8,
  "4h": 4,
  "6h": 2,
  "8h": 2,
};

export class ExchangeService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public getCandles = async (dto: {
    symbol: string;
    interval: CandleInterval;
    exchangeName: ExchangeName;
    currentTime: number;
  }) => {
    this.loggerService.log("exchangeService getCandles", {
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
  };
}

export default ExchangeService;

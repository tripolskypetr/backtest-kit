import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import {
  listFrameSchema,
  checkCandles,
  warmCandles,
  CandleInterval,
  intervalStepMs,
  alignToInterval,
  PersistCandleAdapter,
} from "backtest-kit";
import { getErrorMessage, retry } from "functools-kit";

const GET_TIMEFRAME_RANGE_FN = async (frameName: string) => {
  const frameList = await listFrameSchema();
  const frameSchema = frameList.find(
    (frameSchema) => frameSchema.frameName === frameName,
  );
  if (!frameSchema) {
    throw new Error(`Frame with name ${frameName} not found`);
  }
  const { startDate, endDate } = frameSchema;
  return { startDate, endDate };
};

const CHECK_CANDLES_FN = async (
  interval: CandleInterval,
  dto: {
    symbol: string;
    exchangeName: string;
    from: Date;
    to: Date;
  },
) => {
  const stepMs = intervalStepMs(interval);
  const fromTs = alignToInterval(dto.from, interval).getTime();
  const toTs = alignToInterval(dto.to, interval).getTime();
  const limit = Math.floor((toTs - fromTs) / stepMs);
  if (limit <= 0) {
    throw new Error(
      `checkCandles: empty range for ${dto.symbol} ${interval} [${fromTs}, ${toTs})`,
    );
  }
  const candles = await PersistCandleAdapter.readCandlesData(
    dto.symbol,
    interval,
    dto.exchangeName,
    limit,
    fromTs,
    toTs,
  );
  if (!candles) {
    throw new Error(
      `checkCandles: cache miss for ${dto.symbol} ${interval} [${fromTs}, ${toTs})`,
    );
  }
};

void CHECK_CANDLES_FN;

const CACHE_CANDLES_FN = retry(
  async (
    interval: string,
    dto: {
      symbol: string;
      exchangeName: string;
      from: Date;
      to: Date;
    },
  ) => {
    try {
      process.stdout.write("\n");
      process.stdout.write(
        `Checking candles cache for ${dto.symbol} ${interval} from ${dto.from} to ${dto.to}\n`,
      );
      await checkCandles({
        exchangeName: dto.exchangeName,
        from: dto.from,
        to: dto.to,
        symbol: dto.symbol,
        interval: <CandleInterval>interval,
      });
    } catch (error) {
      process.stdout.write("\n\n");
      process.stdout.write(
        `Caching candles for ${dto.symbol} ${interval} from ${dto.from} to ${dto.to}\n`,
      );
      await warmCandles({
        symbol: dto.symbol,
        exchangeName: dto.exchangeName,
        from: dto.from,
        to: dto.to,
        interval: <CandleInterval>interval,
      });
      throw error;
    }
  },
  2,
);

export class CacheLogicService {
  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public execute = async (
    intervalList: CandleInterval[],
    dto: {
      symbol: string;
      frameName: string;
      exchangeName: string;
    },
  ) => {
    this.loggerService.log("cacheLogicService execute", {
      dto,
    });
    const { startDate, endDate } = await GET_TIMEFRAME_RANGE_FN(dto.frameName);
    try {
      for (const interval of intervalList) {
        await CACHE_CANDLES_FN(interval, {
          symbol: dto.symbol,
          exchangeName: dto.exchangeName,
          from: startDate,
          to: endDate,
        });
      }
    } catch (error) {
      console.log(getErrorMessage(error));
      throw error;
    }
  };
}

export default CacheLogicService;

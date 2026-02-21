import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import {
  listFrameSchema,
  checkCandles,
  warmCandles,
  CandleInterval,
} from "backtest-kit";
import { retry } from "functools-kit";
import { getArgs } from "../../../helpers/getArgs";

const DEFAULT_TIMEFRAME_LIST: CandleInterval[] = ["1m", "15m", "30m", "4h"];

const GET_TIMEFRAME_LIST_FN = async () => {
  const { values } = getArgs();
  if (!values.cache) {
    console.warn(
      `Warning: No cache timeframes provided. Using default timeframes: ${DEFAULT_TIMEFRAME_LIST.join(", ")}`,
    );
    return DEFAULT_TIMEFRAME_LIST;
  }
  return String(values.cache)
    .split(",")
    .map((timeframe) => timeframe.trim());
};

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
      await checkCandles({
        exchangeName: dto.exchangeName,
        from: dto.from,
        to: dto.to,
        symbol: dto.symbol,
        interval: <CandleInterval>interval,
      });
    } catch (error) {
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

  public cacheCandles = async (dto: {
    symbol: string;
    frameName: string;
    exchangeName: string;
  }) => {
    this.loggerService.log("cacheLogicService cacheCandles", {
      dto,
    });
    const { startDate, endDate } = await GET_TIMEFRAME_RANGE_FN(dto.frameName);
    const intervalList = await GET_TIMEFRAME_LIST_FN();
    for (const interval of intervalList) {
      await CACHE_CANDLES_FN(interval, {
        symbol: dto.symbol,
        exchangeName: dto.exchangeName,
        from: startDate,
        to: endDate,
      });
    }
  };
}

export default CacheLogicService;

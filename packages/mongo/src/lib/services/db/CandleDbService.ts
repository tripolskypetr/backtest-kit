import BaseCRUD from "../../common/BaseCRUD";
import { ICandleDto, ICandleRow, CandleModel } from "../../../schema/Candle.schema";
import { readTransform } from "../../../utils/readTransform";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import CandleCacheService from "../cache/CandleCacheService";
import { CandleInterval } from "backtest-kit";

export class CandleDbService extends BaseCRUD(CandleModel) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly candleCacheService = inject<CandleCacheService>(TYPES.candleCacheService);

  public create = async (dto: ICandleDto): Promise<ICandleRow> => {
    this.loggerService.log("candleDbService create", { dto });
    const filter = {
      exchangeName: dto.exchangeName,
      symbol: dto.symbol,
      interval: dto.interval,
      timestamp: dto.timestamp,
    };
    const insertOnly = {
      open: dto.open,
      high: dto.high,
      low: dto.low,
      close: dto.close,
      volume: dto.volume,
    };
    const document = await CandleModel.findOneAndUpdate(
      filter,
      { $setOnInsert: insertOnly },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    const result = readTransform(document.toJSON()) as unknown as ICandleRow;
    await this.candleCacheService.setCandleId(result);
    return result;
  };

  public hasCandle = async (symbol: string, interval: CandleInterval, exchangeName: string, timestamp: number): Promise<boolean> => {
    this.loggerService.log("candleDbService hasCandle", {
      symbol,
      interval,
      exchangeName,
      timestamp,
    });
    const hasInCache = await this.candleCacheService.hasCandleId(
      symbol,
      interval,
      exchangeName,
      timestamp,
    );
    if (hasInCache) {
      return true;
    }
    const hasInMongo = await this.findBySymbolIntervalTimestamp(symbol, interval, exchangeName, timestamp);
    if (hasInMongo) {
      return true;
    }
    return false;
  };

  public findBySymbolIntervalTimestamp = async (symbol: string, interval: CandleInterval, exchangeName: string, timestamp: number): Promise<ICandleRow | null> => {
    this.loggerService.log("candleDbService findBySymbolIntervalTimestamp", { symbol, interval, exchangeName, timestamp });
    const cachedId = await this.candleCacheService.getCandleId(symbol, interval, exchangeName, timestamp);
    if (cachedId) {
      const cached = await super.findByFilter({ _id: cachedId }) as ICandleRow | null;
      if (cached) {
        return cached;
      }
    }
    const result = await super.findByFilter({ symbol, interval, exchangeName, timestamp });
    if (result) {
      await this.candleCacheService.setCandleId(result);
    }
    return result;
  };

}

export default CandleDbService;

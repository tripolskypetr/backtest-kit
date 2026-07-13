import BaseCRUD from "../../common/BaseCRUD";
import { ICandleDto, ICandleRow, CandleModel } from "../../../schema/Candle.schema";
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
    const repo = await this.repo<ICandleRow>();
    // Insert-only, atomic on a single statement (safe on a Postgres cluster).
    //
    // `ON CONFLICT DO NOTHING` cannot RETURNING the conflicting row, which would
    // force a follow-up SELECT — and on a cluster that SELECT may be routed to an
    // async read-replica that has not yet seen the just-inserted row (replication
    // lag), breaking the "resolve only after the row is readable" invariant.
    //
    // Instead we do a no-op `DO UPDATE` that rewrites the natural key to its own
    // EXCLUDED value: the OHLCV columns are never touched (insert-only preserved),
    // but the row is always produced by RETURNING — whether it was inserted now or
    // already existed. Everything happens in one write transaction on the primary.
    const { raw } = await repo
      .createQueryBuilder()
      .insert()
      .values({
        symbol: dto.symbol,
        interval: dto.interval,
        timestamp: dto.timestamp,
        exchangeName: dto.exchangeName,
        open: dto.open,
        high: dto.high,
        low: dto.low,
        close: dto.close,
        volume: dto.volume,
      })
      .orUpdate(["symbol"], ["exchangeName", "symbol", "interval", "timestamp"])
      .returning("*")
      .execute();
    const result = raw[0] as ICandleRow;
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
    const hasInDb = await this.findBySymbolIntervalTimestamp(symbol, interval, exchangeName, timestamp);
    if (hasInDb) {
      return true;
    }
    return false;
  };

  public findBySymbolIntervalTimestamp = async (symbol: string, interval: CandleInterval, exchangeName: string, timestamp: number): Promise<ICandleRow | null> => {
    this.loggerService.log("candleDbService findBySymbolIntervalTimestamp", { symbol, interval, exchangeName, timestamp });
    const cachedId = await this.candleCacheService.getCandleId(symbol, interval, exchangeName, timestamp);
    if (cachedId) {
      const cached = await super.findByFilter({ id: cachedId }) as ICandleRow | null;
      if (cached) {
        return cached;
      }
    }
    const result = await super.findByFilter({ symbol, interval, exchangeName, timestamp }) as ICandleRow | null;
    if (result) {
      await this.candleCacheService.setCandleId(result);
    }
    return result;
  };

}

export default CandleDbService;

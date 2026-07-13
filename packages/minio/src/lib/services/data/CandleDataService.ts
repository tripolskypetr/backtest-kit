import { ICandleDto, ICandleRow } from "../../../schema/Candle.schema";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import { LoggerService } from "../base/LoggerService";
import { CandleInterval } from "backtest-kit";
import BaseStorage from "../../common/BaseStorage";

const GET_STORAGE_KEY_FN = (exchangeName: string, symbol: string, interval: CandleInterval, timestamp: number) => {
    return `${exchangeName}/${symbol}/${interval}/${timestamp}`;
}

export class CandleDataService extends BaseStorage("backtest-kit/candle-items") {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  public create = async (dto: ICandleDto): Promise<ICandleRow> => {
    this.loggerService.log("candleDataService create", { dto });
    const key = GET_STORAGE_KEY_FN(dto.exchangeName, dto.symbol, dto.interval, dto.timestamp);
    const now = new Date();
    const row: ICandleRow = {
      id: key,
      exchangeName: dto.exchangeName,
      symbol: dto.symbol,
      interval: dto.interval,
      timestamp: dto.timestamp,
      open: dto.open,
      high: dto.high,
      low: dto.low,
      close: dto.close,
      volume: dto.volume,
      createDate: now,
      updatedDate: now,
    };
    // Candles are immutable: the row is fully determined by the dto, so an
    // existence check (stat) replaces downloading the stored body.
    if (await this.has(key)) {
      return row;
    }
    await this.set(key, row);
    return row;
  };

  public hasCandle = async (symbol: string, interval: CandleInterval, exchangeName: string, timestamp: number): Promise<boolean> => {
    this.loggerService.log("candleDataService hasCandle", {
      symbol,
      interval,
      timestamp,
    });
    return await this.has(GET_STORAGE_KEY_FN(exchangeName, symbol, interval, timestamp));
  };

  public findBySymbolIntervalTimestamp = async (symbol: string, interval: CandleInterval, exchangeName: string, timestamp: number): Promise<ICandleRow | null> => {
    this.loggerService.log("candleDataService findBySymbolIntervalTimestamp", { symbol, interval, timestamp });
    return await this.get<ICandleRow>(GET_STORAGE_KEY_FN(exchangeName, symbol, interval, timestamp));
  };

}

export default CandleDataService;

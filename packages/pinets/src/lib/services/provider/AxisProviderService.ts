import { CandleInterval, getDate } from "backtest-kit";
import { IProvider } from "../../../interface/Provider.interface";
import { inject } from "../../core/di";
import { CandleModel } from "../../../model/Candle.model";
import { SymbolInfoModel } from "../../../model/SymbolInfo.model";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../core/types";

const MS_PER_MINUTE = 60_000;

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

export const AXIS_SYMBOL = "_AXIS";

export class AxisProviderService implements IProvider {

  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  async getMarketData(
    _: string,
    timeframe: string,
    limit?: number,
    sDate?: number,
    eDate?: number
  ): Promise<any[]> {

    this.loggerService.log("axisProviderService getMarketData", {
      timeframe,
      limit,
      sDate,
      eDate,
    });

    const step = INTERVAL_MINUTES[timeframe as CandleInterval];
    if (!step) {
      throw new Error(
        `AxisProvider getMarketData: unknown timeframe=${timeframe}. Allowed values: ${Object.keys(INTERVAL_MINUTES).join(", ")}`
      );
    }

    const currentDate = await getDate();
    const whenTimestamp = currentDate.getTime();
    const intervalMs = step * MS_PER_MINUTE;

    let sinceTimestamp: number;
    let untilTimestamp: number;
    let calculatedLimit: number;

    if (sDate !== undefined && eDate !== undefined && limit !== undefined) {
      if (sDate >= eDate) {
        throw new Error(
          `AxisProvider getMarketData: sDate (${sDate}) must be < eDate (${eDate})`
        );
      }
      if (eDate > whenTimestamp) {
        throw new Error(
          `AxisProvider getMarketData: eDate (${eDate}) exceeds execution context when (${whenTimestamp}). Look-ahead bias protection.`
        );
      }
      sinceTimestamp = sDate;
      untilTimestamp = eDate;
      calculatedLimit = limit;
    } else if (sDate !== undefined && eDate !== undefined && limit === undefined) {
      if (sDate >= eDate) {
        throw new Error(
          `AxisProvider getMarketData: sDate (${sDate}) must be < eDate (${eDate})`
        );
      }
      if (eDate > whenTimestamp) {
        throw new Error(
          `AxisProvider getMarketData: eDate (${eDate}) exceeds execution context when (${whenTimestamp}). Look-ahead bias protection.`
        );
      }
      sinceTimestamp = sDate;
      untilTimestamp = eDate;
      calculatedLimit = Math.ceil((eDate - sDate) / intervalMs);
      if (calculatedLimit <= 0) {
        throw new Error(
          `AxisProvider getMarketData: calculated limit is ${calculatedLimit}, must be > 0`
        );
      }
    } else if (sDate === undefined && eDate !== undefined && limit !== undefined) {
      if (eDate > whenTimestamp) {
        throw new Error(
          `AxisProvider getMarketData: eDate (${eDate}) exceeds execution context when (${whenTimestamp}). Look-ahead bias protection.`
        );
      }
      untilTimestamp = eDate;
      sinceTimestamp = eDate - limit * intervalMs;
      calculatedLimit = limit;
    } else if (sDate !== undefined && eDate === undefined && limit !== undefined) {
      sinceTimestamp = sDate;
      untilTimestamp = sDate + limit * intervalMs;
      if (untilTimestamp > whenTimestamp) {
        throw new Error(
          `AxisProvider getMarketData: calculated endTimestamp (${untilTimestamp}) exceeds execution context when (${whenTimestamp}). Look-ahead bias protection.`
        );
      }
      calculatedLimit = limit;
    } else if (sDate === undefined && eDate === undefined && limit !== undefined) {
      untilTimestamp = whenTimestamp;
      sinceTimestamp = whenTimestamp - limit * intervalMs;
      calculatedLimit = limit;
    } else {
      throw new Error(
        `AxisProvider getMarketData: invalid parameter combination. ` +
        `Provide one of: (sDate+eDate+limit), (sDate+eDate), (eDate+limit), (sDate+limit), or (limit only). ` +
        `Got: sDate=${sDate}, eDate=${eDate}, limit=${limit}`
      );
    }

    const candles: CandleModel[] = [];
    for (let i = 0; i < calculatedLimit; i++) {
      const openTime = sinceTimestamp + i * intervalMs;
      if (openTime >= untilTimestamp) {
        break;
      }
      candles.push({
        openTime,
        open: 0,
        high: 0,
        low: 0,
        close: 0,
        volume: 0,
      });
    }

    return candles;
  }

  async getSymbolInfo(): Promise<any> {
    this.loggerService.log("axisProviderService getSymbolInfo");
    const result: SymbolInfoModel = {
      ticker: AXIS_SYMBOL,
      tickerid: AXIS_SYMBOL,
      description: "Time Axis",
      type: "index",
      basecurrency: "",
      currency: "",
      timezone: "UTC",
    };
    return result;
  }
}

export default AxisProviderService;

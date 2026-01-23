import { CandleInterval, getRawCandles } from "backtest-kit";
import { IProvider } from "../../../interface/Provider.interface";
import { inject } from "../../core/di";
import { CandleModel } from "../../../model/Candle.model";
import { SymbolInfoModel } from "../../../model/SymbolInfo.model";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../core/types";

export class CandleProviderService implements IProvider {

  private readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  async getMarketData(
    tickerId: string,
    timeframe: string,
    limit?: number,
    sDate?: number,
    eDate?: number,
  ): Promise<any[]> {

    this.loggerService.log("candleProviderService getMarketData", {
      tickerId,
      timeframe,
      limit,
      sDate,
      eDate,
    });

    const symbol = tickerId
      .toUpperCase()
      .replace(/^BINANCE:|^BYBIT:|^OKX:/, "");

    const rawCandles = await getRawCandles(
      symbol,
      <CandleInterval>timeframe,
      limit,
      sDate,
      eDate,
    );
    const candles: CandleModel[] = rawCandles.map((c) => ({
      openTime: c.timestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));

    return candles;
  }

  async getSymbolInfo(tickerId: string): Promise<any> {

    this.loggerService.log("candleProviderService getSymbolInfo", {
      tickerId,
    });

    const symbol = tickerId
      .toUpperCase()
      .replace(/^BINANCE:|^BYBIT:|^OKX:/, "");
    const base = symbol.replace(/USDT$|BUSD$|USD$/, "");
    const quote = symbol.replace(base, "");

    const result: SymbolInfoModel = {
      ticker: symbol,
      tickerid: symbol,
      description: `${base}/${quote}`,
      type: "crypto",
      basecurrency: base,
      currency: quote || "USDT",
      timezone: "UTC",
    };

    return result;
  }
}

export default CandleProviderService;

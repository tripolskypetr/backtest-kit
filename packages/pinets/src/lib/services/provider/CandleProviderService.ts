import {
  CandleInterval,
  Exchange,
  ExecutionContextService,
  getRawCandles,
  MethodContextService,
} from "backtest-kit";
import { IProvider } from "../../../interface/Provider.interface";
import { inject } from "../../core/di";
import { CandleModel } from "../../../model/Candle.model";
import { SymbolInfoModel } from "../../../model/SymbolInfo.model";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../core/types";
import ExchangeContextService, { TExchangeContextService } from "../context/ExchangeContextService";

const GET_RAW_CANDLES_FN = async (
  self: CandleProviderService,
  symbol: string,
  interval: CandleInterval,
  limit?: number,
  sDate?: number,
  eDate?: number,
) => {
  if (ExchangeContextService.hasContext()) {
    return await Exchange.getRawCandles(
      symbol,
      interval,
      self.exchangeContextService.context,
      limit,
      sDate,
      eDate,
    );
  }
  if (!MethodContextService.hasContext()) {
    throw new Error(
      "MethodContextService context is required to get market data for pinets if exchangeName?: string is not specified",
    );
  }
  if (!ExecutionContextService.hasContext()) {
    throw new Error(
      "ExecutionContextService context is required to get market data for pinets if exchangeName?: string is not specified",
    );
  }
  return await getRawCandles(symbol, interval, limit, sDate, eDate);
};

export class CandleProviderService implements IProvider {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);
  readonly exchangeContextService = inject<TExchangeContextService>(TYPES.exchangeContextService);

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

    const rawCandles = await GET_RAW_CANDLES_FN(
      this,
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

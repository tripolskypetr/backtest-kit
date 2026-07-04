import {
  CandleInterval,
  Exchange,
  ExecutionContextService,
  getRawCandles,
  MethodContextService,
  lib,
} from "backtest-kit";
import { IProvider } from "../../../interface/Provider.interface";
import { inject } from "../../core/di";
import { CandleModel } from "../../../model/Candle.model";
import { SymbolInfoModel } from "../../../model/SymbolInfo.model";
import LoggerService from "../base/LoggerService";
import { TYPES } from "../../core/types";
import ExchangeContextService, {
  TExchangeContextService,
} from "../context/ExchangeContextService";
import { INTERVAL_MINUTES } from "./AxisProviderService";

/**
 * Known quote assets for base/quote splitting in getSymbolInfo, longest first.
 * Symbols with an unrecognized quote keep the whole ticker as base.
 */
const QUOTE_ASSETS = [
  "USDT",
  "USDC",
  "BUSD",
  "TUSD",
  "FDUSD",
  "USD",
  "BTC",
  "ETH",
  "BNB",
  "EUR",
];

const PINE_TF_MAP = {
  "1": "1m",
  "3": "3m",
  "5": "5m",
  "15": "15m",
  "30": "30m",
  "60": "1h",
  "120": "2h",
  "240": "4h",
  "360": "6h",
  "480": "8h",
  "1D": "1d",
  D: "1d",
};

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
  readonly exchangeContextService = inject<TExchangeContextService>(
    TYPES.exchangeContextService,
  );

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

    const normalizedTimeframe = PINE_TF_MAP[timeframe] ?? timeframe;
    if (!INTERVAL_MINUTES[<CandleInterval>normalizedTimeframe]) {
      throw new Error(
        `CandleProvider getMarketData: unknown timeframe=${timeframe}. ` +
          `Allowed Pine values: ${Object.keys(PINE_TF_MAP).join(", ")}; ` +
          `allowed intervals: ${Object.keys(INTERVAL_MINUTES).join(", ")}`,
      );
    }
    let clampedEDate = eDate;
    if (ExecutionContextService.hasContext()) {
      const whenMs = lib.executionContextService.context.when.getTime();
      if (clampedEDate === undefined || clampedEDate > whenMs) {
        clampedEDate = whenMs;
      }
    }

    const rawCandles = await GET_RAW_CANDLES_FN(
      this,
      symbol,
      <CandleInterval>normalizedTimeframe,
      limit,
      sDate,
      clampedEDate,
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
    const quote =
      QUOTE_ASSETS.find(
        (asset) => symbol.endsWith(asset) && symbol.length > asset.length,
      ) ?? "";
    const base = quote ? symbol.slice(0, symbol.length - quote.length) : symbol;

    const result: SymbolInfoModel = {
      ticker: symbol,
      tickerid: symbol,
      description: quote ? `${base}/${quote}` : symbol,
      type: "crypto",
      basecurrency: base,
      currency: quote || "USDT",
      timezone: "UTC",
    };

    return result;
  }
}

export default CandleProviderService;

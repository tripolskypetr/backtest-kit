import {
  Backtest,
  CandleInterval,
  listExchangeSchema,
  listFrameSchema,
  listStrategySchema,
  overrideExchangeSchema,
} from "backtest-kit";
import { singleshot } from "functools-kit";
import { getArgs } from "../../../helpers/getArgs";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import ExchangeSchemaService from "../schema/ExchangeSchemaService";
import FrameSchemaService from "../schema/FrameSchemaService";
import ResolveService from "../base/ResolveService";
import FrontendProviderService from "../provider/FrontendProviderService";
import TelegramProviderService from "../provider/TelegramProviderService";
import CacheLogicService from "../logic/CacheLogicService";
import notifyFinish from "../../../utils/notifyFinish";
import SymbolSchemaService from "../schema/SymbolSchemaService";
import getEntry from "../../../helpers/getEntry";

const DEFAULT_CACHE_LIST: CandleInterval[] = ["1m", "15m", "30m", "1h", "4h"];

const GET_CACHE_LIST_FN = () => {
  const { values } = getArgs();
  if (!values.cache) {
    console.warn(
      `Warning: No cache timeframes provided. Using default timeframes: ${DEFAULT_CACHE_LIST.join(", ")}`,
    );
    return DEFAULT_CACHE_LIST;
  }
  return String(values.cache)
    .split(",")
    .map((timeframe) => <CandleInterval>timeframe.trim());
};

export class BacktestMainService {
  private loggerService = inject<LoggerService>(TYPES.loggerService);
  private resolveService = inject<ResolveService>(TYPES.resolveService);

  private exchangeSchemaService = inject<ExchangeSchemaService>(
    TYPES.exchangeSchemaService,
  );
  private frameSchemaService = inject<FrameSchemaService>(
    TYPES.frameSchemaService,
  );
  private symbolSchemaService = inject<SymbolSchemaService>(
    TYPES.symbolSchemaService,
  );

  private cacheLogicService = inject<CacheLogicService>(
    TYPES.cacheLogicService,
  );

  private frontendProviderService = inject<FrontendProviderService>(
    TYPES.frontendProviderService,
  );
  private telegramProviderService = inject<TelegramProviderService>(
    TYPES.telegramProviderService,
  );

  public run = singleshot(
    async (payload: {
      entryPoint: string;
      symbol: string;
      strategy: string;
      exchange: string;
      frame: string;
      cacheList: string[];
      verbose: boolean;
    }) => {
      this.loggerService.log("backtestMainService run", {
        payload,
      });

      {
        this.frontendProviderService.connect();
        this.telegramProviderService.connect();
      }

      await this.resolveService.attachEntryPoint(payload.entryPoint);

      {
        this.exchangeSchemaService.addSchema();
        this.symbolSchemaService.addSchema();
        this.frameSchemaService.addSchema();
      }

      const symbol = payload.symbol || "BTCUSDT";

      const [defaultStrategyName = null] = await listStrategySchema();
      const [defaultExchangeName = null] = await listExchangeSchema();
      const [defaultFrameName = null] = await listFrameSchema();

      const strategyName =
        payload.strategy || defaultStrategyName?.strategyName;

      if (!strategyName) {
        throw new Error("Strategy name is required");
      }

      const exchangeName =
        payload.exchange || defaultExchangeName?.exchangeName;

      if (!exchangeName) {
        throw new Error("Exchange name is required");
      }

      const frameName = payload.frame || defaultFrameName?.frameName;

      if (!frameName) {
        throw new Error("Frame name is required");
      }

      {
        await this.cacheLogicService.execute(
          <CandleInterval[]>payload.cacheList,
          {
            exchangeName,
            frameName,
            symbol,
          },
        );
      }

      if (payload.verbose) {
        overrideExchangeSchema({
          exchangeName,
          callbacks: {
            onCandleData(symbol, interval, since) {
              console.log(
                `Received candle data for symbol: ${symbol}, interval: ${interval}, since: ${since.toUTCString()}`,
              );
            },
          },
        });
      }

      Backtest.background(symbol, {
        strategyName,
        frameName,
        exchangeName,
      });

      notifyFinish();
    },
  );

  protected init = singleshot(async () => {
    this.loggerService.log("backtestMainService init");

    if (!getEntry(import.meta.url)) {
      return;
    }

    const { values, positionals } = getArgs();

    if (!values.backtest) {
      return;
    }

    const [entryPoint = null] = positionals;

    if (!entryPoint) {
      throw new Error("Entry point is required");
    }

    const cacheList = GET_CACHE_LIST_FN();

    return await this.run({
      symbol: <string>values.symbol,
      entryPoint,
      cacheList,
      exchange: <string>values.exchange,
      frame: <string>values.frame,
      strategy: <string>values.strategy,
      verbose: <boolean>values.verbose,
    });
  });
}

export default BacktestMainService;

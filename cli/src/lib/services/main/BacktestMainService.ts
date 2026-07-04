import {
  Backtest,
  CandleInterval,
  listExchangeSchema,
  listFrameSchema,
  listStrategySchema,
  overrideExchangeSchema,
} from "backtest-kit";
import { singleshot } from "functools-kit";
import { getArgs, getPositionals } from "../../../helpers/getArgs";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import ExchangeSchemaService from "../schema/ExchangeSchemaService";
import FrameSchemaService from "../schema/FrameSchemaService";
import ResolveService from "../core/ResolveService";
import FrontendProviderService from "../provider/FrontendProviderService";
import TelegramProviderService from "../provider/TelegramProviderService";
import CacheLogicService from "../logic/CacheLogicService";
import notifyFinish from "../../../utils/notifyFinish";
import SymbolSchemaService from "../schema/SymbolSchemaService";
import getEntry from "../../../helpers/getEntry";
import notifyVerbose from "../../../utils/notifyVerbose";
import ModuleConnectionService from "../connection/ModuleConnectionService";
import ConfigService from "../core/ConfigService";
import { Setup } from "../../../classes/Setup";
import path from "path";
import dotenv from "dotenv";
import ConfigConnectionService from "../connection/ConfigConnectionService";
import { getEntrySubject } from "../../../config/emitters";
import { kill } from "../../../utils/notifyKill";

// Must match the getArgs --cacheInterval default ("1m, 15m, 30m, 1h, 4h"):
// this fallback is only reachable with an explicit --cacheInterval ""
const DEFAULT_CACHE_LIST: CandleInterval[] = ["1m", "15m", "30m", "1h", "4h"];

const GET_CACHE_INTERVAL_LIST_FN = () => {
  const { values } = getArgs();
  if (!values.cacheInterval) {
    return DEFAULT_CACHE_LIST;
  }
  return String(values.cacheInterval)
    .split(",")
    .map((timeframe) => <CandleInterval>timeframe.trim());
};

export class BacktestMainService {
  private loggerService = inject<LoggerService>(TYPES.loggerService);
  private resolveService = inject<ResolveService>(TYPES.resolveService);
  private configService = inject<ConfigService>(TYPES.configService);

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

  private moduleConnectionService = inject<ModuleConnectionService>(
    TYPES.moduleConnectionService,
  );

  private configConnectionService = inject<ConfigConnectionService>(
    TYPES.configConnectionService,
  );

  public run = singleshot(
    async (payload: {
      entryPoint: string;
      symbol: string;
      strategy: string;
      exchange: string;
      frame: string;
      cacheInterval: string[];
      verbose: boolean;
      noCache: boolean;
    }) => {
      this.loggerService.log("backtestMainService run", {
        payload,
      });

      {
        const cwd = process.cwd();
        dotenv.config({ path: path.join(cwd, '.env'), override: true, quiet: true });
      }

      await this.configConnectionService.loadConfig("setup.config");

      {
        const loader = await this.configConnectionService.loadConfig("loader.config");
        try {
          if (typeof loader === "function") {
            await loader();
          }
          if (typeof loader?.loader === "function") {
            await loader.loader();
          }
        } catch (error) {
          console.error("Module loader failed", error);
          kill(-1);
          return;
        }
      }

      {
        await this.configService.waitForInit();
        Setup.enable();
      }

      {
        this.frontendProviderService.connect();
        this.telegramProviderService.connect();
      }

      let absolutePath: string;

      {
        absolutePath = await this.resolveService.attachJavascript(payload.entryPoint);
        await this.moduleConnectionService.loadModule("backtest.module")
      }

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

      if (!payload.noCache) {
        await this.cacheLogicService.execute(
          <CandleInterval[]>payload.cacheInterval,
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
        notifyVerbose();
      }

      await getEntrySubject().next(absolutePath);

      Backtest.background(symbol, {
        strategyName,
        frameName,
        exchangeName,
      });

      notifyFinish();
    },
  );

  public connect = singleshot(async () => {
    this.loggerService.log("backtestMainService connect");

    if (!getEntry(import.meta.url)) {
      return;
    }

    const { values } = getArgs();

    if (!values.backtest) {
      return;
    }

    const [entryPoint = null] = getPositionals();

    if (!entryPoint) {
      throw new Error("Entry point is required");
    }

    const cacheInterval = GET_CACHE_INTERVAL_LIST_FN();

    return await this.run({
      symbol: <string>values.symbol,
      entryPoint,
      cacheInterval,
      exchange: <string>values.exchange,
      frame: <string>values.frame,
      strategy: <string>values.strategy,
      verbose: <boolean>values.verbose,
      noCache: <boolean>values.noCache,
    });
  });
}

export default BacktestMainService;

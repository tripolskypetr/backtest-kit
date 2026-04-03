import {
  listExchangeSchema,
  listStrategySchema,
  Live,
  overrideExchangeSchema,
} from "backtest-kit";
import { singleshot } from "functools-kit";
import { getArgs, getPositionals } from "../../../helpers/getArgs";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import ExchangeSchemaService from "../schema/ExchangeSchemaService";
import ResolveService from "../base/ResolveService";
import FrontendProviderService from "../provider/FrontendProviderService";
import TelegramProviderService from "../provider/TelegramProviderService";
import notifyFinish from "../../../utils/notifyFinish";
import SymbolSchemaService from "../schema/SymbolSchemaService";
import getEntry from "../../../helpers/getEntry";
import notifyVerbose from "../../../utils/notifyVerbose";
import ModuleConnectionService from "../connection/ModuleConnectionService";

export class LiveMainService {
  private loggerService = inject<LoggerService>(TYPES.loggerService);
  private resolveService = inject<ResolveService>(TYPES.resolveService);

  private exchangeSchemaService = inject<ExchangeSchemaService>(
    TYPES.exchangeSchemaService,
  );
  private symbolSchemaService = inject<SymbolSchemaService>(
    TYPES.symbolSchemaService,
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

  public run = singleshot(async (payload: {
    entryPoint: string;
    symbol: string;
    strategy: string;
    exchange: string;
    verbose: boolean;
  }) => {
    this.loggerService.log("liveMainService run", {
      payload,
    });

    {
      this.frontendProviderService.connect();
      this.telegramProviderService.connect();
    }

    {
      await this.resolveService.attachJavascript(payload.entryPoint);
      await this.moduleConnectionService.loadModule("./live.module");
    }

    {
      this.exchangeSchemaService.addSchema();
      this.symbolSchemaService.addSchema();
    }

    const symbol = payload.symbol || "BTCUSDT";

    const [defaultStrategyName = null] = await listStrategySchema();
    const [defaultExchangeName = null] = await listExchangeSchema();

    const strategyName = payload.strategy || defaultStrategyName?.strategyName;

    if (!strategyName) {
      throw new Error("Strategy name is required");
    }

    const exchangeName = payload.exchange || defaultExchangeName?.exchangeName;

    if (!exchangeName) {
      throw new Error("Exchange name is required");
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

    Live.background(symbol, {
      strategyName,
      exchangeName,
    });

    notifyFinish();
  });

  public connect = singleshot(async () => {
    this.loggerService.log("liveMainService connect");

    if (!getEntry(import.meta.url)) {
      return;
    }

    const { values } = getArgs();

    if (!values.live) {
      return;
    }

    const [entryPoint = null] = getPositionals();

    if (!entryPoint) {
      throw new Error("Entry point is required");
    }

    return await this.run({
      entryPoint,
      exchange: <string>values.exchange,
      strategy: <string>values.strategy,
      symbol: <string>values.symbol,
      verbose: <boolean>values.verbose,
    })
  });
}

export default LiveMainService;

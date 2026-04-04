import {
  Walker,
  CandleInterval,
  addWalkerSchema,
  listStrategySchema,
  listExchangeSchema,
  listFrameSchema,
  overrideExchangeSchema,
  listenDoneWalker,
  overrideWalkerSchema,
  addFrameSchema,
  alignToInterval,
  Log,
} from "backtest-kit";
import { createAwaiter, singleshot } from "functools-kit";
import { getArgs, getPositionals } from "../../../helpers/getArgs";
import { inject } from "../../../lib/core/di";
import LoggerService from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import ExchangeSchemaService from "../schema/ExchangeSchemaService";
import ResolveService from "../base/ResolveService";
import CacheLogicService from "../logic/CacheLogicService";
import SymbolSchemaService from "../schema/SymbolSchemaService";
import getEntry from "../../../helpers/getEntry";
import notifyVerbose from "../../../utils/notifyVerbose";
import ModuleConnectionService from "../connection/ModuleConnectionService";
import path, { join, resolve } from "path";
import dotenv from "dotenv";
import { mkdir, writeFile } from "fs/promises";
import FrameName from "../../../enum/FrameName";
import { Setup } from "../../../classes/Setup";

const DEFAULT_CACHE_LIST: CandleInterval[] = ["1m", "15m", "30m", "1h", "4h"];

const WALKER_NAME = "cli-walker";

const GET_CACHE_INTERVAL_LIST_FN = () => {
  const { values } = getArgs();
  if (!values.cacheInterval) {
    return DEFAULT_CACHE_LIST;
  }
  return String(values.cacheInterval)
    .split(",")
    .map((timeframe) => <CandleInterval>timeframe.trim());
};

export class WalkerMainService {
  private loggerService = inject<LoggerService>(TYPES.loggerService);
  private resolveService = inject<ResolveService>(TYPES.resolveService);

  private exchangeSchemaService = inject<ExchangeSchemaService>(
    TYPES.exchangeSchemaService,
  );
  private symbolSchemaService = inject<SymbolSchemaService>(
    TYPES.symbolSchemaService,
  );
  private cacheLogicService = inject<CacheLogicService>(
    TYPES.cacheLogicService,
  );
  private moduleConnectionService = inject<ModuleConnectionService>(
    TYPES.moduleConnectionService,
  );

  public run = singleshot(
    async (payload: {
      entryPoints: string[];
      symbol: string;
      output: string;
      cacheInterval: CandleInterval[];
      json: boolean;
      markdown: boolean;
      verbose: boolean;
      noCache: boolean;
    }) => {
      this.loggerService.log("walkerMainService run", { payload });

      const strategyMap = new Map();

      for (const entryPoint of payload.entryPoints) {
        await this.resolveService.attachStrategy(entryPoint);

        for (const { strategyName } of await listStrategySchema()) {
          if (strategyMap.has(strategyName)) {
            continue;
          }
          strategyMap.set(strategyName, entryPoint)
        }
      }

      await this.moduleConnectionService.loadModule("./walker.module");

      {
        this.exchangeSchemaService.addSchema();
        this.symbolSchemaService.addSchema();
      }

      {
        const { length } = await listFrameSchema();
        if (!length) {
          const endDate = alignToInterval(new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), "1m");
          const startDate = alignToInterval(new Date(Date.now() - 31 * 24 * 60 * 60 * 1000), "1m");
          console.warn(`Warning: The default frame schema is set to the interval ${startDate.toISOString()} — ${endDate.toISOString()}. Please make sure to update it according to your needs using addFrameSchema in your strategy files.`);
          addFrameSchema({
            frameName: FrameName.DefaultFrame,
            interval: "1m",
            startDate,
            endDate,
          });
        }
      }

      const symbol = payload.symbol || "BTCUSDT";

      const strategyList = await listStrategySchema();
      const strategyNames = strategyList.map(
        (s) => s.strategyName,
      );

      if (!strategyNames.length) {
        throw new Error("No strategies found in provided entry points");
      }

      const [defaultExchangeName = null] = await listExchangeSchema();
      const [defaultFrameName = null] = await listFrameSchema();

      const exchangeName = defaultExchangeName?.exchangeName;
      const frameName = defaultFrameName?.frameName;

      if (!exchangeName) {
        throw new Error("Exchange name is required");
      }

      if (!frameName) {
        throw new Error("Frame name is required");
      }

      const cwd = process.cwd();
      const self = this;

      const callbacks = {
        async onStrategyStart(strategyName: string) {
          const entryPoint = strategyMap.get(strategyName);
          if (!entryPoint) {
            return;
          }

          {
            Setup.clear();
            Setup.enable();
          }

          const absolutePath = path.resolve(entryPoint);
          const moduleRoot = path.dirname(absolutePath);

          {
            process.chdir(moduleRoot);
            cwd !== moduleRoot && Log.useJsonl();
            dotenv.config({ path: path.join(cwd, '.env'), override: true, quiet: true });
            dotenv.config({ path: path.join(moduleRoot, '.env'), override: true, quiet: true });
          }

          if (!payload.noCache) {
            await self.cacheLogicService.execute(payload.cacheInterval, {
              exchangeName,
              frameName,
              symbol,
            });
          }
        },
      };

      addWalkerSchema({
        walkerName: WALKER_NAME,
        exchangeName,
        frameName,
        strategies: strategyNames,
        callbacks,
      });

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

      if (payload.verbose) {
        overrideWalkerSchema({
          walkerName: WALKER_NAME,
          callbacks: {
            async onStrategyStart(strategyName, symbol) {
              console.log(`Strategy started: ${strategyName} for symbol: ${symbol}`);
              await callbacks.onStrategyStart(strategyName);
            },
            onStrategyError(strategyName, symbol, error) {
              console.error(`Strategy error: ${strategyName} for symbol: ${symbol}`, error);
            },
            onStrategyComplete(strategyName, symbol) {
              console.log(`Strategy completed: ${strategyName} for symbol: ${symbol}`);
            },
            onComplete(results) {
              console.log(`Walker completed for symbol: ${results.symbol}`, results);
            }
          }
        })
      }

      Walker.background(symbol, { walkerName: WALKER_NAME });

      const [awaiter, { resolve: res }] = createAwaiter<void>();

      const unWalker = listenDoneWalker(() => {
        console.log("Walker comparison finished");
        unWalker();
        res();
      });

      {
        payload.verbose && console.time("Walker");
        await awaiter;
        payload.verbose && console.timeEnd("Walker");
      }

      process.chdir(cwd);

      const dumpName = payload.output || `walker_${symbol}_${Date.now()}`;
      const dumpDir = join(process.cwd(), "dump");

      if (payload.json) {
        const filePath = resolve(dumpDir, `${dumpName}.json`);
        const data = await Walker.getData(symbol, { walkerName: WALKER_NAME });
        await mkdir(dumpDir, { recursive: true });
        await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
        console.log(`Saved: ${filePath}`);
        process.exit(0);
        return;
      }

      if (payload.markdown) {
        const filePath = resolve(dumpDir, `${dumpName}.md`);
        const report = await Walker.getReport(symbol, { walkerName: WALKER_NAME });
        await mkdir(dumpDir, { recursive: true });
        await writeFile(filePath, report, "utf-8");
        console.log(`Saved: ${filePath}`);
        process.exit(0);
        return;
      }

      const report = await Walker.getReport(symbol, { walkerName: WALKER_NAME });
      console.log(report);
      process.exit(0);
    },
  );

  public connect = singleshot(async () => {
    this.loggerService.log("walkerMainService connect");

    if (!getEntry(import.meta.url)) {
      return;
    }

    const { values } = getArgs();

    if (!values.walker) {
      return;
    }

    const entryPoints = getPositionals();

    if (!entryPoints.length) {
      throw new Error("At least one entry point is required");
    }

    const cacheInterval = GET_CACHE_INTERVAL_LIST_FN();

    return await this.run({
      entryPoints,
      json: <boolean>values.json,
      markdown: <boolean>values.markdown,
      symbol: <string>values.symbol,
      output: <string>values.output,
      cacheInterval,
      verbose: <boolean>values.verbose,
      noCache: <boolean>values.noCache,
    });
  });
}

export default WalkerMainService;

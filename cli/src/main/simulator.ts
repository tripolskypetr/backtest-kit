import { addSimulatorSchema, Simulator, listExchangeSchema, overrideExchangeSchema } from "backtest-kit";
import type { ISimulatorIdea, ISimulatorResult, ISimulatorGridAxes, ISimulatorSchema } from "backtest-kit";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join, resolve } from "path";
import { getArgs } from "../helpers/getArgs";
import getEntry from "../helpers/getEntry";
import cli from "../lib";
import path from "path";
import dotenv from "dotenv";

const SIMULATOR_NAME = "cli_simulator";

/**
 * Позиционный JSON-конфиг пробы: оси сетки и порядок отчёта. Оба
 * поля опциональны — пустой конфиг (или его отсутствие) подтягивает
 * дефолты движка из connection-сервиса.
 */
interface IProbeConfig {
  gridAxes?: ISimulatorGridAxes;
  reportOrder?: ISimulatorSchema["reportOrder"];
}

const CONFIG_KEYS = ["gridAxes", "reportOrder"];

const validateConfig = (config: any): string | null => {
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    return "config must be a JSON object";
  }
  for (const key of Object.keys(config)) {
    if (!CONFIG_KEYS.includes(key)) {
      return `unknown key "${key}" (expected: ${CONFIG_KEYS.join(", ")})`;
    }
  }
  return null;
};

const IDEA_DIRECTIONS = ["LONG", "SHORT", "NEUTRAL"];

const validateIdea = (idea: any, line: number): string | null => {
  if (typeof idea !== "object" || idea === null) {
    return `line ${line}: not an object`;
  }
  if (typeof idea.id !== "number") {
    return `line ${line}: "id" must be a number, got ${typeof idea.id}`;
  }
  if (typeof idea.ts !== "number") {
    return `line ${line}: "ts" must be a number (unix ms), got ${typeof idea.ts}`;
  }
  if (typeof idea.symbol !== "string" || !idea.symbol) {
    return `line ${line}: "symbol" must be a non-empty string`;
  }
  if (!IDEA_DIRECTIONS.includes(idea.direction)) {
    return `line ${line}: "direction" must be one of ${IDEA_DIRECTIONS.join("|")}, got ${JSON.stringify(idea.direction)}`;
  }
  if (typeof idea.author !== "string" || !idea.author) {
    return `line ${line}: "author" must be a non-empty string`;
  }
  return null;
};

const toMarkdown = (result: ISimulatorResult): string => {
  const buckets = Object.entries(result.reports).filter(
    ([, bucket]) => bucket.reports.length > 0,
  );
  const allReports = buckets.flatMap(([, bucket]) => bucket.reports);
  const profitable = allReports.filter(
    ({ totalPnlPercent }) => totalPnlPercent > 0,
  ).length;
  const lines: string[] = [];
  lines.push(`# Simulator Report — ${result.symbol}`);
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Ideas (total / directional) | ${result.ideasTotal} / ${result.ideasDirectional} |`);
  lines.push(`| Profiles (truncated) | ${result.profileCount} (${result.truncatedCount}) |`);
  lines.push(`| Profitable corridor | ${profitable} / ${allReports.length} grid points |`);
  lines.push(`| Hold minutes avg / p95 / p99 | ${result.avgHoldMinutes.toFixed(0)} / ${result.p95HoldMinutes} / ${result.p99HoldMinutes} |`);
  // каждая метрика — самодостаточная корзина: свои победители и
  // свои словари банов, между собой не склеиваются
  for (const [metric, bucket] of buckets) {
    lines.push("");
    lines.push(`## Metric: ${metric}`);
    lines.push("");
    lines.push(`| Criterion | Stop% | Hold | Track | HitRate | Trades | PNL% | WinRate | Sharpe | Sortino |`);
    lines.push(`| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`);
    for (const best of bucket.best) {
      if (!best.report) {
        lines.push(`| ${best.criterion} | — | — | — | — | — | — | — | — | — |`);
        continue;
      }
      const { point } = best.report;
      lines.push(
        `| ${best.criterion} | ${point.hardStopPercent} | ${point.holdMinutes / 60}h | ${point.minAuthorTrack} | ${point.minAuthorHitRate} | ` +
          `${best.report.trades} | ${best.report.totalPnlPercent.toFixed(2)}% | ${(best.report.winRate * 100).toFixed(0)}% | ${best.report.sharpe.toFixed(2)} | ${best.report.sortino.toFixed(2)} |`,
      );
    }
    const sharpeBest = bucket.best.find(({ criterion }) => criterion === "sharpe");
    lines.push("");
    lines.push(`### Allowed authors (sharpe winner rule)`);
    lines.push("");
    lines.push(`| Author | Ideas | Hits | HitRate |`);
    lines.push(`| --- | --- | --- | --- |`);
    for (const stat of (sharpeBest?.authorStats ?? []).filter(({ banned }) => !banned)) {
      lines.push(`| ${stat.author} | ${stat.ideas} | ${stat.hits} | ${(stat.hitRate * 100).toFixed(0)}% |`);
    }
  }
  return lines.join("\n");
};

export const main = async () => {
  if (!getEntry(import.meta.url)) {
    return;
  }

  const { values, positionals } = getArgs();

  if (!values.simulator) {
    return;
  }

  const [ideasPath = null] = positionals.filter((value) =>
    value.endsWith(".jsonl"),
  );
  if (!ideasPath) {
    console.error("Error: positional path to an ideas .jsonl file is required");
    process.exit(1);
  }

  // конфиг — позиционный JSON; без него подтягивается пустой объект
  // и схема живёт на дефолтах движка (оси, порядок отчёта)
  const [configPath = null] = positionals.filter(
    (value) => value.endsWith(".json") && !value.endsWith(".jsonl"),
  );
  let config: IProbeConfig = {};
  if (configPath) {
    let content: string;
    try {
      content = await readFile(resolve(configPath), "utf-8");
    } catch (error) {
      console.error(`Error: cannot read config file: ${configPath}`);
      process.exit(1);
    }
    try {
      config = JSON.parse(content);
    } catch {
      console.error(`Error: invalid JSON in config file: ${configPath}`);
      process.exit(1);
    }
    const problem = validateConfig(config);
    if (problem) {
      console.error(`Error: simulator config does not match the structure — ${problem}`);
      console.error(`Expected shape: { "gridAxes"?: ISimulatorGridAxes, "reportOrder"?: "sharpe"|"sortino"|"pnl"|"recovery" }`);
      process.exit(1);
    }
  }

  let ideas: ISimulatorIdea[] = [];
  {
    let content: string;
    try {
      content = await readFile(resolve(ideasPath), "utf-8");
    } catch (error) {
      console.error(`Error: cannot read ideas file: ${ideasPath}`);
      process.exit(1);
    }
    const rows = content.split("\n").filter(Boolean);
    if (!rows.length) {
      console.error(`Error: ideas file is empty: ${ideasPath}`);
      process.exit(1);
    }
    for (let i = 0; i < rows.length; i++) {
      let idea: any;
      try {
        idea = JSON.parse(rows[i]);
      } catch {
        console.error(`Error: invalid JSON in ideas file, line ${i + 1}`);
        process.exit(1);
      }
      const problem = validateIdea(idea, i + 1);
      if (problem) {
        console.error(`Error: ideas file does not match the idea structure — ${problem}`);
        console.error(`Expected shape: { "id": number, "ts": number, "symbol": string, "direction": "LONG"|"SHORT"|"NEUTRAL", "author": string }`);
        process.exit(1);
      }
      ideas.push(idea);
    }
  }

  {
    const cwd = process.cwd();
    dotenv.config({ path: path.join(cwd, '.env'), override: true, quiet: true });
  }

  await cli.configConnectionService.loadConfig("setup.config");

  {
    const loader = await cli.configConnectionService.loadConfig("loader.config");
    try {
      if (typeof loader === "function") {
        await loader();
      }
      if (typeof loader?.loader === "function") {
        await loader.loader();
      }
    } catch (error) {
      console.error("Module loader failed", error);
      process.exit(-1);
    }
  }

  await cli.moduleConnectionService.loadModule("simulator.module");

  {
    await cli.exchangeSchemaService.addSchema();
    await cli.symbolSchemaService.addSchema();
  }

  const [defaultExchangeName = null] = await listExchangeSchema();

  const exchangeName =
    <string>values.exchange || defaultExchangeName?.exchangeName;

  if (values.verbose) {
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

  const symbol = <string>values.symbol || "BTCUSDT";

  // оси и порядок отчёта приходят позиционным конфигом потребителя;
  // пустой конфиг — дефолтная сетка движка из connection-сервиса
  addSimulatorSchema({
    simulatorName: SIMULATOR_NAME,
    exchangeName,
    ...(config.gridAxes ? { gridAxes: config.gridAxes } : {}),
    ...(config.reportOrder ? { reportOrder: config.reportOrder } : {}),
    callbacks: {
      onProgress: (symbol, stage, processed, total) => {
        if (values.verbose) {
          console.log("onProgress", { symbol, stage, processed, total });
        }
      },
      onIdeas: (symbol, ideasTotal, ideasDirectional) => {
        if (values.verbose) {
          console.log("onIdeas", { symbol, ideasTotal, ideasDirectional });
        }
      },
      onProfiles: (symbol, profiles, truncatedCount) => {
        if (values.verbose) {
          console.log("onProfiles", { symbol, profiles: profiles.length, truncatedCount });
        }
      },
      onAuthorsTrained: (symbol, stats, bannedIdeas) => {
        if (values.verbose) {
          console.log("onAuthorsTrained", {
            symbol,
            authors: stats.length,
            banned: stats.filter(({ banned }) => banned).length,
            bannedIdeas,
          });
        }
      },
      onGridPoint: (symbol, report) => {
        if (values.verbose) {
          console.log("onGridPoint", {
            symbol,
            point: report.point,
            trades: report.trades,
            pnl: +report.totalPnlPercent.toFixed(2),
            sharpe: +report.sharpe.toFixed(2),
          });
        }
      },
      onRanking: (symbol, criterion, _sorted, best) => {
        if (values.verbose) {
          console.log("onRanking", {
            symbol,
            criterion,
            point: best.report?.point ?? null,
            pnl: best.report ? +best.report.totalPnlPercent.toFixed(2) : null,
          });
        }
      },
      onDone: (symbol, result) => {
        if (values.verbose) {
          console.log("onDone", {
            symbol,
            reports: Object.values(result.reports).flatMap((bucket) => bucket.reports).length,
            bans: Object.values(result.reports).flatMap((bucket) => bucket.bans).length,
          });
        }
      },
    },
  });

  const result = await Simulator.run({
    symbol,
    simulatorName: SIMULATOR_NAME,
    ideas,
  });

  const dumpName = <string>values.output || `simulator_${symbol}_${Date.now()}`;
  const dumpDir = join(process.cwd(), "dump");

  if (values.json) {
    const filePath = resolve(dumpDir, `${dumpName}.json`);
    await mkdir(dumpDir, { recursive: true });
    await writeFile(filePath, JSON.stringify(result, null, 2), "utf-8");
    console.log(`Saved: ${filePath}`);
    process.exit(0);
  }

  if (values.markdown) {
    const filePath = resolve(dumpDir, `${dumpName}.md`);
    await mkdir(dumpDir, { recursive: true });
    await writeFile(filePath, toMarkdown(result), "utf-8");
    console.log(`Saved: ${filePath}`);
    process.exit(0);
  }

  console.log(toMarkdown(result));
  process.exit(0);
};

main();

import { addSimulatorSchema, Simulator, listExchangeSchema, overrideExchangeSchema } from "backtest-kit";
import type { ISimulatorIdea, ISimulatorTestResult, ISimulatorGridAxes, ISimulatorSchema } from "backtest-kit";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join, resolve } from "path";
import { getArgs } from "../helpers/getArgs";
import getEntry from "../helpers/getEntry";
import cli from "../lib";
import path from "path";
import dotenv from "dotenv";

const SIMULATOR_NAME = "cli_tune";

type SimulatorPoint = ISimulatorTestResult["point"];
type SimulatorAuthorStats = ISimulatorTestResult["authorStats"];

/**
 * Замороженный артефакт обучения, который потребитель передаёт
 * позиционным JSON-конфигом: точка и сырой трек-рекорд авторов.
 * Оси сетки и порядок отчёта опциональны — без них оси зеркалят
 * точку одноточечно, порядок берётся из дефолтов движка.
 */
interface ITuneConfig {
  point?: SimulatorPoint;
  authorStats?: SimulatorAuthorStats;
  gridAxes?: ISimulatorGridAxes;
  reportOrder?: ISimulatorSchema["reportOrder"];
}

const CONFIG_KEYS = ["point", "authorStats", "gridAxes", "reportOrder"];

const POINT_NUMBER_FIELDS = [
  "hardStopPercent",
  "trailingTakePercent",
  "holdMinutes",
  "minAuthorTrack",
  "minAuthorHitRate",
  "profitLockPercent",
];

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

const validateConfig = (config: any): string | null => {
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    return "config must be a JSON object";
  }
  for (const key of Object.keys(config)) {
    if (!CONFIG_KEYS.includes(key)) {
      return `unknown key "${key}" (expected: ${CONFIG_KEYS.join(", ")})`;
    }
  }
  if (typeof config.point !== "object" || config.point === null) {
    return `"point" is required — the frozen grid point of a training run`;
  }
  for (const field of POINT_NUMBER_FIELDS) {
    if (typeof config.point[field] !== "number") {
      return `"point.${field}" must be a number, got ${typeof config.point[field]}`;
    }
  }
  if (typeof config.point.authorMetric !== "string") {
    return `"point.authorMetric" must be a string, got ${typeof config.point.authorMetric}`;
  }
  if (!Array.isArray(config.authorStats) || !config.authorStats.length) {
    return `"authorStats" is required — the frozen raw track record (non-empty array)`;
  }
  for (let i = 0; i < config.authorStats.length; i++) {
    const stat = config.authorStats[i];
    if (
      typeof stat !== "object" ||
      stat === null ||
      typeof stat.author !== "string" ||
      typeof stat.ideas !== "number" ||
      typeof stat.hits !== "number"
    ) {
      return `"authorStats[${i}]" must be { author: string, ideas: number, hits: number }`;
    }
  }
  return null;
};

/** Одноточечные оси, зеркалящие замороженную точку — сетка инертна. */
const axesFromPoint = (point: SimulatorPoint): ISimulatorGridAxes => ({
  hardStopPercent: [point.hardStopPercent],
  trailingTakePercent: [point.trailingTakePercent],
  holdMinutes: [point.holdMinutes],
  minAuthorTrack: [point.minAuthorTrack],
  minAuthorHitRate: [point.minAuthorHitRate],
  profitLockPercent: [point.profitLockPercent],
  authorMetric: [point.authorMetric],
});

const pointLabel = (point: any): string =>
  `H=${point.hardStopPercent} TT=${point.trailingTakePercent} hold=${point.holdMinutes / 60}h ` +
  `track=${point.minAuthorTrack} rate=${point.minAuthorHitRate} ` +
  `lock=${point.profitLockPercent} metric=${point.authorMetric}`;

const fmtRatio = (value: number): string =>
  Number.isFinite(value) ? value.toFixed(2) : "inf";

const toMarkdown = (test: ISimulatorTestResult): string => {
  const lines: string[] = [];
  lines.push(`# Tune Report — ${test.symbol}`);
  lines.push("");
  lines.push(`ONE out-of-sample shot of a FROZEN training artifact: nothing is trained here — the point and the raw author track record come from the input config verbatim, bans are re-derived from the frozen numbers under the point's rule, unseen authors are banned by default.`);
  lines.push("");
  lines.push(`Frozen point: ${pointLabel(test.point)}`);
  lines.push("");
  lines.push(`## Out-of-sample (${test.ideasDirectional} directional ideas)`);
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Trades (skipped busy) | ${test.report.trades} (${test.report.skippedBusy}) |`);
  lines.push(`| PNL | ${test.report.totalPnlPercent.toFixed(2)}% |`);
  lines.push(`| Win rate | ${(test.report.winRate * 100).toFixed(0)}% |`);
  lines.push(`| Profit factor | ${fmtRatio(test.report.profitFactor)} |`);
  lines.push(`| Max series drawdown | ${test.report.maxSeriesDrawdownPercent.toFixed(2)}% |`);
  lines.push(`| Sharpe / Sortino | ${fmtRatio(test.report.sharpe)} / ${fmtRatio(test.report.sortino)} |`);
  lines.push(`| Recovery factor | ${fmtRatio(test.report.recoveryFactor)} |`);
  lines.push(`| Exits | ${Object.entries(test.report.exitReasons).map(([reason, count]) => `${reason}=${count}`).join(", ")} |`);
  lines.push("");
  lines.push(`## Test trades`);
  lines.push("");
  lines.push(`| Direction | Exit | PNL% | Hold | Entry (UTC) |`);
  lines.push(`| --- | --- | --- | --- | --- |`);
  for (const trade of test.trades) {
    lines.push(
      `| ${trade.direction} | ${trade.exitReason} | ${trade.pnlPercent.toFixed(2)} | ${trade.holdMinutesActual}m | ${new Date(trade.entryTimestamp).toISOString()} |`,
    );
  }
  lines.push("");
  lines.push(`## Frozen author track record (re-derived bans under the point's rule)`);
  lines.push("");
  lines.push(`| Author | Ideas | Hits | Banned |`);
  lines.push(`| --- | --- | --- | --- |`);
  for (const stat of test.authorStats) {
    lines.push(`| ${stat.author} | ${stat.ideas} | ${stat.hits} | ${stat.banned ? "yes" : ""} |`);
  }
  return lines.join("\n");
};

export const main = async () => {
  if (!getEntry(import.meta.url)) {
    return;
  }

  const { values, positionals } = getArgs();

  if (!values.tune) {
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
  // (и валидация честно скажет, что замороженной точки нет)
  const [configPath = null] = positionals.filter(
    (value) => value.endsWith(".json") && !value.endsWith(".jsonl"),
  );
  let config: ITuneConfig = {};
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
  }
  {
    const problem = validateConfig(config);
    if (problem) {
      console.error(`Error: tune config does not match the structure — ${problem}`);
      console.error(`Expected shape: { "point": ISimulatorGridPoint, "authorStats": [{ "author", "ideas", "hits" }], "gridAxes"?, "reportOrder"? }`);
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

  await cli.moduleConnectionService.loadModule("tune.module");

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

  // сетка для test() инертна (оценивается ровно замороженная точка):
  // без явных осей в конфиге они одноточечно зеркалят точку
  addSimulatorSchema({
    simulatorName: SIMULATOR_NAME,
    exchangeName,
    gridAxes: config.gridAxes ?? axesFromPoint(config.point!),
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
      onTestDone: (symbol, result) => {
        if (values.verbose) {
          console.log("onTestDone", {
            symbol,
            trades: result.report.trades,
            pnl: +result.report.totalPnlPercent.toFixed(2),
          });
        }
      },
    },
  });

  // только out-of-sample: обучения нет, точка и трек-рекорд приходят
  // из конфига verbatim — test() перевыводит баны под правило точки,
  // невиданные авторы забанены по умолчанию
  const test = await Simulator.test({
    symbol,
    simulatorName: SIMULATOR_NAME,
    ideas,
    point: config.point!,
    authorStats: config.authorStats!,
  });

  const dumpName = <string>values.output || `tune_${symbol}_${Date.now()}`;
  const dumpDir = join(process.cwd(), "dump");

  if (values.json) {
    const filePath = resolve(dumpDir, `${dumpName}.json`);
    await mkdir(dumpDir, { recursive: true });
    await writeFile(filePath, JSON.stringify(test, null, 2), "utf-8");
    console.log(`Saved: ${filePath}`);
    process.exit(0);
  }

  if (values.markdown) {
    const filePath = resolve(dumpDir, `${dumpName}.md`);
    await mkdir(dumpDir, { recursive: true });
    await writeFile(filePath, toMarkdown(test), "utf-8");
    console.log(`Saved: ${filePath}`);
    process.exit(0);
  }

  console.log(toMarkdown(test));
  process.exit(0);
};

main();

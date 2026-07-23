import { addSimulatorSchema, Simulator, listExchangeSchema, overrideExchangeSchema } from "backtest-kit";
import type { ISimulatorIdea, ISimulatorResult, ISimulatorTestResult } from "backtest-kit";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join, resolve } from "path";
import { getArgs } from "../helpers/getArgs";
import getEntry from "../helpers/getEntry";
import cli from "../lib";
import path from "path";
import dotenv from "dotenv";

const SIMULATOR_NAME = "cli_tune";

/** Доля времени фида, уходящая в обучение; хвост — один OOS-выстрел. */
const DEFAULT_TRAIN_SPLIT = 0.7;

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

const pointLabel = (point: any): string =>
  `H=${point.hardStopPercent} TT=${point.trailingTakePercent} hold=${point.holdMinutes / 60}h ` +
  `track=${point.minAuthorTrack} rate=${point.minAuthorHitRate} ` +
  `lock=${point.profitLockPercent} metric=${point.authorMetric}`;

const fmtRatio = (value: number): string =>
  Number.isFinite(value) ? value.toFixed(2) : "inf";

const toMarkdown = (
  train: ISimulatorResult,
  test: ISimulatorTestResult,
  trainSplit: number,
): string => {
  const lines: string[] = [];
  lines.push(`# Tune Report — ${train.symbol}`);
  lines.push("");
  lines.push(`Walk-forward: train on the first ${Math.round(trainSplit * 100)}% of the feed time range, ONE out-of-sample shot of the frozen sharpe winner on the tail.`);
  lines.push("");
  lines.push(`## Train (${train.ideasDirectional} directional ideas, ${train.reports.length} grid points)`);
  lines.push("");
  lines.push(`| Criterion | Point | Trades | PNL% | WinRate | DD% | Sharpe | Sortino |`);
  lines.push(`| --- | --- | --- | --- | --- | --- | --- | --- |`);
  for (const best of train.best) {
    if (!best.report) {
      lines.push(`| ${best.criterion} | — | — | — | — | — | — | — |`);
      continue;
    }
    lines.push(
      `| ${best.criterion} | ${pointLabel(best.report.point)} | ${best.report.trades} | ${best.report.totalPnlPercent.toFixed(2)}% | ` +
        `${(best.report.winRate * 100).toFixed(0)}% | ${best.report.maxSeriesDrawdownPercent.toFixed(2)} | ${fmtRatio(best.report.sharpe)} | ${fmtRatio(best.report.sortino)} |`,
    );
  }
  lines.push("");
  lines.push(`## Out-of-sample (frozen sharpe winner, ${test.ideasDirectional} tail ideas)`);
  lines.push("");
  lines.push(`Frozen point: ${pointLabel(test.point)}`);
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
  lines.push(`## Frozen author track record (train range, sharpe winner rule)`);
  lines.push("");
  lines.push(`Freeze these raw numbers for production \`Simulator.test\` — banned flags and vote weights are re-derived from them under the frozen point's rule; an author absent from the list is banned by default.`);
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

  const trainSplit = values.split
    ? parseFloat(<string>values.split)
    : DEFAULT_TRAIN_SPLIT;
  if (!Number.isFinite(trainSplit) || trainSplit <= 0 || trainSplit >= 1) {
    console.error(`Error: --split must be a fraction between 0 and 1, got ${values.split}`);
    process.exit(1);
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

  // Подбор параметров: полная сетка с собирающей прибыль механикой —
  // замок, трейлинг, обе метрики бана. Честность обеспечивается
  // сплитом: обучение видит только голову, хвост тратится на один
  // выстрел замороженного sharpe-победителя
  addSimulatorSchema({
    simulatorName: SIMULATOR_NAME,
    exchangeName,
    gridAxes: {
      // стопы < 2% сидят внутри медианного шейкаута и не выигрывают
      hardStopPercent: [2, 2.5, 3, 4, 5, 7],
      trailingTakePercent: [1, 1.5, 2, 3, 4],
      holdMinutes: [24 * 60, 2 * 24 * 60, 3 * 24 * 60],
      minAuthorTrack: [2, 3, 5],
      minAuthorHitRate: [0.5, 0.6],
      profitLockPercent: [0, 1.5, 2.5],
      authorMetric: ["retain"],
      banCriteria: ["sharpe"],
    },
    reportOrder: "sharpe",
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

  // обучение видит ТОЛЬКО голову ленты; хвост — один OOS-выстрел
  const sorted = [...ideas].sort((a, b) => a.ts - b.ts);
  const cutoff =
    sorted[0].ts + (sorted[sorted.length - 1].ts - sorted[0].ts) * trainSplit;
  const trainIdeas = sorted.filter(({ ts }) => ts < cutoff);
  const testIdeas = sorted.filter(({ ts }) => ts >= cutoff);

  const train = await Simulator.run({
    symbol,
    simulatorName: SIMULATOR_NAME,
    ideas: trainIdeas,
  });

  const sharpeBest = train.best.find(({ criterion }) => criterion === "sharpe");
  if (!sharpeBest?.report) {
    console.error("Error: training produced no sharpe winner — nothing to freeze for the out-of-sample shot");
    process.exit(1);
  }

  // заморозка: точка и трек-рекорд sharpe-победителя как есть — из
  // замороженных статов test() читает только author/ideas/hits и сам
  // перевыводит баны и веса под правило точки
  const test = await Simulator.test({
    symbol,
    simulatorName: SIMULATOR_NAME,
    ideas: testIdeas,
    point: sharpeBest.report.point,
    authorStats: sharpeBest.authorStats,
  });

  const dumpName = <string>values.output || `tune_${symbol}_${Date.now()}`;
  const dumpDir = join(process.cwd(), "dump");

  if (values.json) {
    const filePath = resolve(dumpDir, `${dumpName}.json`);
    await mkdir(dumpDir, { recursive: true });
    await writeFile(
      filePath,
      JSON.stringify({ trainSplit, train, test }, null, 2),
      "utf-8",
    );
    console.log(`Saved: ${filePath}`);
    process.exit(0);
  }

  if (values.markdown) {
    const filePath = resolve(dumpDir, `${dumpName}.md`);
    await mkdir(dumpDir, { recursive: true });
    await writeFile(filePath, toMarkdown(train, test, trainSplit), "utf-8");
    console.log(`Saved: ${filePath}`);
    process.exit(0);
  }

  console.log(toMarkdown(train, test, trainSplit));
  process.exit(0);
};

main();

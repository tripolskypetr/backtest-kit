import { addSimulatorSchema, Simulator, listExchangeSchema } from "backtest-kit";
import type { ISimulatorIdea, ISimulatorResult } from "backtest-kit";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join, resolve } from "path";
import { getArgs } from "../helpers/getArgs";
import getEntry from "../helpers/getEntry";
import cli from "../lib";
import path from "path";
import dotenv from "dotenv";

const SIMULATOR_NAME = "cli_simulator";

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
  const lines: string[] = [];
  lines.push(`# Simulator Report — ${result.symbol}`);
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Ideas (total / directional) | ${result.ideasTotal} / ${result.ideasDirectional} |`);
  lines.push(`| Profiles (truncated) | ${result.profileCount} (${result.truncatedCount}) |`);
  lines.push(`| Authors allowed / banned | ${result.allowedAuthors.length} / ${result.bannedAuthors.length} |`);
  lines.push(`| Grid points | ${result.reports.length} |`);
  lines.push(`| Hold minutes avg / p95 / p99 | ${result.avgHoldMinutes.toFixed(0)} / ${result.p95HoldMinutes} / ${result.p99HoldMinutes} |`);
  lines.push("");
  lines.push(`## Ranking winners`);
  lines.push("");
  lines.push(`| Criterion | Stop% | Trailing% | Hold | Aligned | Track | HitRate | Trades | PNL% | WinRate | Sharpe | Sortino |`);
  lines.push(`| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`);
  for (const best of result.best) {
    if (!best.report) {
      lines.push(`| ${best.criterion} | — | — | — | — | — | — | — | — | — | — | — |`);
      continue;
    }
    const { point } = best.report;
    lines.push(
      `| ${best.criterion} | ${point.hardStopPercent} | ${point.trailingTakePercent} | ${point.holdMinutes / 60}h | ${point.minIdeasAligned} | ${point.minAuthorTrack} | ${point.minAuthorHitRate} | ` +
        `${best.report.trades} | ${best.report.totalPnlPercent.toFixed(2)}% | ${(best.report.winRate * 100).toFixed(0)}% | ${best.report.sharpe.toFixed(2)} | ${best.report.sortino.toFixed(2)} |`,
    );
  }
  lines.push("");
  lines.push(`## Allowed authors (production whitelist)`);
  lines.push("");
  lines.push(`| Author | Ideas | Hits | HitRate |`);
  lines.push(`| --- | --- | --- | --- |`);
  for (const stat of result.authorStats.filter(({ banned }) => !banned)) {
    lines.push(`| ${stat.author} | ${stat.ideas} | ${stat.hits} | ${(stat.hitRate * 100).toFixed(0)}% |`);
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

  const symbol = <string>values.symbol || "BTCUSDT";

  addSimulatorSchema({
    simulatorName: SIMULATOR_NAME,
    exchangeName,
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
            reports: result.reports.length,
            allowedAuthors: result.allowedAuthors.length,
            bannedAuthors: result.bannedAuthors.length,
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

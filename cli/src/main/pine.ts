import { run, Code, toMarkdown } from "@backtest-kit/pinets";
import { writeFile, mkdir } from "fs/promises";
import { basename, extname, join, resolve } from "path";
import { getArgs, getPositionals } from "../helpers/getArgs";
import getEntry from "../helpers/getEntry";
import cli from "../lib";
import { CandleInterval, listExchangeSchema } from "backtest-kit";

const EXTRACT_ROWS_FN = (plots: Record<string, { data: { value: unknown; time: number }[] }>, schema: Record<string, string>) => {
  const keys = Object.keys(schema);
  const dataLength = keys
    .map((k) => plots[k]?.data?.length ?? 0)
    .reduce((acm, cur) => Math.max(acm, cur), 0);
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < dataLength; i++) {
    const row: Record<string, unknown> = {};
    for (const key of keys) {
      const point = plots[key]?.data?.[i];
      row[key] = point?.value ?? null;
    }
    const point = plots[keys[0]]?.data?.[i];
    if (point?.time) {
      row.timestamp = new Date(point.time).toISOString();
    }
    rows.push(row);
  }
  return rows;
};

export const main = async () => {
  if (!getEntry(import.meta.url)) {
    return;
  }

  const { values } = getArgs();

  if (!values.pine) {
    return;
  }

  const [entryPoint = null] = getPositionals();

  if (!entryPoint) {
    return;
  }

  const source = await cli.resolveService.attachPine(entryPoint);

  await cli.moduleConnectionService.loadModule("./pine.module");

  {
    await cli.exchangeSchemaService.addSchema();
    await cli.symbolSchemaService.addSchema();
  }

  const [defaultExchangeName = null] = await listExchangeSchema();

  const exchangeName =
    <string>values.exchange || defaultExchangeName?.exchangeName;

  const symbol = <string>values.symbol || "BTCUSDT";
  const timeframe = <string>values.timeframe || "15m";

  const limitStr = <string>values.limit || "250";
  const limitNum = parseInt(limitStr);

  const limit = isNaN(limitNum) ? 250 : limitNum;

  const whenStr = <string>values.when || Date.now().toString();
  const whenStamp = Date.parse(whenStr);

  const when = isNaN(whenStamp) ? new Date() : new Date(whenStamp);

  const plots = await run(
    Code.fromString(source),
    {
      symbol,
      timeframe: <CandleInterval>timeframe,
      limit,
    },
    exchangeName,
    when,
  );

  const signalId = `CLI execution ${new Date().toISOString()}`;

  const signalSchema = Object.fromEntries(
    Object.keys(plots)
      .filter((key) =>
        plots[key].data.some((v: { value: unknown }) => {
          if (typeof v?.value !== "number") {
            return false;
          }
          if (!isFinite(v.value)) {
            return false;
          }
          return true;
        }),
      )
      .map((key) => [key, key]),
  );

  const dumpName = <string>values.output || basename(entryPoint, extname(entryPoint));
  const dumpDir = join(process.cwd(), "dump");

  if (values.json) {
    const rows = EXTRACT_ROWS_FN(plots, signalSchema);
    const filePath = resolve(dumpDir, `${dumpName}.json`);
    await mkdir(dumpDir, { recursive: true });
    await writeFile(filePath, JSON.stringify(rows, null, 2), "utf-8");
    console.log(`Saved: ${filePath}`);
    process.exit(0);
    return;
  }

  if (values.jsonl) {
    const rows = EXTRACT_ROWS_FN(plots, signalSchema);
    const filePath = resolve(dumpDir, `${dumpName}.jsonl`);
    await mkdir(dumpDir, { recursive: true });
    await writeFile(filePath, rows.map((r) => JSON.stringify(r)).join("\n"), "utf-8");
    console.log(`Saved: ${filePath}`);
    process.exit(0);
    return;
  }

  if (values.markdown) {
    const filePath = resolve(dumpDir, `${dumpName}.md`);
    await mkdir(dumpDir, { recursive: true });
    await writeFile(filePath, await toMarkdown(signalId, plots, signalSchema), "utf-8");
    console.log(`Saved: ${filePath}`);
    process.exit(0);
    return;
  }

  console.log(await toMarkdown(signalId, plots, signalSchema));
  process.exit(0);

};

main();

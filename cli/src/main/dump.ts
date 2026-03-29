import { Exchange, alignToInterval } from "backtest-kit";
import { writeFile, mkdir } from "fs/promises";
import { join, resolve } from "path";
import { getArgs } from "../helpers/getArgs";
import getEntry from "../helpers/getEntry";
import cli from "../lib";
import { CandleInterval, listExchangeSchema } from "backtest-kit";

export const main = async () => {
  if (!getEntry(import.meta.url)) {
    return;
  }

  const { values } = getArgs();

  if (!values.dump) {
    return;
  }

  await cli.moduleConnectionService.loadModule("./dump.module");

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

  const timestamp = alignToInterval(when, <CandleInterval>timeframe).getTime();

  const candles = await Exchange.getRawCandles(
    symbol,
    <CandleInterval>timeframe,
    {
      exchangeName,
    },
    limit,
    undefined,
    timestamp,
  );

  const dumpName = <string>values.output || `${symbol}_${limit}_${timeframe}_${timestamp}`;
  const dumpDir = join(process.cwd(), "dump");

  if (values.json) {
    const filePath = resolve(dumpDir, `${dumpName}.json`);
    await mkdir(dumpDir, { recursive: true });
    await writeFile(filePath, JSON.stringify(candles, null, 2), "utf-8");
    console.log(`Saved: ${filePath}`);
    return;
  }

  if (values.jsonl) {
    const filePath = resolve(dumpDir, `${dumpName}.jsonl`);
    await mkdir(dumpDir, { recursive: true });
    await writeFile(
      filePath,
      candles.map((r) => JSON.stringify(r)).join("\n"),
      "utf-8",
    );
    console.log(`Saved: ${filePath}`);
    return;
  }

  console.log(JSON.stringify(candles, null, 2));
};

main();

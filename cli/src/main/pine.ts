import { run, File, toMarkdown } from "@backtest-kit/pinets";
import { getArgs } from "../helpers/getArgs";
import getEntry from "../helpers/getEntry";
import cli from "../lib";
import { CandleInterval, listExchangeSchema } from "backtest-kit";

export const main = async () => {
  if (!getEntry(import.meta.url)) {
    return;
  }

  const { values, positionals } = getArgs();

  if (!values.pine) {
    return;
  }

  const [entryPoint = null] = positionals.slice(-1);

  if (!entryPoint) {
    return;
  }

  await cli.moduleConnectionService.loadModule("./pine.module")

  await cli.exchangeSchemaService.addSchema();
  
  const [defaultExchangeName = null] = await listExchangeSchema();

  const exchangeName = <string>values.exchange || defaultExchangeName?.exchangeName;

  const symbol = <string>values.symbol || "BTCUSDT";
  const timeframe = <string>values.timeframe || "15m";

  const limitStr = <string>values.limit || "250";
  const limitNum = parseInt(limitStr);

  const limit = isNaN(limitNum) ? 250 : limitNum;

  const whenStr = <string>values.when || Date.now().toString();
  const whenStamp = Date.parse(whenStr);

  const when = isNaN(whenStamp) ? new Date() : new Date(whenStamp);

  const plots = await run(
    File.fromPath(entryPoint, process.cwd()),
    {
      symbol,
      timeframe: <CandleInterval>timeframe,
      limit,
    },
    exchangeName,
    when
  );

  const signalId = `CLI execution ${new Date().toISOString()}`;

  const signalSchema = Object.fromEntries(Object.keys(plots).map((key) => [key, key]));

  console.log(await toMarkdown(signalId, plots, signalSchema));
};

main();

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

  if (!values.pnldebug) {
    return;
  }

  await cli.moduleConnectionService.loadModule("./pnldebug.module");

  {
    await cli.exchangeSchemaService.addSchema();
    await cli.symbolSchemaService.addSchema();
  }

  const [defaultExchangeName = null] = await listExchangeSchema();

  const exchangeName =
    <string>values.exchange || defaultExchangeName?.exchangeName;

  const symbol = <string>values.symbol || "BTCUSDT";

  const priceOpenStr = <string>values.priceopen;
  if (!priceOpenStr) {
    console.error("Error: --priceopen is required");
    process.exit(1);
  }
  const priceOpen = parseFloat(priceOpenStr);
  if (isNaN(priceOpen)) {
    console.error(`Error: --priceopen must be a number, got: ${priceOpenStr}`);
    process.exit(1);
  }

  const direction = (<string>values.direction || "long").toLowerCase();
  if (direction !== "long" && direction !== "short") {
    console.error(`Error: --direction must be 'long' or 'short', got: ${direction}`);
    process.exit(1);
  }

  const whenStr = <string>values.when || Date.now().toString();
  const whenStamp = Date.parse(whenStr);
  const when = isNaN(whenStamp) ? new Date() : new Date(whenStamp);
  const timestamp = alignToInterval(when, "1m").getTime();

  const minutesStr = <string>values.minutes || "60";
  const minutesNum = parseInt(minutesStr);
  const minutes = isNaN(minutesNum) ? 60 : minutesNum;

  const candles = await Exchange.getRawCandles(
    symbol,
    "1m" as CandleInterval,
    { exchangeName },
    minutes,
    undefined,
    timestamp,
  );

  if (candles.length === 0) {
    console.error("Error: no candles returned for the given parameters");
    process.exit(1);
  }

  let peak = 0;
  let drawdown = 0;

  const rows = candles.map((c, i) => {
    const pnl = direction === "short"
      ? (priceOpen - c.close) / priceOpen * 100
      : (c.close - priceOpen) / priceOpen * 100;
    if (pnl > peak) peak = pnl;
    if (pnl < drawdown) drawdown = pnl;
    return { min: i + 1, timestamp: c.timestamp, close: c.close, pnl, peak, drawdown };
  });

  const dumpName = <string>values.output || `${symbol}_${direction}_${priceOpen}_${timestamp}`;
  const dumpDir = join(process.cwd(), "dump");

  if (values.json) {
    const filePath = resolve(dumpDir, `${dumpName}.json`);
    await mkdir(dumpDir, { recursive: true });
    await writeFile(filePath, JSON.stringify(rows, null, 2), "utf-8");
    console.log(`Saved: ${filePath}`);
    process.exit(0);
  }

  if (values.jsonl) {
    const filePath = resolve(dumpDir, `${dumpName}.jsonl`);
    await mkdir(dumpDir, { recursive: true });
    await writeFile(filePath, rows.map((r) => JSON.stringify(r)).join("\n"), "utf-8");
    console.log(`Saved: ${filePath}`);
    process.exit(0);
  }

  if (values.markdown) {
    const header = `| min | timestamp | close | pnl% | peak% | drawdown% |\n| --- | --- | --- | --- | --- | --- |`;
    const mdRows = rows.map((r) =>
      `| ${r.min} | ${new Date(r.timestamp).toISOString()} | ${r.close.toFixed(2)} | ${(r.pnl >= 0 ? "+" : "") + r.pnl.toFixed(2)}% | +${r.peak.toFixed(2)}% | ${r.drawdown.toFixed(2)}% |`
    );
    const filePath = resolve(dumpDir, `${dumpName}.md`);
    await mkdir(dumpDir, { recursive: true });
    await writeFile(filePath, [header, ...mdRows].join("\n"), "utf-8");
    console.log(`Saved: ${filePath}`);
    process.exit(0);
  }

  console.log(`Symbol: ${symbol} | Direction: ${direction} | PriceOpen: ${priceOpen} | From: ${new Date(timestamp).toISOString()} | Minutes: ${minutes}`);
  console.log(`${"min".padStart(5)} | ${"timestamp".padEnd(24)} | ${"close".padStart(12)} | ${"pnl%".padStart(8)} | ${"peak%".padStart(8)} | ${"drawdown%".padStart(10)}`);
  console.log("-".repeat(83));

  for (const r of rows) {
    const min = String(r.min).padStart(5);
    const ts = new Date(r.timestamp).toISOString().padEnd(24);
    const close = r.close.toFixed(2).padStart(12);
    const pnlStr = (r.pnl >= 0 ? "+" : "") + r.pnl.toFixed(2) + "%";
    const peakStr = "+" + r.peak.toFixed(2) + "%";
    const drawdownStr = r.drawdown.toFixed(2) + "%";
    console.log(`${min} | ${ts} | ${close} | ${pnlStr.padStart(8)} | ${peakStr.padStart(8)} | ${drawdownStr.padStart(10)}`);
  }

  process.exit(0);
};

main();

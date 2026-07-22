// Полная сетка демо + ось entryDelayMinutes [0, 240, 480]: стало ли
// лучше? Сравниваем победителей рейтингов внутри каждой задержки.
import { addExchangeSchema, addSimulatorSchema, Simulator } from "backtest-kit";
import { singleshot } from "functools-kit";
import { readFileSync, writeFileSync } from "fs";
import ccxt from "ccxt";

const getExchange = singleshot(async () => {
  const exchange = new ccxt.binance({
    options: { defaultType: "spot", adjustForTimeDifference: true, recvWindow: 60000 },
    enableRateLimit: true,
  });
  await exchange.loadMarkets();
  return exchange;
});

addExchangeSchema({
  exchangeName: "ccxt_exchange",
  getCandles: async (symbol, interval, since, limit) => {
    const exchange = await getExchange();
    const candles = await exchange.fetchOHLCV(symbol, interval, since.getTime(), limit);
    return candles.map(([timestamp, open, high, low, close, volume]) => ({ timestamp, open, high, low, close, volume }));
  },
});

addSimulatorSchema({
  simulatorName: "exp_delay_grid",
  exchangeName: "ccxt_exchange",
  gridAxes: {
    hardStopPercent: [1, 1.5, 2, 2.5, 3, 4, 5, 7],
    trailingTakePercent: [0.5, 1, 1.5, 2, 3, 4],
    holdMinutes: [24 * 60, 2 * 24 * 60, 3 * 24 * 60],
    minIdeasAligned: [1, 2, 3],
    minAuthorTrack: [2, 3, 5],
    minAuthorHitRate: [0.5, 0.6],
    minWeightAligned: [0, 0.6, 1.2],
    profitLockPercent: [0, 1.5, 2.5],
    entryDelayMinutes: [0, 240, 480],
    authorMetric: ["close"],
  },
  callbacks: {
    onProgress: (_symbol, stage, processed, total) => {
      if (processed % 10000 === 0 || processed === total) {
        console.log(`[${stage}] ${processed}/${total}`);
      }
    },
  },
});

const ideas = readFileSync("./assets/tv-ideas.normalized.jsonl", "utf-8")
  .split("\n").filter(Boolean).map((line) => JSON.parse(line));

const t0 = Date.now();
const result = await Simulator.run({ symbol: "BTCUSDT", simulatorName: "exp_delay_grid", ideas });
console.log(`run: ${((Date.now() - t0) / 1000).toFixed(0)}s, reports: ${result.reports.length}`);

const fmt = (r) =>
  `H=${r.point.hardStopPercent} TT=${r.point.trailingTakePercent} hold=${r.point.holdMinutes / 60}h ` +
  `N=${r.point.minIdeasAligned} track=${r.point.minAuthorTrack} rate=${r.point.minAuthorHitRate} ` +
  `W=${r.point.minWeightAligned} lock=${r.point.profitLockPercent} delay=${r.point.entryDelayMinutes}m | ` +
  `trades=${r.trades} pnl=${r.totalPnlPercent.toFixed(2)} wr=${(r.winRate * 100).toFixed(0)}% ` +
  `dd=${r.maxSeriesDrawdownPercent.toFixed(2)} sharpe=${r.sharpe.toFixed(2)} sortino=${Number.isFinite(r.sortino) ? r.sortino.toFixed(2) : "inf"} ` +
  `skipNoData=${r.skippedNoData}`;

const MIN_TRADES = 8;
const criteria = [
  ["sharpe", (r) => r.sharpe],
  ["sortino", (r) => r.sortino],
  ["pnl", (r) => r.totalPnlPercent],
  ["recovery", (r) => r.recoveryFactor],
];

for (const delay of [0, 240, 480]) {
  console.log(`\n=== delay=${delay}m — победители по критериям (trades >= ${MIN_TRADES}) ===`);
  const subset = result.reports.filter(
    (r) => r.point.entryDelayMinutes === delay && r.trades >= MIN_TRADES,
  );
  for (const [name, value] of criteria) {
    const best = subset.reduce((a, b) => {
      const va = value(a), vb = value(b);
      if (va === vb) return a;
      return vb > va ? b : a;
    });
    console.log(`${name.padEnd(8)} ${fmt(best)}`);
  }
}

console.log("\n=== Общие победители рейтингов (best[]) ===");
for (const b of result.best) {
  if (b.report) console.log(`${b.criterion.padEnd(8)} ${fmt(b.report)}`);
}

const { reports, best, ...rest } = result;
writeFileSync("./dump/exp-delay-grid.done.json", JSON.stringify(result, null, 2));
console.log("\nsaved ./dump/exp-delay-grid.done.json;", JSON.stringify({ profiles: rest.profileCount, allowed: rest.allowedAuthors.length }));
process.exit(0);

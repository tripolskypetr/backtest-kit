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
  simulatorName: "tv_simulator",
  exchangeName: "ccxt_exchange",
  gridAxes: {
    hardStopPercent: [1, 1.5, 2, 2.5, 3, 4, 5, 7],
    trailingTakePercent: [0.5, 1, 1.5, 2, 3, 4],
    holdMinutes: [24 * 60, 2 * 24 * 60, 3 * 24 * 60],
    minIdeasAligned: [1, 2, 3],
    // правило бана авторов — тоже оси перебора
    minAuthorTrack: [2, 3, 5],
    minAuthorHitRate: [0.5, 0.6],
  },
});

const ideas = readFileSync("./assets/ts-ideas.normalized.jsonl", "utf-8")
  .split("\n").filter(Boolean).map((line) => JSON.parse(line));

// честный walk-forward: подбор точки и обучение фильтра авторов — на
// первых 70% времени ленты, проверка — на хвосте, которого train не видел
const sorted = [...ideas].sort((a, b) => a.ts - b.ts);
const cutoff = sorted[0].ts + (sorted[sorted.length - 1].ts - sorted[0].ts) * 0.7;
const trainIdeas = sorted.filter(({ ts }) => ts < cutoff);
const testIdeas = sorted.filter(({ ts }) => ts >= cutoff);

const result = await Simulator.run({ symbol: "BTCUSDT", simulatorName: "tv_simulator", ideas: trainIdeas });
const { reports, best, ...rest } = result;
writeFileSync("./dump/simulator.done.json", JSON.stringify(result, null, 2));
console.log("train saved; profiles:", rest.profileCount, "allowed:", rest.allowedAuthors.length, "banned:", rest.bannedAuthors.length);

// out-of-sample: точка Sharpe-победителя и трек-рекорд авторов заморожены,
// на тестовом хвосте ничего не обучается (невиданный автор = забанен)
const winner = best.find(({ criterion }) => criterion === "sharpe");
const testResult = await Simulator.test({
  symbol: "BTCUSDT",
  simulatorName: "tv_simulator",
  ideas: testIdeas,
  point: winner.report.point,
  authorStats: result.authorStats,
});
writeFileSync("./dump/simulator.test.json", JSON.stringify(testResult, null, 2));
console.log(
  "test saved; trades:", testResult.report.trades,
  "pnl:", testResult.report.totalPnlPercent.toFixed(2) + "%",
  "sharpe:", Number.isFinite(testResult.report.sharpe) ? testResult.report.sharpe.toFixed(2) : testResult.report.sharpe,
);
process.exit(0);

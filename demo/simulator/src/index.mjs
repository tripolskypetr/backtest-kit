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
    minWeightAligned: [0, 0.6, 1.2],
    profitLockPercent: [0, 1.5, 2.5],
    minAuthorWilson: [0, 0.6],
    // обе метрики авторского hit'а — перебор решает (BC не сохраняем)
    authorMetric: ["close", "reach"],
  },
});

const ideas = readFileSync("./assets/tv-ideas.normalized.jsonl", "utf-8")
  .split("\n").filter(Boolean).map((line) => JSON.parse(line));

const result = await Simulator.run({ symbol: "BTCUSDT", simulatorName: "tv_simulator", ideas });
const { reports, best, ...rest } = result;
writeFileSync("./dump/simulator.done.json", JSON.stringify(result, null, 2));
console.log("saved; profiles:", rest.profileCount, "allowed:", rest.allowedAuthors.length, "banned:", rest.bannedAuthors.length);
process.exit(0);

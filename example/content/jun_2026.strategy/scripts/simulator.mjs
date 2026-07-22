// Генератор assets/sweep.report.BTCUSDT.json — обученного артефакта
// (бан-лист/белый список авторов + сетка параметров) для боевой
// jun_2026.strategy.ts. Использует ядровую сущность Simulator:
// профили идей, антифлуд-дедуп (8ч × направление), дефолт-бан
// авторов, time-based Sharpe/Sortino, три рейтинга победителей.
//
// Запуск ИЗ ПАПКИ СТРАТЕГИИ (важно для persist-кеша свечей в ./dump):
//   cd example/content/jun_2026.strategy
//   bun scripts/simulator.mjs
//
// NB: импорт из локальной сборки ядра (../../../../build/index.mjs),
// пока версия пакета с Simulator не опубликована в npm.
import {
  addExchangeSchema,
  addSimulatorSchema,
  Simulator,
} from "../../../../build/index.mjs";
import { singleshot } from "functools-kit";
import { readFileSync, writeFileSync } from "fs";
import ccxt from "ccxt";

const ASSETS_URL = new URL("../assets/", import.meta.url);
const IDEAS_PATH = new URL("tv-ideas.normalized.jsonl", ASSETS_URL);
const REPORT_PATH = new URL("sweep.report.BTCUSDT.json", ASSETS_URL);

const getExchange = singleshot(async () => {
  const exchange = new ccxt.binance({
    options: {
      defaultType: "spot",
      adjustForTimeDifference: true,
      recvWindow: 60000,
    },
    enableRateLimit: true,
  });
  await exchange.loadMarkets();
  return exchange;
});

addExchangeSchema({
  exchangeName: "ccxt-exchange",
  getCandles: async (symbol, interval, since, limit) => {
    const exchange = await getExchange();
    const candles = await exchange.fetchOHLCV(
      symbol,
      interval,
      since.getTime(),
      limit,
    );
    return candles.map(([timestamp, open, high, low, close, volume]) => ({
      timestamp,
      open,
      high,
      low,
      close,
      volume,
    }));
  },
});

addSimulatorSchema({
  simulatorName: "jun_2026_simulator",
  exchangeName: "ccxt-exchange",
  gridAxes: {
    hardStopPercent: [1, 1.5, 2, 2.5, 3, 4, 5, 7],
    trailingTakePercent: [0.5, 1, 1.5, 2, 3, 4],
    holdMinutes: [24 * 60, 2 * 24 * 60, 3 * 24 * 60, 5 * 24 * 60],
    minIdeasAligned: [1, 2, 3],
    // правило бана авторов — тоже оси перебора
    minAuthorTrack: [2, 3, 5],
    minAuthorHitRate: [0.5, 0.6],
    // взвешенный консенсус: 0 = выкл, 0.6 ~ соло доказанного автора,
    // 1.1 ~ пара авторов (вес Лапласа (hits+1)/(ideas+2))
    minWeightAligned: [0],
    profitLockPercent: [0],
  },
});

const ideas = readFileSync(IDEAS_PATH, "utf-8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const result = await Simulator.run({
  symbol: "BTCUSDT",
  simulatorName: "jun_2026_simulator",
  ideas,
});

writeFileSync(REPORT_PATH, JSON.stringify(result, null, 2));

console.log("report:", REPORT_PATH.pathname);
console.log(
  "profiles:", result.profileCount,
  "| allowed:", result.allowedAuthors.length,
  "| banned:", result.bannedAuthors.length,
);
for (const best of result.best) {
  const { point } = best.report;
  console.log(
    `${best.criterion}: H=${point.hardStopPercent} TT=${point.trailingTakePercent} ` +
      `hold=${point.holdMinutes / 60}h N=${point.minIdeasAligned} | ` +
      `trades=${best.report.trades} pnl=${best.report.totalPnlPercent.toFixed(2)}% ` +
      `sharpe=${best.report.sharpe.toFixed(2)}`,
  );
}
process.exit(0);

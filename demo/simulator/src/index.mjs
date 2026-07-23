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

// Проба осуществимости, НЕ поиск заработка: вся собирающая прибыль
// механика выключена (замок, трейлинг, reach-метрика — территория
// demo/tune). Остаётся минимальный вопрос: даёт ли удержание идей
// проверенных авторов прибыльный КОРИДОР по стопу x холду x правилу
// бана — 48 точек вместо тысяч
addSimulatorSchema({
  simulatorName: "tv_simulator",
  exchangeName: "ccxt_exchange",
  gridAxes: {
    // грубая шкала катастрофы: коридор должен быть широким, не точкой
    hardStopPercent: [2, 3, 5, 7],
    // инертен (взводится с пика entry/(1-1) = бесконечность):
    // проба не собирает прибыль, выход — по времени или стопу
    trailingTakePercent: [100],
    holdMinutes: [24 * 60, 2 * 24 * 60, 3 * 24 * 60],
    // правило бана — единственная перебираемая "умность" пробы:
    // вопрос N3 — выживает ли кто-то в белом списке
    minAuthorTrack: [3, 5],
    minAuthorHitRate: [0.5, 0.6],
    profitLockPercent: [0],
    banCriteria: ["sharpe", "pnl"],
  },
  reportOrder: "sharpe",
});

const ideas = readFileSync("./assets/tv-ideas.normalized.jsonl", "utf-8")
  .split("\n").filter(Boolean).map((line) => JSON.parse(line));

const result = await Simulator.run({ symbol: "BTCUSDT", simulatorName: "tv_simulator", ideas });
const { reports, best, ...rest } = result;
writeFileSync("./dump/simulator.done.json", JSON.stringify(result, null, 2));
console.log("saved; profiles:", rest.profileCount, "allowed:", rest.allowedAuthors.length, "banned:", rest.bannedAuthors.length);
process.exit(0);

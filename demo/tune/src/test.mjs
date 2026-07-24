import { addExchangeSchema, addSimulatorSchema, Simulator } from "backtest-kit";
import { singleshot } from "functools-kit";
import { readFileSync } from "fs";
import ccxt from "ccxt";

const getExchange = singleshot(async () => {
  const exchange = new ccxt.binance({
    options: { defaultType: "spot", adjustForTimeDifference: true, recvWindow: 60000 },
    enableRateLimit: true,
    timeout: 15000,
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

// правило проекта: молчаливых дефолтов в конфигах нет — все параметры
// прописаны явно. Для test() сетка инертна (оценивается ровно одна
// замороженная точка POINT), поэтому оси задекларированы одноточечно,
// зеркаля POINT
addSimulatorSchema({
  simulatorName: "tv_simulator",
  exchangeName: "ccxt_exchange",
  gridAxes: {
    hardStopPercent: [5],
    trailingTakePercent: [2],
    holdMinutes: [3 * 24 * 60],
    minAuthorTrack: [5],
    minAuthorHitRate: [0.5],
    profitLockPercent: [2.5],
    authorMetric: ["close"],
  },
  reportOrder: "sharpe",
});

// точка, выявленная тренировкой (src/index.mjs, tune_default):
// лучший sharpe всех конфигов 2.44, сходимость sharpe/sortino/recovery
// внутри default и переизбрание ядра (H=5 TT=2 72h track=5 rate=0.5 +
// замок) всеми тремя теми же критериями tune_wide; sortino 9.34,
// dd 1.31, 9 сделок, строжайшее правило авторов.
// Метрика close — закрытие 5-дневного горизонта в сторону идеи
const POINT = {
  hardStopPercent: 5,
  trailingTakePercent: 2,
  holdMinutes: 3 * 24 * 60,
  minAuthorTrack: 5,
  minAuthorHitRate: 0.5,
  profitLockPercent: 2.5,
  authorMetric: "close",
};

// результат обучения: сырой трек-рекорд авторов train-окна,
// hit'ы посчитаны по close. Белый список НЕ хардкодится — test()
// выводит его из цифр под правило точки (ideas >= 5, hitRate >= 0.5):
// допущены TradingShot, Apex_Legends, Cryptollica,
// MarketStrategysignals, melikatrader94, PremiumTrader57,
// InvestingScope; все остальные и все невиданные — в бане.
const AUTHOR_STATS = [
  { author: "MasterAnanda", ideas: 16, hits: 7 },
  { author: "TradingShot", ideas: 10, hits: 6 },
  { author: "Apex_Legends", ideas: 7, hits: 4 },
  { author: "BitCoinGuide", ideas: 7, hits: 3 },
  { author: "Cryptollica", ideas: 6, hits: 3 },
  { author: "MarketStrategysignals", ideas: 6, hits: 4 },
  { author: "ExpertTraderASK", ideas: 6, hits: 2 },
  { author: "melikatrader94", ideas: 5, hits: 3 },
  { author: "CryptoSkullSignal", ideas: 5, hits: 2 },
  { author: "PremiumTrader57", ideas: 5, hits: 3 },
  { author: "InvestingScope", ideas: 5, hits: 3 },
  { author: "XAUxBTC_Pro", ideas: 4, hits: 3 },
  { author: "CobraVanguard", ideas: 3, hits: 1 },
  { author: "coinpediamarkets", ideas: 3, hits: 1 },
  { author: "salahuddin20041", ideas: 2, hits: 0 },
  { author: "Alpha_Trade_Scope", ideas: 2, hits: 1 },
  { author: "PRIMEALPHA-FX", ideas: 2, hits: 1 },
  { author: "tomas_jntx", ideas: 1, hits: 1 },
  { author: "JupahduhX", ideas: 1, hits: 1 },
  { author: "Rowland-Australia", ideas: 1, hits: 1 },
  { author: "brokerchampionofficial", ideas: 1, hits: 1 },
  { author: "CrowdWisdomTrading", ideas: 1, hits: 0 },
  { author: "EbonyFalcon", ideas: 1, hits: 0 },
  { author: "NastyPipz", ideas: 1, hits: 1 },
  { author: "isahebdadi", ideas: 1, hits: 1 },
  { author: "Ifiok-Trades", ideas: 1, hits: 1 },
  { author: "TheCryptagon", ideas: 1, hits: 0 },
  { author: "MohsenNirumand", ideas: 1, hits: 1 },
  { author: "ProfittoPath", ideas: 1, hits: 1 },
  { author: "Rendon1", ideas: 1, hits: 0 },
  { author: "byggjan", ideas: 1, hits: 0 },
  { author: "FXSMARTT", ideas: 1, hits: 1 },
  { author: "pistissophiacapital", ideas: 1, hits: 0 },
  { author: "DivergenceSeeker", ideas: 1, hits: 1 },
  { author: "davidjulien369", ideas: 1, hits: 0 },
  { author: "mrsignalll", ideas: 1, hits: 0 },
  { author: "VasilyTrader", ideas: 1, hits: 0 },
  { author: "propfirmwise", ideas: 1, hits: 0 },
  { author: "TheTraderPhil", ideas: 1, hits: 0 },
  { author: "JRnehco", ideas: 1, hits: 0 },
  { author: "Expert_Travis", ideas: 1, hits: 0 },
  { author: "BIGBULL-RUN", ideas: 1, hits: 1 },
];

const ideas = readFileSync("./assets/tv-ideas.normalized.jsonl", "utf-8")
  .split("\n").filter(Boolean).map((line) => JSON.parse(line));

// тот же временной сплит, что при обучении: тест — хвост после 70%
const sorted = [...ideas].sort((a, b) => a.ts - b.ts);
const cutoff = sorted[0].ts + (sorted[sorted.length - 1].ts - sorted[0].ts) * 0.7;
const testIdeas = sorted.filter(({ ts }) => ts >= cutoff);

// out-of-sample: обучения нет, точка и трек-рекорд заморожены выше
const result = await Simulator.test({
  symbol: "BTCUSDT",
  simulatorName: "tv_simulator",
  ideas: testIdeas,
  point: POINT,
  authorStats: AUTHOR_STATS,
});

console.log(
  JSON.stringify(result, null, 2)
);

process.exit(0);

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../../build/index.mjs";
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

const ideas = readFileSync("./assets/tv-ideas.normalized.jsonl", "utf-8")
  .split("\n").filter(Boolean).map((line) => JSON.parse(line));
// обучение видит ТОЛЬКО голову ленты: первые 70% времени.
// Хвост здесь не загружается вообще — он принадлежит src/test.mjs
const sorted = [...ideas].sort((a, b) => a.ts - b.ts);
const cutoff = sorted[0].ts + (sorted[sorted.length - 1].ts - sorted[0].ts) * 0.7;
const trainIdeas = sorted.filter(({ ts }) => ts < cutoff);

// Дефолтный конфиг
addSimulatorSchema({ 
    simulatorName: "tune_default", 
    exchangeName: "ccxt_exchange", 
    gridAxes: {
        // стопы < 2% сидят внутри медианного шейкаута (p25 MAE-до-пика
        // ~ -2.7%) и ни разу не выигрывали ни одного рейтинга
        hardStopPercent: [2, 2.5, 3, 4, 5, 7],
        // 0.5% — шум уровня 1m-свечи, ни одной победы ни в одном прогоне
        trailingTakePercent: [1, 1.5, 2, 3, 4],
        holdMinutes: [24 * 60, 2 * 24 * 60, 3 * 24 * 60],
        // N=3 не выигрывал нигде: побеждают 1 (соло проверенного) и 2
        minAuthorTrack: [2, 3, 5],
        minAuthorHitRate: [0.5, 0.6],
        profitLockPercent: [0, 1.5, 2.5],
        // close: hit — закрытие 5-дневного горизонта в сторону идеи
        authorMetric: ["close"],
    },
    reportOrder: "sharpe",
});


// короткие холды: освободить слот в плотном хвосте
addSimulatorSchema({ 
    simulatorName: "tune_shorthold", 
    exchangeName: "ccxt_exchange", 
    gridAxes: {
        hardStopPercent: [2, 3, 5, 7],
        trailingTakePercent: [1, 1.5, 2, 3],
        holdMinutes: [4 * 60, 8 * 60, 12 * 60, 24 * 60, 2 * 24 * 60],
        minAuthorTrack: [2, 3, 5],
        minAuthorHitRate: [0.5, 0.6],
        profitLockPercent: [0, 1, 2],
        authorMetric: ["close"],
    },
    reportOrder: "sharpe",
});

// плотный перебор замка при умеренных холдах
addSimulatorSchema({ 
    simulatorName: "tune_lockrich", 
    exchangeName: "ccxt_exchange", 
    gridAxes: {
        hardStopPercent: [2, 3, 5],
        trailingTakePercent: [1.5, 3],
        holdMinutes: [12 * 60, 24 * 60, 2 * 24 * 60, 3 * 24 * 60],
        minAuthorTrack: [2, 3],
        minAuthorHitRate: [0.5, 0.6],
        profitLockPercent: [0, 0.5, 1, 1.5, 2, 2.5, 3],
        authorMetric: ["close"],
    },
    reportOrder: "sharpe",
});

// широкий компромисс: холды от 4ч до 72ч + замок
addSimulatorSchema({ 
    simulatorName: "tune_wide", 
    exchangeName: "ccxt_exchange", 
    gridAxes: {
        hardStopPercent: [2, 3, 5, 7],
        trailingTakePercent: [1, 2, 3, 4],
        holdMinutes: [4 * 60, 8 * 60, 24 * 60, 2 * 24 * 60, 3 * 24 * 60],
        minAuthorTrack: [2, 3, 5],
        minAuthorHitRate: [0.5, 0.6],
        profitLockPercent: [0, 1, 2],
        authorMetric: ["close"],
    },
    reportOrder: "sharpe",
});

const fmt = (value) => (Number.isFinite(value) ? +value.toFixed(2) : "inf");

const result = [];

// только обучение: победители рейтингов по train-метрикам.
// Их точки и трек-рекорд авторов — кандидаты на хардкод в src/test.mjs,
// единственный выстрел по хвосту делается там
const runTune = async (simulatorName) => {
  const train = await Simulator.run({ symbol: "BTCUSDT", simulatorName, ideas: trainIdeas });

  // конфиги пинуют authorMetric: ["close"] — работаем с его корзиной
  const bucket = train.reports.close;

  for (const best of bucket.best) {
    if (!best.report) {
      continue;
    }
    const p = best.report.point;

    result.push({
      config: simulatorName,
      by: best.criterion,
      point: `H=${p.hardStopPercent} TT=${p.trailingTakePercent} hold=${p.holdMinutes / 60}h track=${p.minAuthorTrack} rate=${p.minAuthorHitRate} lock=${p.profitLockPercent} metric=${p.authorMetric}`,
      train: {
        trades: best.report.trades,
        pnl: fmt(best.report.totalPnlPercent),
        wr: fmt(best.report.winRate),
        dd: fmt(best.report.maxSeriesDrawdownPercent),
        sharpe: fmt(best.report.sharpe),
        sortino: fmt(best.report.sortino),
      },
    });

  }

  // сырой трек-рекорд под правило Sharpe-победителя корзины —
  // источник для AUTHOR_STATS в src/test.mjs
  const sharpeBest = bucket.best.find(({ criterion }) => criterion === "sharpe");
  result.push({
    config: simulatorName,
    authorStats: (sharpeBest?.authorStats ?? []).map(({ author, ideas, hits }) => ({ author, ideas, hits })),
  });
};

await runTune("tune_default");
await runTune("tune_shorthold");
await runTune("tune_lockrich");
await runTune("tune_wide");

console.log(JSON.stringify(result, null, 2));

process.exit(0);

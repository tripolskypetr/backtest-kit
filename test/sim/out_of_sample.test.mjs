import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Out-of-sample контракт Simulator.test(): точка и трек-рекорд
 * авторов ЗАМОРОЖЕНЫ из train-прогона, на тестовых данных ничего
 * не обучается.
 *
 * Мир — пила eternal_hold: дрейф вверх + всплеск +1% на фазах 2..61
 * каждого цикла 481 минуту, всплески идут во всех циклах.
 *
 *  - train (циклы 0..9): prophet постит LONG в начале каждого цикла —
 *    10 идей, все hit; после run() prophet в белом списке, трек = 10;
 *  - test (циклы 10..15): prophet постит 6 идей (те же всплески) —
 *    сделки идут; stranger постит 5 объективно верных LONG — но в
 *    трейне его не было: недоказанный = забанен, ни одной сделки.
 *
 * Проверяется: сделки только по prophet, замороженная статистика
 * несёт train-цифры (10 идей, не 6), stranger в bannedAuthors,
 * onAuthorsTrained во время test() не эмитится вовсе.
 */

const START = 1704067200000;
const MINUTE = 60_000;
const CYCLE = 481;

const priceAt = (timestamp) => {
  const m = Math.floor((timestamp - START) / MINUTE);
  if (m < 0) return 1000;
  const base = 1000 * (1 + 1e-6 * m);
  const phase = m % CYCLE;
  if (phase >= 2 && phase <= 61) {
    return base * 1.01;
  }
  return base;
};

const idea = (id, minute, direction, author) => ({
  id,
  ts: START + minute * MINUTE,
  symbol: "TESTUSDT",
  direction,
  author,
});

test("SIM: out-of-sample test freezes the point and the author track record", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "sim-oos-exchange",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = Math.floor(since.getTime() / MINUTE) * MINUTE;
      return Array.from({ length: limit }, (_, i) => {
        const timestamp = alignedSince + i * MINUTE;
        const open = priceAt(timestamp);
        const close = priceAt(timestamp + MINUTE);
        return { timestamp, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 100 };
      });
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  let authorsTrainedCalls = 0;
  let testDoneResult = null;
  addSimulatorSchema({
    simulatorName: "sim_oos",
    exchangeName: "sim-oos-exchange",
    gridAxes: {
      hardStopPercent: [50],
      trailingTakePercent: [100],
      holdMinutes: [60],
      minIdeasAligned: [1],
      minAuthorTrack: [3],
      minAuthorHitRate: [0.5],
      minWeightAligned: [0],
      profitLockPercent: [0],
      authorMetric: ["close"],
    },
    callbacks: {
      onAuthorsTrained: () => { authorsTrainedCalls += 1; },
      onTestDone: (_symbol, result) => { testDoneResult = result; },
    },
  });

  // --- train: циклы 0..9, только prophet ---
  const trainIdeas = Array.from({ length: 10 }, (_, k) =>
    idea(1 + k, k * CYCLE, "LONG", "prophet"),
  );
  const train = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_oos",
    ideas: trainIdeas,
  });
  const winner = train.best.find(({ criterion }) => criterion === "sharpe");
  if (!winner?.report || !train.best.find(({ criterion }) => criterion === "sharpe").allowedAuthors.includes("prophet")) {
    fail(`train must allow prophet with a sharpe winner, got ${JSON.stringify(train.best.find(({ criterion }) => criterion === "sharpe").allowedAuthors)}`);
    return;
  }
  // артефакт авторов есть у КАЖДОГО победителя под его собственное
  // правило бана — белый список не глобаль прогона, а свойство точки
  for (const b of train.best) {
    if (!b.allowedAuthors.includes("prophet") || b.authorStats.length === 0 || b.bannedAuthors.length !== 0) {
      fail(`per-ranking author artifact broken for ${b.criterion}: ${JSON.stringify({ allowed: b.allowedAuthors, banned: b.bannedAuthors })}`);
      return;
    }
  }
  const trainedCallsAfterTrain = authorsTrainedCalls;
  if (trainedCallsAfterTrain === 0) {
    fail(`run() must emit onAuthorsTrained at least once`);
    return;
  }

  // --- test: циклы 10..15, prophet + невиданный в трейне stranger ---
  const testIdeas = [
    ...Array.from({ length: 6 }, (_, k) => idea(100 + k, (10 + k) * CYCLE, "LONG", "prophet")),
    ...Array.from({ length: 5 }, (_, k) => idea(200 + k, (10 + k) * CYCLE + 100, "LONG", "stranger")),
  ];
  const result = await Simulator.test({
    symbol: "TESTUSDT",
    simulatorName: "sim_oos",
    ideas: testIdeas,
    point: winner.report.point,
    authorStats: train.best.find(({ criterion }) => criterion === "sharpe").authorStats,
  });

  // на тесте ничего не обучается: onAuthorsTrained не эмитился
  if (authorsTrainedCalls !== trainedCallsAfterTrain) {
    fail(`test() must not emit onAuthorsTrained, calls grew ${trainedCallsAfterTrain} -> ${authorsTrainedCalls}`);
    return;
  }

  // профили построены для всех 11 идей, сделки — только по prophet
  if (result.profileCount !== 11 || result.ideasDirectional !== 11) {
    fail(`expected 11 test profiles, got ${result.profileCount}/${result.ideasDirectional}`);
    return;
  }
  if (result.report.trades !== 6) {
    fail(`expected 6 prophet trades, got ${result.report.trades}`);
    return;
  }
  const prophetIds = new Set(testIdeas.filter(({ author }) => author === "prophet").map(({ id }) => id));
  if (!result.trades.every(({ ideaId }) => prophetIds.has(ideaId))) {
    fail(`every trade must come from prophet, got ${JSON.stringify(result.trades.map(({ ideaId }) => ideaId))}`);
    return;
  }
  if (result.report.totalPnlPercent <= 0) {
    fail(`spike world must stay profitable out-of-sample, got ${result.report.totalPnlPercent}`);
    return;
  }

  // статистика ЗАМОРОЖЕНА: train-цифры (10 идей), не тестовые (6)
  const prophetStat = result.authorStats.find(({ author }) => author === "prophet");
  if (!prophetStat || prophetStat.ideas !== 10 || prophetStat.hits !== 10 || prophetStat.banned) {
    fail(`prophet stat must be the frozen train track 10/10, got ${JSON.stringify(prophetStat)}`);
    return;
  }
  if (result.authorStats.some(({ author }) => author === "stranger")) {
    fail(`stranger must not appear in the frozen stats`);
    return;
  }

  // недоказанный = забанен: stranger в бан-листе, prophet — в белом
  if (!result.allowedAuthors.includes("prophet") || result.allowedAuthors.includes("stranger")) {
    fail(`whitelist must be exactly the frozen prophet, got ${JSON.stringify(result.allowedAuthors)}`);
    return;
  }
  if (!result.bannedAuthors.includes("stranger")) {
    fail(`stranger (unseen in train) must be banned by default, got ${JSON.stringify(result.bannedAuthors)}`);
    return;
  }

  // точка возвращается как есть, onTestDone несёт тот же результат
  if (JSON.stringify(result.point) !== JSON.stringify(winner.report.point)) {
    fail(`result.point must be the frozen train point`);
    return;
  }
  if (!testDoneResult || testDoneResult.report.trades !== result.report.trades) {
    fail(`onTestDone must carry the same result`);
    return;
  }

  pass(
    `out-of-sample: 6/6 prophet trades pnl=${result.report.totalPnlPercent.toFixed(2)}% ` +
    `sharpe=${result.report.sharpe.toFixed(2)}, stranger (5 correct ideas) banned as unproven, ` +
    `frozen track 10/10 intact, no training callbacks on test data`
  );
});

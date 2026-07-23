import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Метрика "retain" — фиксация уровня без временного окна (медиана):
 *  1) спайкер (укол +3% на минуты, потом база) — hit по reach, но
 *     MISS по retain: медиана хода ~0, уровень не зафиксирован;
 *     фиксер (ступенька +3% и стоит до конца горизонта) — hit по
 *     обеим; ось authorMetric ["reach", "retain"] даёт ДВЕ тренировки
 *     с разными бан-листами и разным числом сделок;
 *  2) medianMovePercent профиля численно точен (сверка по миру);
 *  3) структурная деградация: retain с lock=0 канонизируется в close
 *     — точки ["close", "retain"] при lock=0 делят ОДНУ тренировку.
 *
 * Мир: цикл длиной ровно в горизонт (7200м). Чётные циклы — паттерн
 * спайкера (+3% на фазах 2..60, дальше база), нечётные — паттерн
 * фиксера (+3% с фазы 2 до конца цикла). Идеи в начале своих циклов,
 * горизонты не пересекаются (кроме 1 свечи на границе).
 */

const START = 1704067200000;
const MINUTE = 60_000;
const CYCLE = 7200;

const priceAt = (timestamp) => {
  const m = Math.floor((timestamp - START) / MINUTE);
  if (m < 0) return 1000;
  const cycle = Math.floor(m / CYCLE);
  const phase = m % CYCLE;
  const spikerCycle = cycle % 2 === 0;
  if (phase < 2) return 1000;
  if (spikerCycle) {
    // укол: +3% только на фазах 2..60
    return phase <= 60 ? 1030 : 1000;
  }
  // фиксация: +3% с фазы 2 и до конца цикла
  return 1030;
};

const idea = (id, cycle, author) => ({
  id,
  ts: START + cycle * CYCLE * MINUTE,
  symbol: "TESTUSDT",
  direction: "LONG",
  author,
});

const registerExchange = (exchangeName) => {
  addExchangeSchema({
    exchangeName,
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
};

// 5 идей спайкера в чётных циклах, 5 идей фиксера в нечётных
const IDEAS = [
  ...Array.from({ length: 5 }, (_, k) => idea(10 + k, 2 * k, "spiker")),
  ...Array.from({ length: 5 }, (_, k) => idea(20 + k, 2 * k + 1, "fixer")),
];

test("SIM: retain metric bans the transient spiker where reach allows him — the median detects fixation", async ({ pass, fail }) => {
  registerExchange("sim-retain-exchange");

  const trained = [];
  const captured = [];
  const profiles = [];
  addSimulatorSchema({
    simulatorName: "sim_retain",
    exchangeName: "sim-retain-exchange",
    gridAxes: {
      hardStopPercent: [5],
      trailingTakePercent: [100],
      holdMinutes: [60],
      minAuthorTrack: [3],
      minAuthorHitRate: [0.5],
      profitLockPercent: [2.5],
      authorMetric: ["reach", "retain"],
    },
    callbacks: {
      onProfiles: (_symbol, list) => profiles.push(...list),
      onAuthorsTrained: (_symbol, stats) => trained.push(stats),
      onGridPoint: (_symbol, report, trades) => captured.push({ report, trades }),
    },
  });

  await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_retain",
    ideas: IDEAS,
  });

  // медиана профиля численно точна: у фиксера ~+3% (весь горизонт на
  // уровне), у спайкера ~0 (укол в 59 свечей из 7200 медиану не двигает)
  const fixerProfile = profiles.find(({ idea: { author } }) => author === "fixer");
  const spikerProfile = profiles.find(({ idea: { author } }) => author === "spiker");
  if (!fixerProfile || Math.abs(fixerProfile.medianMovePercent - 3) > 0.01) {
    fail(`fixer median must be ~3%, got ${fixerProfile?.medianMovePercent}`);
    return;
  }
  if (!spikerProfile || Math.abs(spikerProfile.medianMovePercent) > 0.01) {
    fail(`spiker median must be ~0%, got ${spikerProfile?.medianMovePercent}`);
    return;
  }

  // два правила -> две тренировки с разными вердиктами по спайкеру
  if (trained.length !== 2 || captured.length !== 2) {
    fail(`expected 2 trainings / 2 points, got ${trained.length}/${captured.length}`);
    return;
  }
  const byAuthor = (stats) => Object.fromEntries(stats.map((s) => [s.author, s]));
  const byMetric = new Map(
    captured.map((entry) => [entry.report.point.authorMetric, entry]),
  );

  // reach: оба 5/5 — укол дотянулся до 2.5, фиксация тем более
  const reachStats = byAuthor(trained[0]);
  if (reachStats.spiker.hits !== 5 || reachStats.spiker.banned) {
    fail(`reach must credit the spiker 5/5, got ${JSON.stringify(reachStats.spiker)}`);
    return;
  }
  if (reachStats.fixer.hits !== 5 || reachStats.fixer.banned) {
    fail(`reach must credit the fixer 5/5, got ${JSON.stringify(reachStats.fixer)}`);
    return;
  }

  // retain: спайкер 0/5 (медиана ~0 < 2.5) — бан; фиксер 5/5 — допуск
  const retainStats = byAuthor(trained[1]);
  if (retainStats.spiker.hits !== 0 || !retainStats.spiker.banned) {
    fail(`retain must ban the spiker 0/5, got ${JSON.stringify(retainStats.spiker)}`);
    return;
  }
  if (retainStats.fixer.hits !== 5 || retainStats.fixer.banned) {
    fail(`retain must allow the fixer 5/5, got ${JSON.stringify(retainStats.fixer)}`);
    return;
  }

  // сделки: reach-точка торгует обоих (10), retain-точка — только фиксера (5)
  if (byMetric.get("reach").trades.length !== 10) {
    fail(`reach point must trade both authors (10), got ${byMetric.get("reach").trades.length}`);
    return;
  }
  const retainTrades = byMetric.get("retain").trades;
  if (retainTrades.length !== 5 || !retainTrades.every(({ ideaId }) => ideaId >= 20)) {
    fail(`retain point must trade only the fixer's 5 ideas, got ${retainTrades.length}`);
    return;
  }

  pass(
    `retain vs reach: spiker (median ~0) banned by retain but 5/5 by reach; ` +
    `fixer (median ~3%) allowed by both; trades 10 vs 5`
  );
});

test("SIM: retain with lock=0 degenerates into close — one shared training for close and retain points", async ({ pass, fail }) => {
  registerExchange("sim-retain-degenerate");

  const trained = [];
  addSimulatorSchema({
    simulatorName: "sim_retain_degenerate",
    exchangeName: "sim-retain-degenerate",
    gridAxes: {
      hardStopPercent: [5],
      trailingTakePercent: [100],
      holdMinutes: [60],
      minAuthorTrack: [3],
      minAuthorHitRate: [0.5],
      // замка нет: retain-точке нечем грейдить — правило канонизируется
      // в close, и обе точки обязаны разделить ОДНУ тренировку
      profitLockPercent: [0],
      authorMetric: ["close", "retain"],
    },
    callbacks: {
      onAuthorsTrained: (_symbol, stats) => trained.push(stats),
    },
  });

  const result = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_retain_degenerate",
    ideas: IDEAS,
  });

  if (Object.values(result.reports).flatMap((b) => b.reports).length !== 2) {
    fail(`expected 2 grid points, got ${Object.values(result.reports).flatMap((b) => b.reports).length}`);
    return;
  }
  if (trained.length !== 1) {
    fail(`lock=0 must canonize retain into close (1 shared training), got ${trained.length}`);
    return;
  }

  pass(`retain@lock=0 degenerated into close: 2 points, 1 shared filter training`);
});

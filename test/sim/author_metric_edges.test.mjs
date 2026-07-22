import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Границы математики reach-метрики (AUTHOR_HIT_FN), формульно:
 *
 *  1) Пороги строгие ровно там, где заявлено:
 *     - hit требует maxMfePercent >= lock: касание РОВНО +2.5% — hit,
 *       +2.49% — miss;
 *     - hit требует shakeoutMaePercent > -stop (СТРОГО): просадка до
 *       пика ровно -5% при стопе 5 — miss, -4.9% — hit.
 *     Каждый паттерн — СВОЙ мир и свой прогон: 5-дневный горизонт
 *     идеи накрывает ~15 циклов, и смешение паттернов в одной ленте
 *     отравило бы shakeout всем (проверено — отравляет). Миры без
 *     дрейфа (база 1000) — проценты точны в плавучке.
 *  2) lock=0 деградирует reach в close: спайкер (+4% за полчаса,
 *     -3% к горизонту) при metric="reach" и lock=0 банится так же,
 *     как по close — 0 hits, 0 сделок.
 */

const START = 1704067200000;
const MINUTE = 60_000;
const CYCLE = 481;

// один паттерн на весь мир, повторяется каждый цикл:
// подъём к peak за фазы 2..30, возврат к floor... к 100, дальше база
const patternFactor = (rise, p) => {
  if (p <= 1) return 1;
  if (p <= 30) return 1 + (rise * (p - 1)) / 29;
  if (p <= 100) return 1 + rise - (rise * (p - 30)) / 70;
  return 1;
};

// яма к dip за фазы 2..30, подъём к 1.04 к фазе 100, дальше 1.04
const shakeFactor = (dip, p) => {
  if (p <= 1) return 1;
  if (p <= 30) return 1 - (dip * (p - 1)) / 29;
  if (p <= 100) return 1 - dip + ((0.04 + dip) * (p - 30)) / 70;
  return 1.04;
};

const WORLDS = {
  touch: (p) => patternFactor(0.025, p),
  under: (p) => patternFactor(0.0249, p),
  shake: (p) => shakeFactor(0.05, p),
  shakeok: (p) => shakeFactor(0.049, p),
};

const idea = (id, minute, author) => ({
  id,
  ts: START + minute * MINUTE,
  symbol: "TESTUSDT",
  direction: "LONG",
  author,
});

const registerWorld = (exchangeName, priceAt) => {
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

test("SIM: reach thresholds are exact — >= on the lock touch, strictly > on the shakeout stop", async ({ pass, fail }) => {
  // ожидание по каждому миру: hit-счёт автора и статус бана
  const EXPECT = {
    touch: { hits: 5, banned: false },   // +2.5 ровно: >= lock -> hit
    under: { hits: 0, banned: true },    // +2.49: < lock -> miss
    shake: { hits: 0, banned: true },    // shakeout -5.0 ровно: НЕ > -stop -> miss
    shakeok: { hits: 5, banned: false }, // shakeout -4.9: > -stop -> hit
  };

  for (const [name, factor] of Object.entries(WORLDS)) {
    registerWorld(`sim-reach-${name}-exchange`, (timestamp) => {
      const m = Math.floor((timestamp - START) / MINUTE);
      return m < 0 ? 1000 : 1000 * factor(m % CYCLE);
    });

    const trainedStats = [];
    addSimulatorSchema({
      simulatorName: `sim_reach_${name}`,
      exchangeName: `sim-reach-${name}-exchange`,
      gridAxes: {
        hardStopPercent: [5],
        trailingTakePercent: [100],
        holdMinutes: [60],
        minIdeasAligned: [1],
        minAuthorTrack: [5],
        minAuthorHitRate: [0.5],
        minWeightAligned: [0],
        profitLockPercent: [2.5],
        minAuthorWilson: [0],
        authorMetric: ["reach"],
      },
      callbacks: {
        onAuthorsTrained: (_symbol, stats) => trainedStats.push(stats),
      },
    });

    await Simulator.run({
      symbol: "TESTUSDT",
      simulatorName: `sim_reach_${name}`,
      ideas: Array.from({ length: 5 }, (_, k) => idea(1 + k, k * CYCLE, name)),
    });

    const stat = trainedStats[0]?.find(({ author }) => author === name);
    const expected = EXPECT[name];
    if (!stat || stat.hits !== expected.hits || stat.banned !== expected.banned) {
      fail(`${name}: expected ${expected.hits}/5 hits banned=${expected.banned}, got ${JSON.stringify(stat)}`);
      return;
    }
  }

  pass("reach edges exact: +2.5 hit / +2.49 miss (>= lock), shakeout -4.9 hit / -5.0 miss (strictly > -stop)");
});

test("SIM: reach with lock=0 degrades to the close metric — the spiker stays banned", async ({ pass, fail }) => {
  // спайкер: +4% за полчаса, к горизонту -3% (все циклы одинаковы)
  registerWorld("sim-reach-fallback-exchange", (timestamp) => {
    const m = Math.floor((timestamp - START) / MINUTE);
    if (m < 0) return 1000;
    const p = m % CYCLE;
    let f;
    if (p <= 1) f = 1;
    else if (p <= 30) f = 1 + (0.04 * (p - 1)) / 29;
    else if (p <= 200) f = 1.04 - (0.07 * (p - 30)) / 170;
    else f = 0.97;
    return 1000 * f;
  });

  const trainedStats = [];
  addSimulatorSchema({
    simulatorName: "sim_reach_fallback",
    exchangeName: "sim-reach-fallback-exchange",
    gridAxes: {
      hardStopPercent: [5],
      trailingTakePercent: [100],
      holdMinutes: [240],
      minIdeasAligned: [1],
      minAuthorTrack: [5],
      minAuthorHitRate: [0.5],
      minWeightAligned: [0],
      profitLockPercent: [0],
      minAuthorWilson: [0],
      authorMetric: ["reach"],
    },
    callbacks: {
      onAuthorsTrained: (_symbol, stats) => trainedStats.push(stats),
    },
  });

  const result = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_reach_fallback",
    ideas: Array.from({ length: 5 }, (_, k) => idea(1 + k, k * CYCLE, "spiker")),
  });

  const spiker = trainedStats[0]?.find(({ author }) => author === "spiker");
  // MFE +4% есть у каждой идеи, но lock=0: reach обязан деградировать
  // в close (горизонт -3% = miss), а не считать всё подряд hit'ом
  if (!spiker || spiker.hits !== 0 || !spiker.banned) {
    fail(`lock=0 must fall back to close (0/5 hits, banned), got ${JSON.stringify(spiker)}`);
    return;
  }
  const [report] = result.reports;
  if (report.trades !== 0) {
    fail(`banned spiker must produce 0 trades, got ${report.trades}`);
    return;
  }

  pass("lock=0 fallback exact: reach counts the spiker 0/5 by close semantics, banned, zero trades");
});

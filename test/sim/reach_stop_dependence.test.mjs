import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Reach-hits зависят от СТОПА точки: ось hardStopPercent [3, 5] при
 * metric "reach" обязана дать ДВЕ тренировки фильтра (ключ кеша
 * включает stop), и автор с ямой -4% до пика:
 *  - при стопе 3 — miss (яма глубже стопа, идею вынесло бы), бан,
 *    ноль сделок у точки H=3;
 *  - при стопе 5 — hit (яма пережита, замок собран), допуск,
 *    5 сделок profit_lock у точки H=5.
 * Регрессия, склеившая тренировки по метрике без стопа, молча
 * приравняет эти правила — тест это ловит.
 *
 * Мир per cycle: яма до -4% (фазы 2..30), пик +4% (31..60), откат к
 * базе (61..100) — яма НЕ задевает стоп 5 в торговле (960 > 950.95).
 */

const START = 1704067200000;
const MINUTE = 60_000;
const CYCLE = 481;

const priceAt = (timestamp) => {
  const m = Math.floor((timestamp - START) / MINUTE);
  if (m < 0) return 1000;
  const p = m % CYCLE;
  if (p <= 1) return 1000;
  if (p <= 30) return 1000 - (40 * (p - 1)) / 29;
  if (p <= 60) return 960 + (80 * (p - 30)) / 30;
  if (p <= 100) return 1040 - (40 * (p - 60)) / 40;
  return 1000;
};

const idea = (id, minute) => ({
  id,
  ts: START + minute * MINUTE,
  symbol: "TESTUSDT",
  direction: "LONG",
  author: "dipper",
});

test("SIM: reach hit counts follow the point's stop — two trainings for H=[3,5]", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "sim-reachstop-exchange",
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

  const trainings = [];
  const byStop = new Map();
  addSimulatorSchema({
    simulatorName: "sim_reachstop",
    exchangeName: "sim-reachstop-exchange",
    gridAxes: {
      hardStopPercent: [3, 5],
      trailingTakePercent: [100],
      holdMinutes: [240],
      minAuthorTrack: [5],
      minAuthorHitRate: [0.5],
      profitLockPercent: [2.5],
    },
    callbacks: {
      onAuthorsTrained: (_symbol, stats) => trainings.push(stats),
      onGridPoint: (_symbol, report) => byStop.set(report.point.hardStopPercent, report),
    },
  });

  await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_reachstop",
    ideas: Array.from({ length: 5 }, (_, k) => idea(1 + k, k * CYCLE)),
  });

  // две тренировки — по одной на каждый reach-контекст стопа
  if (trainings.length !== 2) {
    fail(`H=[3,5] under reach must train the filter twice, got ${trainings.length}`);
    return;
  }
  const hitCounts = trainings
    .map((stats) => stats.find(({ author }) => author === "dipper")?.hits)
    .sort((a, b) => a - b);
  if (hitCounts[0] !== 0 || hitCounts[1] !== 5) {
    fail(`dipper must be 0/5 hits vs stop 3 and 5/5 vs stop 5, got ${JSON.stringify(hitCounts)}`);
    return;
  }

  // H=3: бан по reach (яма -4 глубже стопа 3) -> ноль сделок
  const strict = byStop.get(3);
  if (strict.trades !== 0) {
    fail(`stop 3 point must ban the dipper (shakeout -4), got ${strict.trades} trades`);
    return;
  }
  // H=5: допуск, все 5 идей сняты замком
  const soft = byStop.get(5);
  if (soft.trades !== 5 || soft.exitReasons.profit_lock !== 5) {
    fail(`stop 5 point must harvest 5/5 by profit_lock, got ${JSON.stringify(soft.exitReasons)}`);
    return;
  }

  pass("reach follows the stop: 0/5 hits vs stop 3 (banned, 0 trades), 5/5 vs stop 5 (5 profit_lock exits), two distinct trainings");
});

import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Взвешенный консенсус наследует метрику авторского hit'а: вес
 * Лапласа (hits+1)/(ideas+2) спайкера при close = (0+1)/(5+2) ≈
 * 0.14, при reach = (5+1)/(5+2) ≈ 0.86. Автор НЕ забанен ни в одной
 * точке (rate 0) — гейт W=0.5 изолирован от бана:
 *  - close-точка: вес 0.14 < 0.5 — все входы отрезаны W-гейтом,
 *    ноль сделок при нулевом skippedBusy;
 *  - reach-точка: вес 0.86 >= 0.5 — 5 сделок profit_lock.
 *
 * Мир спайкера: +5% за полчаса, слив к 0.97 до конца цикла — close
 * к 5-дневному горизонту мимо, замок собирает.
 */

const START = 1704067200000;
const MINUTE = 60_000;
const CYCLE = 481;

const priceAt = (timestamp) => {
  const m = Math.floor((timestamp - START) / MINUTE);
  if (m < 0) return 1000;
  const p = m % CYCLE;
  if (p <= 1) return 1000;
  if (p <= 30) return 1000 + (50 * (p - 1)) / 29;
  if (p <= 200) return 1050 - (80 * (p - 30)) / 170;
  return 970;
};

const idea = (id, minute) => ({
  id,
  ts: START + minute * MINUTE,
  symbol: "TESTUSDT",
  direction: "LONG",
  author: "spiker",
});

test("SIM: weighted consensus inherits the author metric — W gate cuts close weights, passes reach weights", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "sim-wreach-exchange",
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

  const byMetric = new Map();
  const trainings = [];
  addSimulatorSchema({
    simulatorName: "sim_wreach",
    exchangeName: "sim-wreach-exchange",
    gridAxes: {
      hardStopPercent: [5],
      trailingTakePercent: [100],
      holdMinutes: [240],
      minIdeasAligned: [1],
      minAuthorTrack: [5],
      minAuthorHitRate: [0],
      minWeightAligned: [0.5],
      profitLockPercent: [2.5],
      entryDelayMinutes: [0],
      minAuthorWilson: [0],
      authorMetric: ["close", "reach"],
    },
    callbacks: {
      onAuthorsTrained: (_symbol, stats) => trainings.push(stats),
      onGridPoint: (_symbol, report) => byMetric.set(report.point.authorMetric, report),
    },
  });

  await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_wreach",
    ideas: Array.from({ length: 5 }, (_, k) => idea(1 + k, k * CYCLE)),
  });

  // изоляция: rate 0 — спайкер допущен в ОБЕИХ тренировках,
  // разница только в hits (весах), не в бане
  if (trainings.length !== 2 || trainings.some((stats) => stats.find(({ author }) => author === "spiker")?.banned)) {
    fail(`spiker must stay allowed in both trainings, got ${JSON.stringify(trainings.map((s) => s[0]))}`);
    return;
  }

  const closePoint = byMetric.get("close");
  if (closePoint.trades !== 0 || closePoint.skippedBusy !== 0) {
    fail(`close weights (~0.14) must be cut by W=0.5 with zero busy skips, got trades=${closePoint.trades} skipped=${closePoint.skippedBusy}`);
    return;
  }

  const reachPoint = byMetric.get("reach");
  if (reachPoint.trades !== 5 || reachPoint.exitReasons.profit_lock !== 5) {
    fail(`reach weights (~0.86) must pass W=0.5 into 5 profit_lock trades, got ${JSON.stringify(reachPoint.exitReasons)}`);
    return;
  }

  pass("W=0.5 gate splits by metric weights: close 0.14 -> 0 trades (not banned, gated), reach 0.86 -> 5/5 profit_lock");
});

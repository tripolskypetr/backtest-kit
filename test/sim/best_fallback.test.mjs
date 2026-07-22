import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Fallback анти-флюка: когда НИ ОДНА точка не добирает
 * MIN_TRADES_FOR_BEST (8), победителем становится sorted[0] — лучшая
 * по критерию среди всех, а НЕ первая по порядку сетки.
 *
 * Мир: спайк +1% на фазах 2..61 цикла, 5 идей (5 сделок < 8 у обеих
 * точек). Ось hold [120, 60] НАРОЧНО ставит худшую точку первой:
 *  - hold=120: спайк кончился, выход time_expired в минус;
 *  - hold=60: выход на спайке, +0.6% каждая.
 * Все четыре критерия обязаны выбрать hold=60 — вторую по порядку.
 */

const START = 1704067200000;
const MINUTE = 60_000;
const CYCLE = 481;

const priceAt = (timestamp) => {
  const m = Math.floor((timestamp - START) / MINUTE);
  if (m < 0) return 1000;
  const p = m % CYCLE;
  if (p >= 2 && p <= 61) return 1010;
  return 1000;
};

const idea = (id, minute) => ({
  id,
  ts: START + minute * MINUTE,
  symbol: "TESTUSDT",
  direction: "LONG",
  author: "prophet",
});

test("SIM: with no point above the anti-fluke floor the fallback picks the BEST point, not the first", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "sim-fallback-exchange",
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

  addSimulatorSchema({
    simulatorName: "sim_fallback",
    exchangeName: "sim-fallback-exchange",
    gridAxes: {
      hardStopPercent: [50],
      trailingTakePercent: [100],
      // худшая точка (hold=120) первой в сетке — fallback обязан её
      // ПЕРЕПРЫГНУТЬ, если берёт лучшую, а не первую
      holdMinutes: [120, 60],
      minIdeasAligned: [1],
      minAuthorTrack: [1],
      minAuthorHitRate: [0],
      minWeightAligned: [0],
      profitLockPercent: [0],
      authorMetric: ["close"],
    },
  });

  const result = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_fallback",
    ideas: Array.from({ length: 5 }, (_, k) => idea(1 + k, k * CYCLE)),
  });

  // предусловие: обе точки ниже порога 8 сделок, и первая по сетке
  // (hold=120) объективно хуже
  const byHold = new Map(result.reports.map((r) => [r.point.holdMinutes, r]));
  const long = byHold.get(120);
  const short = byHold.get(60);
  if (long.trades !== 5 || short.trades !== 5) {
    fail(`both points must trade 5 (< floor 8), got ${long.trades}/${short.trades}`);
    return;
  }
  if (!(short.totalPnlPercent > 0 && long.totalPnlPercent < short.totalPnlPercent)) {
    fail(`hold=60 must beat hold=120, got ${short.totalPnlPercent.toFixed(2)} vs ${long.totalPnlPercent.toFixed(2)}`);
    return;
  }

  for (const best of result.best) {
    if (best.report.point.holdMinutes !== 60) {
      fail(`${best.criterion} fallback must pick the best point (hold=60), got hold=${best.report.point.holdMinutes}`);
      return;
    }
    if (best.report.trades !== 5) {
      fail(`${best.criterion} winner must carry its 5 trades, got ${best.report.trades}`);
      return;
    }
  }

  pass(
    `anti-fluke fallback picks by value: hold=60 (+${short.totalPnlPercent.toFixed(2)}%) beats grid-first hold=120 ` +
    `(${long.totalPnlPercent.toFixed(2)}%) on all four criteria at 5 trades < floor 8`
  );
});

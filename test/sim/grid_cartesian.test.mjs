import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Полнота декартова произведения сетки: 6 осей по 2 значения дают
 * ровно 64 точки — каждая комбинация присутствует единожды, ничего
 * не потеряно и не задублировано. Фид пуст: оценка мгновенна, тест
 * фиксирует контракт построения сетки навсегда.
 */

const MINUTE = 60_000;

test("SIM: cartesian grid emits every axis combination exactly once", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "sim-grid-exchange",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = Math.floor(since.getTime() / MINUTE) * MINUTE;
      return Array.from({ length: limit }, (_, i) => ({
        timestamp: alignedSince + i * MINUTE,
        open: 1000,
        high: 1000,
        low: 1000,
        close: 1000,
        volume: 100,
      }));
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  const axes = {
    hardStopPercent: [5, 50],
    trailingTakePercent: [2, 100],
    holdMinutes: [60, 7200],
    minIdeasAligned: [1, 2],
    minAuthorTrack: [1, 3],
    minAuthorHitRate: [0, 0.5],
    minWeightAligned: [0],
    profitLockPercent: [0],
    authorMetric: ["close"],
  };

  const seen = [];
  addSimulatorSchema({
    simulatorName: "sim_grid",
    exchangeName: "sim-grid-exchange",
    gridAxes: axes,
    callbacks: {
      onGridPoint: (_symbol, report) => seen.push(report.point),
    },
  });

  const result = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_grid",
    ideas: [],
  });

  if (result.reports.length !== 64 || seen.length !== 64) {
    fail(`expected 64 grid points, got reports=${result.reports.length}, onGridPoint=${seen.length}`);
    return;
  }

  const key = (p) =>
    [p.hardStopPercent, p.trailingTakePercent, p.holdMinutes, p.minIdeasAligned, p.minAuthorTrack, p.minAuthorHitRate].join("|");
  const uniq = new Set(seen.map(key));
  if (uniq.size !== 64) {
    fail(`grid points must be unique, got ${uniq.size} of 64`);
    return;
  }

  // каждая комбинация из явного перечисления присутствует
  for (const h of axes.hardStopPercent)
    for (const t of axes.trailingTakePercent)
      for (const hold of axes.holdMinutes)
        for (const n of axes.minIdeasAligned)
          for (const track of axes.minAuthorTrack)
            for (const rate of axes.minAuthorHitRate) {
              const k = [h, t, hold, n, track, rate].join("|");
              if (!uniq.has(k)) {
                fail(`missing grid combination: ${k}`);
                return;
              }
            }

  pass("64/64 unique grid combinations present — cartesian product complete");
});

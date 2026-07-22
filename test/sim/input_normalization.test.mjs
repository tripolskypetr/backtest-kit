import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Нормализация входа: run() обязан сам отсортировать ленту и
 * заякорить невыровненные ts (публикация в :37 секунд) на следующую
 * полную минуту. Лента в ОБРАТНОМ порядке со сдвигом каждого ts на
 * +37 секунд обязана дать бит-в-бит тот же результат, что чистая
 * отсортированная выровненная — иначе препроцессинг зависит от
 * формы входа.
 */

const START = 1704067200000;
const MINUTE = 60_000;
const CYCLE = 481;

const priceAt = (timestamp) => {
  const m = Math.floor((timestamp - START) / MINUTE);
  if (m < 0) return 1000;
  // дрейф вверх — LONG close-hit к горизонту (иначе rate 0.5 банит)
  const base = 1000 * (1 + 1e-6 * m);
  const p = m % CYCLE;
  if (p >= 2 && p <= 61) return base * 1.01;
  return base;
};

const AXES = {
  hardStopPercent: [50],
  trailingTakePercent: [100],
  holdMinutes: [60],
  minIdeasAligned: [1],
  minAuthorTrack: [3],
  minAuthorHitRate: [0.5],
  minWeightAligned: [0],
  profitLockPercent: [0],
  entryDelayMinutes: [0],
  authorMetric: ["close"],
};

test("SIM: reversed feed with mid-minute timestamps is bit-identical to the clean one", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "sim-norm-exchange",
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

  addSimulatorSchema({ simulatorName: "sim_norm_clean", exchangeName: "sim-norm-exchange", gridAxes: AXES });
  addSimulatorSchema({ simulatorName: "sim_norm_dirty", exchangeName: "sim-norm-exchange", gridAxes: AXES });

  const clean = Array.from({ length: 5 }, (_, k) => ({
    id: 1 + k,
    ts: START + k * CYCLE * MINUTE,
    symbol: "TESTUSDT",
    direction: "LONG",
    author: "prophet",
  }));
  // обратный порядок + каждый ts посреди минуты (+37s)
  const dirty = [...clean]
    .reverse()
    .map((idea) => ({ ...idea, ts: idea.ts + 37_000 }));

  const cleanResult = await Simulator.run({ symbol: "TESTUSDT", simulatorName: "sim_norm_clean", ideas: clean });
  const dirtyResult = await Simulator.run({ symbol: "TESTUSDT", simulatorName: "sim_norm_dirty", ideas: dirty });

  if (cleanResult.reports[0].trades !== 5) {
    fail(`sanity: clean run must trade 5, got ${cleanResult.reports[0].trades}`);
    return;
  }
  const cleanJson = JSON.stringify(cleanResult);
  const dirtyJson = JSON.stringify(dirtyResult);
  if (cleanJson !== dirtyJson) {
    fail(`normalization broke determinism: results differ (${cleanJson.length} vs ${dirtyJson.length} bytes)`);
    return;
  }

  pass(`reversed + mid-minute feed normalized: bit-identical results (${cleanJson.length} bytes, 5 trades)`);
});

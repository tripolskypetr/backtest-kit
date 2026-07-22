import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Stateless-гарантия клиента: SimulatorConnectionService мемоизирует
 * ОДИН ClientSimulator на имя, а JSDoc класса обещает независимость
 * прогонов. Два подряд Simulator.run с одним simulatorName и тем же
 * фидом обязаны дать бит-в-бит одинаковый результат — любое
 * накопленное состояние (кеши, мутируемые профили, счётчики)
 * проявится расхождением.
 */

const START = 1704067200000;
const MINUTE = 60_000;
const SPACING = 481;
const CYCLES = 6;

const priceAt = (timestamp) => {
  const m = Math.floor((timestamp - START) / MINUTE);
  if (m < 0) return 1000;
  const base = 1000 * (1 + 1e-6 * m);
  const phase = m % SPACING;
  const cycle = Math.floor(m / SPACING);
  if (cycle < CYCLES && phase >= 2 && phase <= 61) {
    return base * 1.01;
  }
  return base;
};

test("SIM: repeated run on the memoized client is bit-for-bit identical", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "sim-stateless-exchange",
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
    simulatorName: "sim_stateless",
    exchangeName: "sim-stateless-exchange",
    gridAxes: {
      hardStopPercent: [5, 50],
      trailingTakePercent: [2, 100],
      holdMinutes: [60, 7200],
      minIdeasAligned: [1],
      minAuthorTrack: [3],
      minAuthorHitRate: [0.5],
      minWeightAligned: [0],
    },
    callbacks: {},
  });

  const ideas = Array.from({ length: CYCLES }, (_, k) => ({
    id: 1 + k,
    ts: START + k * SPACING * MINUTE,
    symbol: "TESTUSDT",
    direction: "LONG",
    author: "prophet",
  }));

  const first = await Simulator.run({ symbol: "TESTUSDT", simulatorName: "sim_stateless", ideas });
  const second = await Simulator.run({ symbol: "TESTUSDT", simulatorName: "sim_stateless", ideas });

  // содержательность: прогон не вырожден
  if (first.reports.length !== 8 || first.best.some((b) => !b.report)) {
    fail(`run must be non-degenerate: reports=${first.reports.length}`);
    return;
  }
  const hasTrades = first.reports.some(({ trades }) => trades > 0);
  if (!hasTrades) {
    fail("run must produce trades to make the comparison meaningful");
    return;
  }

  const a = JSON.stringify(first);
  const b = JSON.stringify(second);
  if (a !== b) {
    // найти первое расхождение для диагностики
    let at = 0;
    while (at < Math.min(a.length, b.length) && a[at] === b[at]) at++;
    fail(`results diverge at char ${at}: ...${a.slice(Math.max(0, at - 40), at + 40)}...`);
    return;
  }

  pass(`two runs on the memoized client are identical (${a.length} bytes of result JSON)`);
});

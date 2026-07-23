import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * onDone — единственный колбек, не имевший ни одного ассерта:
 * обязан выстрелить ровно один раз, с тем же символом, и его payload
 * обязан быть ТЕМ ЖЕ ОБЪЕКТОМ, что возвращает run() (identity, не
 * копия) — рассинхрон колбека с результатом невозможен по ссылке.
 */

const START = 1704067200000;
const MINUTE = 60_000;

const priceAt = (timestamp) => {
  const m = Math.floor((timestamp - START) / MINUTE);
  if (m < 0) return 1000;
  const p = m % 481;
  if (p >= 2 && p <= 61) return 1010;
  return 1000;
};

test("SIM: onDone fires once and carries the exact result object", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "sim-done-exchange",
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

  const doneCalls = [];
  addSimulatorSchema({
    simulatorName: "sim_done",
    exchangeName: "sim-done-exchange",
    gridAxes: {
      hardStopPercent: [50],
      trailingTakePercent: [100],
      holdMinutes: [60],
      minAuthorTrack: [1],
      minAuthorHitRate: [0],
      profitLockPercent: [0],
    },
    callbacks: {
      onDone: (symbol, result) => doneCalls.push({ symbol, result }),
    },
  });

  const result = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_done",
    ideas: [{ id: 1, ts: START, symbol: "TESTUSDT", direction: "LONG", author: "solo" }],
  });

  if (doneCalls.length !== 1) {
    fail(`onDone must fire exactly once, got ${doneCalls.length}`);
    return;
  }
  if (doneCalls[0].symbol !== "TESTUSDT") {
    fail(`onDone symbol mismatch: ${doneCalls[0].symbol}`);
    return;
  }
  // identity, не структурное равенство: тот же объект
  if (doneCalls[0].result !== result) {
    fail("onDone payload must be the exact object run() returns");
    return;
  }
  if (result.reports.length !== 1 || result.best.length !== 4) {
    fail(`sanity: expected 1 report / 4 winners, got ${result.reports.length}/${result.best.length}`);
    return;
  }

  pass("onDone fired once with the identical result object (reference equality) for TESTUSDT");
});

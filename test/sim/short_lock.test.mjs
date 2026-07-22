import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * SHORT-зеркало профит-лока — направленная арифметика, не сверенная
 * short_mechanics (они писались до замка):
 *
 *  1) Формула: шорт от 1000, падение до 965 взводит замок 3%
 *     (уровень 999 * 0.97 = 969.03 ниже входа), отскок к 1010
 *     закрывает profit_lock ровно по уровню — pnl сверяется до 1e-9.
 *  2) Коллизия на отскоке: обвал до 800 (-20%), отскок одной свечой
 *     до 990 пробивает и трейлинг-пол (824), и замок (969.03) —
 *     отскакивающая цена проходит НИЖНИЙ уровень первым, исполняется
 *     trailing_take: шортовый раннер не срезается замком.
 */

const START = 1704067200000;
const MINUTE = 60_000;

const idea = (id, minute, author) => ({
  id,
  ts: START + minute * MINUTE,
  symbol: "TESTUSDT",
  direction: "SHORT",
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

const AXES = {
  minIdeasAligned: [1],
  minAuthorTrack: [1],
  minAuthorHitRate: [0],
  minWeightAligned: [0],
  entryDelayMinutes: [0],
  minAuthorWilson: [0],
  authorMetric: ["close"],
  holdMinutes: [240],
};

test("SIM: short profit lock fills exactly at the mirrored level on the rebound", async ({ pass, fail }) => {
  // падение 1000 -> 965 к m30 (замок 969.03 взведён), отскок на 1010
  registerWorld("sim-shortlock-exchange", (timestamp) => {
    const m = Math.floor((timestamp - START) / MINUTE);
    if (m <= 1) return 1000;
    if (m <= 30) return 1000 - (35 * (m - 1)) / 29;
    return 1010;
  });

  addSimulatorSchema({
    simulatorName: "sim_shortlock",
    exchangeName: "sim-shortlock-exchange",
    gridAxes: {
      ...AXES,
      hardStopPercent: [5],
      trailingTakePercent: [100],
      profitLockPercent: [3],
    },
  });
  const result = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_shortlock",
    ideas: [idea(1, 0, "bear")],
  });
  const [report] = result.reports;
  const [trade] = result.best.find(({ criterion }) => criterion === "sharpe").trades;

  if (trade.exitReason !== "profit_lock") {
    fail(`short rebound to the lock must exit profit_lock, got ${trade.exitReason}`);
    return;
  }
  // зеркальная арифметика: entryFill = open*(1-slip), lock ниже входа,
  // exitFill = level*(1+slip), pnl = -1*((exit-entry)/entry)*100 - fees
  const entryFill = 1000 * 0.999;
  const lockLevel = entryFill * 0.97;
  const exitFill = lockLevel * 1.001;
  const expectedPnl = -1 * (((exitFill - entryFill) / entryFill) * 100) - 0.2;
  if (Math.abs(trade.pnlPercent - expectedPnl) > 1e-9) {
    fail(`short lock fill mismatch: expected ${expectedPnl}, got ${trade.pnlPercent}`);
    return;
  }
  if (report.exitReasons.profit_lock !== 1 || report.exitReasons.hard_stop !== 0) {
    fail(`exit reasons must be pure lock, got ${JSON.stringify(report.exitReasons)}`);
    return;
  }
  pass(`short profit lock: exit at +${trade.pnlPercent.toFixed(4)}% (mirrored formula exact)`);
});

test("SIM: short runner rebound through both floors fills the LOWER trailing level", async ({ pass, fail }) => {
  // падение 1000 -> 800 (-20%) к m100, отскок одной свечой на 990:
  // трейлинг-пол 824 НИЖЕ замка 969.03 — отскок проходит его первым
  registerWorld("sim-shortcrash-exchange", (timestamp) => {
    const m = Math.floor((timestamp - START) / MINUTE);
    if (m <= 1) return 1000;
    if (m <= 100) return 1000 - (200 * (m - 1)) / 99;
    return 990;
  });

  addSimulatorSchema({
    simulatorName: "sim_shortcrash",
    exchangeName: "sim-shortcrash-exchange",
    gridAxes: {
      ...AXES,
      hardStopPercent: [50],
      trailingTakePercent: [3],
      profitLockPercent: [3],
    },
  });
  const result = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_shortcrash",
    ideas: [idea(1, 0, "bear")],
  });
  const [report] = result.reports;
  const [trade] = result.best.find(({ criterion }) => criterion === "sharpe").trades;

  if (trade.exitReason !== "trailing_take") {
    fail(`short rebound through both floors must fill the lower (trailing), got ${trade.exitReason}`);
    return;
  }
  const entryFill = 1000 * 0.999;
  const trailLevel = 800 * 1.03;
  const exitFill = trailLevel * 1.001;
  const expectedPnl = -1 * (((exitFill - entryFill) / entryFill) * 100) - 0.2;
  if (Math.abs(trade.pnlPercent - expectedPnl) > 1e-9) {
    fail(`short trailing fill mismatch: expected ${expectedPnl}, got ${trade.pnlPercent}`);
    return;
  }
  if (report.exitReasons.trailing_take !== 1 || report.exitReasons.profit_lock !== 0) {
    fail(`exit reasons must be pure trailing, got ${JSON.stringify(report.exitReasons)}`);
    return;
  }
  pass(`short runner preserved: rebound fills trailing at +${trade.pnlPercent.toFixed(2)}%, lock untouched`);
});

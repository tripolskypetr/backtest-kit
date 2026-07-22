import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Коллизии уровней в ОДНОЙ свече — ветки SIMULATE_TRADE_FN, которые
 * не проходил ни один тест:
 *
 *  1) Оба пола пробиты, трейлинг ВЫШЕ замка (обвал раннера):
 *     падающая цена проходит верхний уровень первым — исполняется
 *     trailing_take по пик*(1-TT), замок не при чём.
 *  2) Оба пола пробиты, замок ВЫШЕ трейлинга (обвал сразу после
 *     взвода трейлинга у входа): исполняется profit_lock по уровню
 *     замка — верхний побеждает и здесь.
 *  3) Стоп и взведённый замок в одной свече: пессимизм — стоп
 *     побеждает любой пол, выход hard_stop по стоп-цене.
 *
 * Все три — формульная сверка pnl до 1e-9.
 */

const START = 1704067200000;
const MINUTE = 60_000;

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

const runSingle = async (simulatorName, exchangeName, gridAxes) => {
  addSimulatorSchema({ simulatorName, exchangeName, gridAxes });
  const result = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName,
    ideas: [idea(1, 0, "solo")],
  });
  const [report] = result.reports;
  const [trade] = result.best.find(({ criterion }) => criterion === "sharpe").trades;
  return { report, trade };
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

test("SIM: runner crash through both floors fills the HIGHER trailing level, not the lock", async ({ pass, fail }) => {
  // рост 1000 -> 1200 (+20%) к m100, затем обвал одной свечой на 900
  registerWorld("sim-coll-runner-exchange", (timestamp) => {
    const m = Math.floor((timestamp - START) / MINUTE);
    if (m <= 1) return 1000;
    if (m <= 100) return 1000 + (200 * (m - 1)) / 99;
    return 900;
  });

  const { report, trade } = await runSingle("sim_coll_runner", "sim-coll-runner-exchange", {
    ...AXES,
    hardStopPercent: [50],
    trailingTakePercent: [3],
    profitLockPercent: [2.5],
  });

  if (trade.exitReason !== "trailing_take") {
    fail(`crash through both floors must fill the higher (trailing), got ${trade.exitReason}`);
    return;
  }
  const entryFill = 1000 * 1.001;
  const trailLevel = 1200 * 0.97;
  const expectedPnl = ((trailLevel * 0.999 - entryFill) / entryFill) * 100 - 0.2;
  if (Math.abs(trade.pnlPercent - expectedPnl) > 1e-9) {
    fail(`trailing fill mismatch: expected ${expectedPnl}, got ${trade.pnlPercent}`);
    return;
  }
  if (report.exitReasons.trailing_take !== 1 || report.exitReasons.profit_lock !== 0) {
    fail(`exit reasons must be pure trailing, got ${JSON.stringify(report.exitReasons)}`);
    return;
  }
  pass(`both floors in one candle, trailing higher: trailing_take at +${trade.pnlPercent.toFixed(2)}% (formula exact)`);
});

test("SIM: crash right after the trailing arms fills the HIGHER lock level, not the trailing", async ({ pass, fail }) => {
  // рост 1000 -> 1035 к m30 (трейлинг взведён на пике впритык),
  // затем обвал на 990: трейлинг-пол 1003.95 НИЖЕ замка 1026.025
  registerWorld("sim-coll-lockup-exchange", (timestamp) => {
    const m = Math.floor((timestamp - START) / MINUTE);
    if (m <= 1) return 1000;
    if (m <= 30) return 1000 + (35 * (m - 1)) / 29;
    return 990;
  });

  const { report, trade } = await runSingle("sim_coll_lockup", "sim-coll-lockup-exchange", {
    ...AXES,
    hardStopPercent: [50],
    trailingTakePercent: [3],
    profitLockPercent: [2.5],
  });

  if (trade.exitReason !== "profit_lock") {
    fail(`crash with lock above trailing must fill the lock, got ${trade.exitReason}`);
    return;
  }
  const entryFill = 1000 * 1.001;
  const lockLevel = entryFill * 1.025;
  const expectedPnl = ((lockLevel * 0.999 - entryFill) / entryFill) * 100 - 0.2;
  if (Math.abs(trade.pnlPercent - expectedPnl) > 1e-9) {
    fail(`lock fill mismatch: expected ${expectedPnl}, got ${trade.pnlPercent}`);
    return;
  }
  if (report.exitReasons.profit_lock !== 1 || report.exitReasons.trailing_take !== 0) {
    fail(`exit reasons must be pure lock, got ${JSON.stringify(report.exitReasons)}`);
    return;
  }
  pass(`both floors in one candle, lock higher: profit_lock at +${trade.pnlPercent.toFixed(2)}% (formula exact)`);
});

test("SIM: hard stop beats the armed lock inside one candle — pessimism holds for floors", async ({ pass, fail }) => {
  // рост 1000 -> 1030 (замок 2.5 взведён), затем обвал на 940:
  // пробиты и замок (1026.025), и стоп (950.95) — побеждает стоп
  registerWorld("sim-coll-stop-exchange", (timestamp) => {
    const m = Math.floor((timestamp - START) / MINUTE);
    if (m <= 1) return 1000;
    if (m <= 30) return 1000 + (30 * (m - 1)) / 29;
    return 940;
  });

  const { report, trade } = await runSingle("sim_coll_stop", "sim-coll-stop-exchange", {
    ...AXES,
    hardStopPercent: [5],
    trailingTakePercent: [100],
    profitLockPercent: [2.5],
  });

  if (trade.exitReason !== "hard_stop") {
    fail(`stop must beat the armed lock in one candle, got ${trade.exitReason}`);
    return;
  }
  const entryFill = 1000 * 1.001;
  const stopLevel = entryFill * 0.95;
  const expectedPnl = ((stopLevel * 0.999 - entryFill) / entryFill) * 100 - 0.2;
  if (Math.abs(trade.pnlPercent - expectedPnl) > 1e-9) {
    fail(`stop fill mismatch: expected ${expectedPnl}, got ${trade.pnlPercent}`);
    return;
  }
  if (report.exitReasons.hard_stop !== 1 || report.exitReasons.profit_lock !== 0) {
    fail(`exit reasons must be pure stop, got ${JSON.stringify(report.exitReasons)}`);
    return;
  }
  pass(`stop vs armed lock in one candle: hard_stop at ${trade.pnlPercent.toFixed(2)}% (formula exact)`);
});

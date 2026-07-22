import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Зеркальная механика SHORT-сделок (LONG покрыт mechanics.test.mjs):
 *  1) стоп шорта срабатывает по ВЕРХНЕМУ фитилю (high) и исполняется
 *     по уровню стопа со slippage/комиссией — сверка с независимой
 *     формулой;
 *  2) трейлинг шорта: пик = бегущий МИНИМУМ low предыдущих свечей,
 *     выход при отскоке ВВЕРХ на TT% от пика;
 *  3) пессимизм: отскок, достающий и трейлинг, и стоп в одной свече,
 *     засчитывается стопом.
 */

const START = 1704067200000;
const MINUTE = 60_000;
const SLIP = 0.001;
const FEE = 0.1;

// независимое зеркало формулы PnL (short)
const shortPnl = (entryOpen, exitLevel) => {
  const entryFill = entryOpen * (1 - SLIP);
  const exitFill = exitLevel * (1 + SLIP);
  return (-(exitFill - entryFill) / entryFill) * 100 - 2 * FEE;
};

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

const PERMISSIVE = {
  minIdeasAligned: [1],
  minAuthorTrack: [1],
  minAuthorHitRate: [0],
  minWeightAligned: [0],
  profitLockPercent: [0],
  entryDelayMinutes: [0],
  minAuthorWilson: [0],
  authorMetric: ["close"],
};

const shortIdea = () => [
  { id: 1, ts: START, symbol: "TESTUSDT", direction: "SHORT", author: "solo" },
];

const registerExchange = (exchangeName, candleAt) => {
  addExchangeSchema({
    exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = Math.floor(since.getTime() / MINUTE) * MINUTE;
      return Array.from({ length: limit }, (_, i) =>
        candleAt(alignedSince + i * MINUTE),
      );
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });
};

test("SIM: short hard stop fires on the upper wick and fills at the stop level", async ({ pass, fail }) => {
  // флэт 1000; свеча минуты 10 прокалывает ВВЕРХ до 1060
  registerExchange("sim-smech-stop", (timestamp) => {
    const m = Math.floor((timestamp - START) / MINUTE);
    const wick = m === 10;
    return {
      timestamp,
      open: 1000,
      high: wick ? 1060 : 1000,
      low: 1000,
      close: 1000,
      volume: 100,
    };
  });

  const captured = [];
  addSimulatorSchema({
    simulatorName: "sim_smech_stop",
    exchangeName: "sim-smech-stop",
    gridAxes: {
      hardStopPercent: [5],
      trailingTakePercent: [100],
      holdMinutes: [7200],
      ...PERMISSIVE,
    },
    callbacks: {
      onGridPoint: (_symbol, report, trades) => captured.push({ report, trades }),
    },
  });

  await Simulator.run({ symbol: "TESTUSDT", simulatorName: "sim_smech_stop", ideas: shortIdea() });

  const [{ trades }] = captured;
  const [trade] = trades;
  if (!trade || trade.exitReason !== "hard_stop") {
    fail(`expected hard_stop, got ${trade?.exitReason}`);
    return;
  }
  // стоп шорта = entryFill * 1.05; entryFill = 1000 * (1 - slip)
  const entryFill = 1000 * (1 - SLIP);
  const expected = shortPnl(1000, entryFill * 1.05);
  if (!approx(trade.pnlPercent, expected)) {
    fail(`short stop pnl mismatch: got ${trade.pnlPercent}, expected ${expected}`);
    return;
  }
  if (trade.holdMinutesActual !== 10) {
    fail(`expected holdMinutesActual=10, got ${trade.holdMinutesActual}`);
    return;
  }

  pass(`short hard_stop on upper wick: pnl=${trade.pnlPercent.toFixed(4)}% (formula match)`);
});

test("SIM: short trailing take arms from the running LOW and fills on the bounce", async ({ pass, fail }) => {
  // падение 1000 -> 700 к минуте 30, полка, отскок к 800 на минуте 40
  const priceAt = (timestamp) => {
    const m = Math.floor((timestamp - START) / MINUTE);
    if (m < 1) return 1000;
    if (m <= 30) return 1000 - 10 * m;
    if (m < 40) return 700;
    return 800;
  };
  registerExchange("sim-smech-trail", (timestamp) => {
    const open = priceAt(timestamp);
    const close = priceAt(timestamp + MINUTE);
    return { timestamp, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 100 };
  });

  const captured = [];
  addSimulatorSchema({
    simulatorName: "sim_smech_trail",
    exchangeName: "sim-smech-trail",
    gridAxes: {
      hardStopPercent: [50],
      trailingTakePercent: [2],
      holdMinutes: [7200],
      ...PERMISSIVE,
    },
    callbacks: {
      onGridPoint: (_symbol, report, trades) => captured.push({ report, trades }),
    },
  });

  await Simulator.run({ symbol: "TESTUSDT", simulatorName: "sim_smech_trail", ideas: shortIdea() });

  const [{ trades }] = captured;
  const [trade] = trades;
  if (!trade || trade.exitReason !== "trailing_take") {
    fail(`expected trailing_take, got ${trade?.exitReason}`);
    return;
  }
  // пик шорта (минимум low предыдущих свечей) = 700; выход 700 * 1.02
  const expected = shortPnl(1000 - 10 * 1, 700 * 1.02);
  if (!approx(trade.pnlPercent, expected)) {
    fail(`short trailing pnl mismatch: got ${trade.pnlPercent}, expected ${expected}`);
    return;
  }

  pass(`short trailing_take at low*1.02: pnl=${trade.pnlPercent.toFixed(4)}% (formula match)`);
});

test("SIM: short bounce reaching both trailing and stop resolves to hard_stop", async ({ pass, fail }) => {
  // то же падение, но отскок до 1600 — выше и трейлинга (714), и стопа
  const priceAt = (timestamp) => {
    const m = Math.floor((timestamp - START) / MINUTE);
    if (m < 1) return 1000;
    if (m <= 30) return 1000 - 10 * m;
    if (m < 40) return 700;
    return 1600;
  };
  registerExchange("sim-smech-pess", (timestamp) => {
    const open = priceAt(timestamp);
    const close = priceAt(timestamp + MINUTE);
    return { timestamp, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 100 };
  });

  const captured = [];
  addSimulatorSchema({
    simulatorName: "sim_smech_pess",
    exchangeName: "sim-smech-pess",
    gridAxes: {
      hardStopPercent: [50],
      trailingTakePercent: [2],
      holdMinutes: [7200],
      ...PERMISSIVE,
    },
    callbacks: {
      onGridPoint: (_symbol, report, trades) => captured.push({ report, trades }),
    },
  });

  await Simulator.run({ symbol: "TESTUSDT", simulatorName: "sim_smech_pess", ideas: shortIdea() });

  const [{ trades }] = captured;
  const [trade] = trades;
  if (!trade || trade.exitReason !== "hard_stop") {
    fail(`pessimistic short rule broken: expected hard_stop, got ${trade?.exitReason}`);
    return;
  }
  const entryFill = (1000 - 10 * 1) * (1 - SLIP);
  const expected = shortPnl(1000 - 10 * 1, entryFill * 1.5);
  if (!approx(trade.pnlPercent, expected)) {
    fail(`pessimistic short stop pnl mismatch: got ${trade.pnlPercent}, expected ${expected}`);
    return;
  }

  pass(`ambiguous short bounce resolved to hard_stop: pnl=${trade.pnlPercent.toFixed(4)}%`);
});

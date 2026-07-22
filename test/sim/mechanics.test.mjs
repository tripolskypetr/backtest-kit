import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Механика исполнения сделки (контракты честности SIMULATE_TRADE_FN):
 *  1) стоп срабатывает по ФИТИЛЮ свечи (low), исполнение по уровню
 *     стопа со slippage и комиссией — точная арифметика сверяется с
 *     независимой формулой;
 *  2) трейлинг вооружается пиком ПРЕДЫДУЩИХ свечей и исполняется по
 *     уровню отката от пика;
 *  3) пессимизм внутри свечи: если в одной свече достижимы и стоп, и
 *     трейлинг — засчитывается стоп;
 *  4) вход без заглядывания: идея, опубликованная в середине минуты,
 *     входит по open СЛЕДУЮЩЕЙ минуты.
 *
 * Издержки из test/config/setup.mjs: slippage 0.1% на ногу (в цене
 * исполнения), комиссия 0.1% на ногу (отдельно, 2 x 0.1).
 */

const START = 1704067200000;
const MINUTE = 60_000;
const SLIP = 0.001;
const FEE = 0.1;

// независимое зеркало формулы PnL (long)
const longPnl = (entryOpen, exitLevel) => {
  const entryFill = entryOpen * (1 + SLIP);
  const exitFill = exitLevel * (1 - SLIP);
  return ((exitFill - entryFill) / entryFill) * 100 - 2 * FEE;
};

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

const PERMISSIVE_FILTER = {
  minIdeasAligned: [1],
  minAuthorTrack: [1],
  minAuthorHitRate: [0],
  minWeightAligned: [0],
  profitLockPercent: [0],
  minAuthorWilson: [0],
  authorMetric: ["close"],
};

const singleIdea = () => [
  { id: 1, ts: START, symbol: "TESTUSDT", direction: "LONG", author: "solo" },
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

test("SIM: hard stop fires on the wick and fills at the stop level with costs", async ({ pass, fail }) => {
  // флэт 1000; свеча минуты 10 прокалывает фитилём до 940 и закрывается назад
  registerExchange("sim-mech-stop", (timestamp) => {
    const m = Math.floor((timestamp - START) / MINUTE);
    const wick = m === 10;
    return {
      timestamp,
      open: 1000,
      high: 1000,
      low: wick ? 940 : 1000,
      close: 1000,
      volume: 100,
    };
  });

  const captured = [];
  addSimulatorSchema({
    simulatorName: "sim_mech_stop",
    exchangeName: "sim-mech-stop",
    gridAxes: {
      hardStopPercent: [5],
      trailingTakePercent: [100],
      holdMinutes: [7200],
      ...PERMISSIVE_FILTER,
    },
    callbacks: {
      onGridPoint: (_symbol, report, trades) => captured.push({ report, trades }),
    },
  });

  await Simulator.run({ symbol: "TESTUSDT", simulatorName: "sim_mech_stop", ideas: singleIdea() });

  const [{ trades }] = captured;
  if (trades.length !== 1) {
    fail(`expected 1 trade, got ${trades.length}`);
    return;
  }
  const [trade] = trades;
  if (trade.exitReason !== "hard_stop") {
    fail(`expected hard_stop, got ${trade.exitReason}`);
    return;
  }
  // entry open = 1000 (минута 1), стоп-уровень = entryFill * 0.95
  const entryFill = 1000 * (1 + SLIP);
  const expected = longPnl(1000, entryFill * 0.95);
  if (!approx(trade.pnlPercent, expected, 1e-9)) {
    fail(`stop pnl mismatch: got ${trade.pnlPercent}, expected ${expected}`);
    return;
  }
  // вход на минуте 1, фитиль на минуте 10 -> индекс 9, холд 10 минут
  if (trade.holdMinutesActual !== 10) {
    fail(`expected holdMinutesActual=10, got ${trade.holdMinutesActual}`);
    return;
  }

  pass(`hard_stop on wick: pnl=${trade.pnlPercent.toFixed(4)}% (formula match), hold=${trade.holdMinutesActual}m`);
});

test("SIM: trailing take arms from previous-candle peak and fills at the pullback level", async ({ pass, fail }) => {
  // рампа 1000 -> 1300 к минуте 30, полка, затем обвал к 1060 на минуте 40
  const priceAt = (timestamp) => {
    const m = Math.floor((timestamp - START) / MINUTE);
    if (m < 1) return 1000;
    if (m <= 30) return 1000 + 10 * m;
    if (m < 40) return 1300;
    return 1060;
  };
  registerExchange("sim-mech-trail", (timestamp) => {
    const open = priceAt(timestamp);
    const close = priceAt(timestamp + MINUTE);
    return { timestamp, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 100 };
  });

  const captured = [];
  addSimulatorSchema({
    simulatorName: "sim_mech_trail",
    exchangeName: "sim-mech-trail",
    gridAxes: {
      hardStopPercent: [50],
      trailingTakePercent: [2],
      holdMinutes: [7200],
      ...PERMISSIVE_FILTER,
    },
    callbacks: {
      onGridPoint: (_symbol, report, trades) => captured.push({ report, trades }),
    },
  });

  await Simulator.run({ symbol: "TESTUSDT", simulatorName: "sim_mech_trail", ideas: singleIdea() });

  const [{ trades }] = captured;
  const [trade] = trades;
  if (!trade || trade.exitReason !== "trailing_take") {
    fail(`expected trailing_take, got ${trade?.exitReason}`);
    return;
  }
  // пик предыдущих свечей = 1300; выход по 1300 * 0.98 = 1274
  const expected = longPnl(1000 + 10 * 1, 1300 * 0.98);
  if (!approx(trade.pnlPercent, expected, 1e-9)) {
    fail(`trailing pnl mismatch: got ${trade.pnlPercent}, expected ${expected}`);
    return;
  }

  pass(`trailing_take at peak*0.98: pnl=${trade.pnlPercent.toFixed(4)}% (formula match), hold=${trade.holdMinutesActual}m`);
});

test("SIM: stop wins when stop and trailing are both reachable inside one candle", async ({ pass, fail }) => {
  // та же рампа, но обвал глубокий: ниже и трейлинга (1274), и стопа
  const priceAt = (timestamp) => {
    const m = Math.floor((timestamp - START) / MINUTE);
    if (m < 1) return 1000;
    if (m <= 30) return 1000 + 10 * m;
    if (m < 40) return 1300;
    return 400;
  };
  registerExchange("sim-mech-pess", (timestamp) => {
    const open = priceAt(timestamp);
    const close = priceAt(timestamp + MINUTE);
    return { timestamp, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 100 };
  });

  const captured = [];
  addSimulatorSchema({
    simulatorName: "sim_mech_pess",
    exchangeName: "sim-mech-pess",
    gridAxes: {
      hardStopPercent: [50],
      trailingTakePercent: [2],
      holdMinutes: [7200],
      ...PERMISSIVE_FILTER,
    },
    callbacks: {
      onGridPoint: (_symbol, report, trades) => captured.push({ report, trades }),
    },
  });

  await Simulator.run({ symbol: "TESTUSDT", simulatorName: "sim_mech_pess", ideas: singleIdea() });

  const [{ trades }] = captured;
  const [trade] = trades;
  if (!trade || trade.exitReason !== "hard_stop") {
    fail(`pessimistic rule broken: expected hard_stop, got ${trade?.exitReason}`);
    return;
  }
  const entryFill = (1000 + 10 * 1) * (1 + SLIP);
  const expected = longPnl(1000 + 10 * 1, entryFill * 0.5);
  if (!approx(trade.pnlPercent, expected, 1e-9)) {
    fail(`pessimistic stop pnl mismatch: got ${trade.pnlPercent}, expected ${expected}`);
    return;
  }

  pass(`ambiguous candle resolved to hard_stop: pnl=${trade.pnlPercent.toFixed(4)}%`);
});

test("SIM: entry is the NEXT-minute open — no lookahead for mid-minute publications", async ({ pass, fail }) => {
  // цена прыгает 1000 -> 1005 ровно на минуте 5;
  // идея публикуется в СЕРЕДИНЕ минуты 4 -> вход = open минуты 5 = 1005
  registerExchange("sim-mech-entry", (timestamp) => {
    const m = Math.floor((timestamp - START) / MINUTE);
    const price = (mm) => (mm < 5 ? 1000 : 1005);
    const open = price(m);
    const close = price(m + 1);
    return { timestamp, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 100 };
  });

  const profilesSeen = [];
  addSimulatorSchema({
    simulatorName: "sim_mech_entry",
    exchangeName: "sim-mech-entry",
    gridAxes: {
      hardStopPercent: [50],
      trailingTakePercent: [100],
      holdMinutes: [60],
      ...PERMISSIVE_FILTER,
    },
    callbacks: {
      onProfiles: (_symbol, profiles) => profilesSeen.push(...profiles),
    },
  });

  await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_mech_entry",
    ideas: [
      // середина минуты 4
      { id: 1, ts: START + 4 * MINUTE + 30_000, symbol: "TESTUSDT", direction: "LONG", author: "solo" },
    ],
  });

  if (profilesSeen.length !== 1) {
    fail(`expected 1 profile, got ${profilesSeen.length}`);
    return;
  }
  const [profile] = profilesSeen;
  if (profile.entryTimestamp !== START + 5 * MINUTE) {
    fail(`entry must be minute 5, got ${new Date(profile.entryTimestamp).toISOString()}`);
    return;
  }
  if (profile.entryPrice !== 1005) {
    fail(`entry price must be the next-minute open 1005 (not 1000), got ${profile.entryPrice}`);
    return;
  }

  pass("mid-minute idea entered at next-minute open (1005) — no lookahead");
});

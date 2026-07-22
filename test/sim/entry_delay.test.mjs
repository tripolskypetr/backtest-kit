import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Ось задержки входа (entryDelayMinutes):
 *  1) вход исполняется по open свечи candles[delay] профиля, а не по
 *     open первой свечи; таймер холда отсчитывается от отложенного
 *     входа (holdMinutesActual одинаков у мгновенной и отложенной
 *     точек), entryTimestamp сдвинут на delay минут — формульная
 *     сверка PnL обеих точек одной сетки;
 *  2) профиль короче задержки: войти не во что — сделки нет, идея
 *     считается в skippedNoData этой точки (и только этой);
 *  3) занятость слота проверяется на минуту ФАКТИЧЕСКОГО входа
 *     (пост + delay), не на минуту поста: идея, чей пост попадает в
 *     чужой холд, но отложенный вход — уже после выхода, торгуется.
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
  authorMetric: ["close"],
};

// дрейф-мир: цена минуты m равна 1000 + m — вход на каждой минуте
// различим по цене, стоп/трейлинг в лонге не срабатывают никогда
const rampPrice = (timestamp) => {
  const m = Math.floor((timestamp - START) / MINUTE);
  return 1000 + Math.max(m, 0);
};

const registerRampExchange = (exchangeName) => {
  addExchangeSchema({
    exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = Math.floor(since.getTime() / MINUTE) * MINUTE;
      return Array.from({ length: limit }, (_, i) => {
        const timestamp = alignedSince + i * MINUTE;
        const open = rampPrice(timestamp);
        const close = rampPrice(timestamp + MINUTE);
        return { timestamp, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 100 };
      });
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });
};

test("SIM: delayed entry fills at candle[delay] open and shifts the hold window", async ({ pass, fail }) => {
  registerRampExchange("sim-delay-ramp");

  const captured = [];
  addSimulatorSchema({
    simulatorName: "sim_delay_ramp",
    exchangeName: "sim-delay-ramp",
    gridAxes: {
      hardStopPercent: [50],
      trailingTakePercent: [100],
      holdMinutes: [30],
      entryDelayMinutes: [0, 10],
      ...PERMISSIVE_FILTER,
    },
    callbacks: {
      onGridPoint: (_symbol, report, trades) => captured.push({ report, trades }),
    },
  });

  await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_delay_ramp",
    ideas: [{ id: 1, ts: START, symbol: "TESTUSDT", direction: "LONG", author: "solo" }],
  });

  if (captured.length !== 2) {
    fail(`expected 2 grid points, got ${captured.length}`);
    return;
  }
  const byDelay = new Map(
    captured.map((entry) => [entry.report.point.entryDelayMinutes, entry]),
  );
  for (const delay of [0, 10]) {
    const entry = byDelay.get(delay);
    if (!entry || entry.trades.length !== 1) {
      fail(`delay=${delay}: expected 1 trade, got ${entry?.trades.length}`);
      return;
    }
    const [trade] = entry.trades;
    // вход: open свечи delay (минута мира 1 + delay), выход:
    // time_expired по close свечи delay + 29 (минута мира delay + 31)
    const entryOpen = 1000 + 1 + delay;
    const exitClose = 1000 + delay + 31;
    const expected = longPnl(entryOpen, exitClose);
    if (trade.exitReason !== "time_expired") {
      fail(`delay=${delay}: expected time_expired, got ${trade.exitReason}`);
      return;
    }
    if (!approx(trade.pnlPercent, expected)) {
      fail(`delay=${delay}: pnl mismatch, got ${trade.pnlPercent}, expected ${expected}`);
      return;
    }
    if (trade.holdMinutesActual !== 30) {
      fail(`delay=${delay}: expected holdMinutesActual=30, got ${trade.holdMinutesActual}`);
      return;
    }
    if (trade.entryTimestamp !== START + (1 + delay) * MINUTE) {
      fail(`delay=${delay}: entryTimestamp must shift by the delay`);
      return;
    }
    if (entry.report.skippedNoData !== 0) {
      fail(`delay=${delay}: expected skippedNoData=0, got ${entry.report.skippedNoData}`);
      return;
    }
  }

  pass("entry fills at candle[delay] open, hold window shifts, pnl formula exact for both points");
});

test("SIM: a profile shorter than the delay is skipped and counted in skippedNoData", async ({ pass, fail }) => {
  // мир заканчивается на минуте 1501: первый чанк (limit 1000) полный,
  // второй неполный — профиль обрезается по границе последнего ПОЛНОГО
  // чанка -> 1000 свечей (профиль с неполным ПЕРВЫМ чанком был бы
  // отброшен целиком — теневая зона у края истории)
  const END_TS = START + 1501 * MINUTE;
  addExchangeSchema({
    exchangeName: "sim-delay-edge",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = Math.floor(since.getTime() / MINUTE) * MINUTE;
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * MINUTE;
        if (timestamp >= END_TS) {
          break; // мир свечей закончился
        }
        const open = rampPrice(timestamp);
        const close = rampPrice(timestamp + MINUTE);
        result.push({ timestamp, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 100 });
      }
      return result;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  const captured = [];
  addSimulatorSchema({
    simulatorName: "sim_delay_edge",
    exchangeName: "sim-delay-edge",
    gridAxes: {
      hardStopPercent: [50],
      trailingTakePercent: [100],
      holdMinutes: [60],
      entryDelayMinutes: [0, 1200],
      ...PERMISSIVE_FILTER,
      // единственная идея обрезана краем данных: known-outcome = 0,
      // track >= 1 забанил бы автора и съел сделку мгновенной точки
      minAuthorTrack: [0],
    },
    callbacks: {
      onGridPoint: (_symbol, report, trades) => captured.push({ report, trades }),
    },
  });

  const result = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_delay_edge",
    ideas: [{ id: 1, ts: START, symbol: "TESTUSDT", direction: "LONG", author: "edge" }],
  });

  if (result.truncatedCount !== 1) {
    fail(`expected 1 truncated profile, got ${result.truncatedCount}`);
    return;
  }
  const byDelay = new Map(
    captured.map((entry) => [entry.report.point.entryDelayMinutes, entry]),
  );
  const instant = byDelay.get(0);
  if (instant.trades.length !== 1 || instant.report.skippedNoData !== 0) {
    fail(`delay=0 must trade: trades=${instant.trades.length}, skippedNoData=${instant.report.skippedNoData}`);
    return;
  }
  const delayed = byDelay.get(1200);
  if (delayed.trades.length !== 0) {
    fail(`delay=1200 over a 1000-candle profile must not trade, got ${delayed.trades.length}`);
    return;
  }
  if (delayed.report.skippedNoData !== 1) {
    fail(`delay=1200: expected skippedNoData=1, got ${delayed.report.skippedNoData}`);
    return;
  }

  pass("1000-candle profile vs delay=1200: no trade, skippedNoData=1; instant point unaffected");
});

test("SIM: the busy check anchors to the delayed entry minute, not the post minute", async ({ pass, fail }) => {
  registerRampExchange("sim-delay-busy");

  const captured = [];
  addSimulatorSchema({
    simulatorName: "sim_delay_busy",
    exchangeName: "sim-delay-busy",
    gridAxes: {
      hardStopPercent: [50],
      trailingTakePercent: [100],
      holdMinutes: [3],
      entryDelayMinutes: [10],
      ...PERMISSIVE_FILTER,
    },
    callbacks: {
      onGridPoint: (_symbol, report, trades) => captured.push({ report, trades }),
    },
  });

  // пост B (минута 5) попадает в холд сделки A (вход 11, выход 13,
  // слот занят до 14), но отложенный вход B — минута 16, слот уже
  // свободен: якорь по минуте поста съел бы сделку B
  await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_delay_busy",
    ideas: [
      { id: 1, ts: START, symbol: "TESTUSDT", direction: "LONG", author: "first" },
      { id: 2, ts: START + 5 * MINUTE, symbol: "TESTUSDT", direction: "LONG", author: "second" },
    ],
  });

  const [{ report, trades }] = captured;
  if (trades.length !== 2) {
    fail(`expected 2 trades (B enters after A exits), got ${trades.length}, skippedBusy=${report.skippedBusy}`);
    return;
  }
  if (report.skippedBusy !== 0) {
    fail(`expected skippedBusy=0, got ${report.skippedBusy}`);
    return;
  }
  const [tradeA, tradeB] = trades;
  if (tradeB.entryTimestamp < tradeA.exitTimestamp + MINUTE) {
    fail("trade B must enter after the slot is freed");
    return;
  }

  pass("post inside a busy hold trades when its DELAYED entry lands after the exit");
});

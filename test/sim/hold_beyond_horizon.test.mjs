import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Холд длиннее горизонта профиля: holdMinutes = 20 дней против
 * 5-дневного (7200м) ПОЛНОГО профиля. exitIndex клампится к концу
 * профиля, и причина выхода обязана быть time_expired (а НЕ
 * data_truncated — та зарезервирована за обрезкой краем данных),
 * holdMinutesActual = 7200, выход по close последней свечи горизонта
 * — формульная сверка.
 */

const START = 1704067200000;
const MINUTE = 60_000;
const HORIZON = 5 * 24 * 60;

const priceAt = (timestamp) => {
  const m = Math.floor((timestamp - START) / MINUTE);
  return m < 0 ? 1000 : 1000 * (1 + 1e-6 * m);
};

test("SIM: hold beyond the profile horizon clamps to time_expired at the horizon close", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "sim-longhold-exchange",
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
    simulatorName: "sim_longhold",
    exchangeName: "sim-longhold-exchange",
    gridAxes: {
      hardStopPercent: [50],
      trailingTakePercent: [100],
      holdMinutes: [20 * 24 * 60],
      minIdeasAligned: [1],
      minAuthorTrack: [1],
      minAuthorHitRate: [0],
      minWeightAligned: [0],
      profitLockPercent: [0],
      minAuthorWilson: [0],
      authorMetric: ["close"],
    },
  });

  const result = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_longhold",
    ideas: [{ id: 1, ts: START, symbol: "TESTUSDT", direction: "LONG", author: "holder" }],
  });

  // профиль полный: край данных не при чём
  if (result.truncatedCount !== 0 || result.profileCount !== 1) {
    fail(`profile must be full, got truncated=${result.truncatedCount}`);
    return;
  }
  const [trade] = result.best.find(({ criterion }) => criterion === "sharpe").trades;
  if (trade.exitReason !== "time_expired") {
    fail(`clamped hold on a FULL profile must exit time_expired, got ${trade.exitReason}`);
    return;
  }
  if (trade.holdMinutesActual !== HORIZON) {
    fail(`hold must clamp to the ${HORIZON}m horizon, got ${trade.holdMinutesActual}`);
    return;
  }
  // выход по close последней свечи горизонта; вход — по open ПЕРВОЙ
  // свечи (m1 дрейф-мира = 1000.001, не 1000)
  const entryFill = priceAt(START + 1 * MINUTE) * 1.001;
  const exitClose = priceAt(START + (HORIZON + 1) * MINUTE);
  const expectedPnl = ((exitClose * 0.999 - entryFill) / entryFill) * 100 - 0.2;
  if (Math.abs(trade.pnlPercent - expectedPnl) > 1e-9) {
    fail(`horizon-close fill mismatch: expected ${expectedPnl}, got ${trade.pnlPercent}`);
    return;
  }

  pass(`hold 28800m clamps to 7200m horizon: time_expired at the horizon close (formula exact, pnl ${trade.pnlPercent.toFixed(4)}%)`);
});

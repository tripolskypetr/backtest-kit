import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Горизонт профиля следует за самым длинным холдом сетки: никакого
 * зашитого в движок потолка нет. holdMinutes = 20 дней -> профиль
 * идеи строится на 28800 минут вперёд, полный (мир бесконечный,
 * truncated = 0), и позиция без стопов/полов живёт ВЕСЬ холд:
 * выход time_expired, holdMinutesActual = 28800, по close последней
 * свечи холда — формульная сверка.
 */

const START = 1704067200000;
const MINUTE = 60_000;
const HOLD = 20 * 24 * 60;

const priceAt = (timestamp) => {
  const m = Math.floor((timestamp - START) / MINUTE);
  return m < 0 ? 1000 : 1000 * (1 + 1e-6 * m);
};

test("SIM: the profile horizon follows the longest hold — a 20-day hold lives its full 20 days", async ({ pass, fail }) => {
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
      holdMinutes: [HOLD],
      minAuthorTrack: [1],
      minAuthorHitRate: [0],
      profitLockPercent: [0],
      authorMetric: ["close"],
    },
  });

  const result = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_longhold",
    ideas: [{ id: 1, ts: START, symbol: "TESTUSDT", direction: "LONG", author: "holder" }],
  });

  // мир бесконечный: 20-дневный профиль обязан быть полным
  if (result.truncatedCount !== 0 || result.profileCount !== 1) {
    fail(`profile must be full, got truncated=${result.truncatedCount}`);
    return;
  }
  const [trade] = result.reports.close.best.find(({ criterion }) => criterion === "sharpe").trades;
  if (trade.exitReason !== "time_expired") {
    fail(`a stop-free drift world must exit time_expired, got ${trade.exitReason}`);
    return;
  }
  if (trade.holdMinutesActual !== HOLD) {
    fail(`the position must live the full ${HOLD}m hold, got ${trade.holdMinutesActual}`);
    return;
  }
  // выход по close последней свечи холда; вход — по open ПЕРВОЙ
  // свечи (m1 дрейф-мира = 1000.001, не 1000)
  const entryFill = priceAt(START + 1 * MINUTE) * 1.001;
  const exitClose = priceAt(START + (HOLD + 1) * MINUTE);
  const expectedPnl = ((exitClose * 0.999 - entryFill) / entryFill) * 100 - 0.2;
  if (Math.abs(trade.pnlPercent - expectedPnl) > 1e-9) {
    fail(`hold-end close fill mismatch: expected ${expectedPnl}, got ${trade.pnlPercent}`);
    return;
  }

  pass(`horizon = max(holdMinutes): 20-day hold builds a 28800m profile and expires at its close (pnl ${trade.pnlPercent.toFixed(4)}%)`);
});

import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, overrideSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Жизненный цикл сущности Simulator:
 *  1) повторная регистрация того же имени — ошибка валидации
 *     (реестр схем перезаписывает, валидация — нет);
 *  2) overrideSimulatorSchema ДО первого использования вступает в
 *     силу (клиент ещё не создан);
 *  3) override ПОСЛЕ первого run() НЕ вступает в силу — клиент
 *     мемоизирован по имени. Это зафиксированный контракт: override
 *     предназначен для донастройки до старта, а не для горячей
 *     замены осей у живого клиента.
 */

const START = 1704067200000;
const MINUTE = 60_000;

const SINGLE_POINT = {
  hardStopPercent: [50],
  trailingTakePercent: [100],
  holdMinutes: [60],
  minAuthorTrack: [1],
  minAuthorHitRate: [0],
  profitLockPercent: [0],
  authorMetric: ["close"],
};

const TWO_POINTS = { ...SINGLE_POINT, holdMinutes: [60, 120] };

const IDEAS = [{ id: 1, ts: START, symbol: "TESTUSDT", direction: "LONG", author: "solo" }];

test("SIM: duplicate registration throws, override applies before first use and not after", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "sim-lifecycle-exchange",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = Math.floor(since.getTime() / MINUTE) * MINUTE;
      return Array.from({ length: limit }, (_, i) => {
        const timestamp = alignedSince + i * MINUTE;
        const m = Math.floor((timestamp - START) / MINUTE);
        const open = 1000 * (1 + 1e-6 * Math.max(m, 0));
        const close = 1000 * (1 + 1e-6 * Math.max(m + 1, 0));
        return { timestamp, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 100 };
      });
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  // 1) дубль имени — ошибка валидации
  addSimulatorSchema({ simulatorName: "sim_lc_dup", exchangeName: "sim-lifecycle-exchange", gridAxes: SINGLE_POINT });
  let duplicateError = null;
  try {
    addSimulatorSchema({ simulatorName: "sim_lc_dup", exchangeName: "sim-lifecycle-exchange", gridAxes: SINGLE_POINT });
  } catch (error) {
    duplicateError = error;
  }
  if (!duplicateError || !String(duplicateError.message).includes("already exist")) {
    fail(`duplicate registration must throw "already exist", got ${duplicateError}`);
    return;
  }

  // 2) override ДО первого использования: сетка сжимается до 1 точки
  addSimulatorSchema({ simulatorName: "sim_lc_before", exchangeName: "sim-lifecycle-exchange", gridAxes: TWO_POINTS });
  await overrideSimulatorSchema({ simulatorName: "sim_lc_before", gridAxes: SINGLE_POINT });
  const before = await Simulator.run({ symbol: "TESTUSDT", simulatorName: "sim_lc_before", ideas: IDEAS });
  if (Object.values(before.reports).flatMap((b) => b.reports).length !== 1) {
    fail(`override before first use must apply (1 point), got ${Object.values(before.reports).flatMap((b) => b.reports).length}`);
    return;
  }

  // 3) override ПОСЛЕ первого run: клиент мемоизирован, сетка прежняя
  addSimulatorSchema({ simulatorName: "sim_lc_after", exchangeName: "sim-lifecycle-exchange", gridAxes: TWO_POINTS });
  const first = await Simulator.run({ symbol: "TESTUSDT", simulatorName: "sim_lc_after", ideas: IDEAS });
  if (Object.values(first.reports).flatMap((b) => b.reports).length !== 2) {
    fail(`sanity: pre-override run must see 2 points, got ${Object.values(first.reports).flatMap((b) => b.reports).length}`);
    return;
  }
  await overrideSimulatorSchema({ simulatorName: "sim_lc_after", gridAxes: SINGLE_POINT });
  const second = await Simulator.run({ symbol: "TESTUSDT", simulatorName: "sim_lc_after", ideas: IDEAS });
  if (Object.values(second.reports).flatMap((b) => b.reports).length !== 2) {
    fail(`override after first use must NOT apply to the memoized client, got ${Object.values(second.reports).flatMap((b) => b.reports).length} points`);
    return;
  }

  pass("lifecycle contract: duplicate name throws, override applies before first use (2->1 points), post-run override is inert (memoized client keeps 2)");
});

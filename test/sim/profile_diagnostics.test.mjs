import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Численная точность диагностики профиля — именно на этих полях
 * строится выбор боевых стопов:
 *  - maxMfePercent / minutesToMfe: лучшая экскурсия по фитилю;
 *  - maxMaePercent / minutesToMae: худшая экскурсия по фитилю;
 *  - shakeoutMaePercent: худшая просадка ДО свечи максимального
 *    пика ("встряска китов") — просадка ПОСЛЕ пика в неё не входит.
 *
 * Траектория (LONG, вход м1 @1000, мир иначе плоский):
 *  - м10: нижний фитиль 980  -> MAE -2% (индекс 9) — встряска;
 *  - м50: верхний фитиль 1050 -> MFE +5% (индекс 49);
 *  - м70: нижний фитиль 970  -> MAE -3% (индекс 69), уже ПОСЛЕ пика.
 *
 * Ожидание: shakeout = -2 (не -3!), maxMae = -3, maxMfe = +5.
 */

const START = 1704067200000;
const MINUTE = 60_000;

test("SIM: profile MFE/MAE/shakeout are numerically exact and shakeout ignores post-peak drawdown", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "sim-diag-exchange",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = Math.floor(since.getTime() / MINUTE) * MINUTE;
      return Array.from({ length: limit }, (_, i) => {
        const timestamp = alignedSince + i * MINUTE;
        const m = Math.floor((timestamp - START) / MINUTE);
        let high = 1000;
        let low = 1000;
        if (m === 10) low = 980;
        if (m === 50) high = 1050;
        if (m === 70) low = 970;
        return { timestamp, open: 1000, high, low, close: 1000, volume: 100 };
      });
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  const profiles = [];
  addSimulatorSchema({
    simulatorName: "sim_diag",
    exchangeName: "sim-diag-exchange",
    gridAxes: {
      hardStopPercent: [50],
      trailingTakePercent: [100],
      holdMinutes: [60],
      minAuthorTrack: [1],
      minAuthorHitRate: [0],
      profitLockPercent: [0],
      authorMetric: ["close"],
    },
    callbacks: {
      onProfiles: (_symbol, list) => profiles.push(...list),
    },
  });

  await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_diag",
    ideas: [
      { id: 1, ts: START, symbol: "TESTUSDT", direction: "LONG", author: "solo" },
    ],
  });

  if (profiles.length !== 1) {
    fail(`expected 1 profile, got ${profiles.length}`);
    return;
  }
  const [p] = profiles;

  const checks = [
    ["entryPrice", p.entryPrice, 1000],
    ["entryTimestamp", p.entryTimestamp, START + MINUTE],
    ["maxMfePercent", p.maxMfePercent, 5],
    ["minutesToMfe", p.minutesToMfe, 49],
    ["maxMaePercent", p.maxMaePercent, -3],
    ["minutesToMae", p.minutesToMae, 69],
    ["shakeoutMaePercent", p.shakeoutMaePercent, -2],
    ["truncated", p.truncated, false],
    ["hit", p.hit, false],
  ];
  for (const [name, got, want] of checks) {
    if (got !== want) {
      fail(`${name}: got ${got}, expected ${want}`);
      return;
    }
  }

  pass(
    `profile exact: MFE +5% @49m, MAE -3% @69m, shakeout -2% (post-peak -3% correctly excluded)`
  );
});

import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Антифлуд-дедуп: не более одной идеи автора в одном направлении за
 * 8 часов (480 минут). Проверяются три свойства:
 *  1) флуд схлопывается до одной идеи на окно;
 *  2) окно НЕ продлевается отброшенными постами (пост на минуте 300
 *     отброшен, но пост на минуте 600 сравнивается с оставленным
 *     на минуте 0, а не с отброшенным);
 *  3) противоположное направление — не флуд, а смена мнения: LONG и
 *     SHORT одного автора рядом оба выживают.
 *
 * Мир плоский: счётчики дедупа считаются до фильтра авторов и
 * сделок, поэтому исходы сделок не важны.
 */

const START = 1704067200000;
const MINUTE = 60_000;

const registerFlatExchange = (exchangeName) => {
  addExchangeSchema({
    exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = Math.floor(since.getTime() / MINUTE) * MINUTE;
      return Array.from({ length: limit }, (_, i) => ({
        timestamp: alignedSince + i * MINUTE,
        open: 1000,
        high: 1000,
        low: 1000,
        close: 1000,
        volume: 100,
      }));
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });
};

const GRID_AXES = {
  hardStopPercent: [50],
  trailingTakePercent: [100],
  holdMinutes: [60],
  minIdeasAligned: [1],
  minAuthorTrack: [1],
  minAuthorHitRate: [0],
  minWeightAligned: [0],
  profitLockPercent: [0],
  minAuthorWilson: [0],
  authorMetric: ["close"],
};

const idea = (id, minute, direction, author) => ({
  id,
  ts: START + minute * MINUTE,
  symbol: "TESTUSDT",
  direction,
  author,
});

test("SIM: flood collapses and the dedupe window is not extended by dropped posts", async ({ pass, fail }) => {
  registerFlatExchange("sim-dedupe-a");
  addSimulatorSchema({
    simulatorName: "sim_dedupe_a",
    exchangeName: "sim-dedupe-a",
    gridAxes: GRID_AXES,
    callbacks: {},
  });

  // [0, 300, 600]: 300 отброшена (< 480 от 0), 600 оставлена
  // (600 - 0 >= 480) — если бы окно продлевалось отброшенной 300,
  // идея 600 была бы отброшена тоже (600 - 300 < 480)
  const tripleResult = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_dedupe_a",
    ideas: [
      idea(1, 0, "LONG", "spam"),
      idea(2, 300, "LONG", "spam"),
      idea(3, 600, "LONG", "spam"),
    ],
  });
  if (tripleResult.ideasTotal !== 3 || tripleResult.ideasDirectional !== 2) {
    fail(`triple: expected 3 total / 2 deduped, got ${tripleResult.ideasTotal}/${tripleResult.ideasDirectional}`);
    return;
  }

  pass(`window not extended by dropped posts: [0,300,600] -> ${tripleResult.ideasDirectional} kept`);
});

test("SIM: dense flood keeps one idea per 8h window", async ({ pass, fail }) => {
  registerFlatExchange("sim-dedupe-b");
  addSimulatorSchema({
    simulatorName: "sim_dedupe_b",
    exchangeName: "sim-dedupe-b",
    gridAxes: GRID_AXES,
    callbacks: {},
  });

  // 25 постов каждый час (минуты 0..1440): выживают 0, 480, 960, 1440
  const ideas = Array.from({ length: 25 }, (_, k) =>
    idea(100 + k, k * 60, "LONG", "spam"),
  );
  const result = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_dedupe_b",
    ideas,
  });
  if (result.ideasTotal !== 25 || result.ideasDirectional !== 4) {
    fail(`flood: expected 25 total / 4 deduped, got ${result.ideasTotal}/${result.ideasDirectional}`);
    return;
  }

  pass(`25 hourly posts collapsed to ${result.ideasDirectional} (one per 8h window)`);
});

test("SIM: opposite direction is an opinion change, not flood", async ({ pass, fail }) => {
  registerFlatExchange("sim-dedupe-c");
  addSimulatorSchema({
    simulatorName: "sim_dedupe_c",
    exchangeName: "sim-dedupe-c",
    gridAxes: GRID_AXES,
    callbacks: {},
  });

  const result = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_dedupe_c",
    ideas: [
      idea(1, 0, "LONG", "flipper"),
      idea(2, 60, "SHORT", "flipper"),
    ],
  });
  if (result.ideasDirectional !== 2) {
    fail(`LONG+SHORT of one author must both survive, got ${result.ideasDirectional}`);
    return;
  }

  pass("LONG and SHORT of the same author within the window both survived");
});

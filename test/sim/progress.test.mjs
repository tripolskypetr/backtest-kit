import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * onProgress и гигиена фида:
 *  - стадия "profiles" стреляет по разу на направленную идею
 *    (1..total, total = directional после дедупа);
 *  - стадия "grid" — по разу на точку сетки;
 *  - processed монотонен и завершается ровно на total;
 *  - чужие символы отфильтрованы до любых вычислений, NEUTRAL
 *    исключён из направленных, но посчитан в ideasTotal.
 */

const START = 1704067200000;
const MINUTE = 60_000;

test("SIM: onProgress streams both stages; foreign symbols and NEUTRAL are filtered", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "sim-progress-exchange",
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

  const events = [];
  addSimulatorSchema({
    simulatorName: "sim_progress",
    exchangeName: "sim-progress-exchange",
    gridAxes: {
      hardStopPercent: [50],
      trailingTakePercent: [100],
      holdMinutes: [60, 120],
      minAuthorTrack: [1],
      minAuthorHitRate: [0],
      profitLockPercent: [0],
      authorMetric: ["close"],
    },
    callbacks: {
      onProgress: (symbol, stage, processed, total) => {
        events.push({ symbol, stage, processed, total });
      },
    },
  });

  const ideas = [
    // три направленные идеи TESTUSDT от разных авторов (без дедупа)
    { id: 1, ts: START, symbol: "TESTUSDT", direction: "LONG", author: "X" },
    { id: 2, ts: START + 30 * MINUTE, symbol: "TESTUSDT", direction: "SHORT", author: "Y" },
    { id: 3, ts: START + 90 * MINUTE, symbol: "TESTUSDT", direction: "LONG", author: "Z" },
    // NEUTRAL того же символа: в ideasTotal есть, в directional нет
    { id: 4, ts: START + 10 * MINUTE, symbol: "TESTUSDT", direction: "NEUTRAL", author: "X" },
    // чужой символ: отфильтрован целиком
    { id: 5, ts: START, symbol: "OTHERUSDT", direction: "LONG", author: "X" },
    { id: 6, ts: START + 60 * MINUTE, symbol: "OTHERUSDT", direction: "SHORT", author: "Y" },
  ];

  const result = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_progress",
    ideas,
  });

  if (result.ideasTotal !== 4 || result.ideasDirectional !== 3 || result.profileCount !== 3) {
    fail(`feed hygiene: total=${result.ideasTotal} directional=${result.ideasDirectional} profiles=${result.profileCount}`);
    return;
  }

  const profileEvents = events.filter(({ stage }) => stage === "profiles");
  const gridEvents = events.filter(({ stage }) => stage === "grid");

  if (profileEvents.length !== 3 || gridEvents.length !== 2) {
    fail(`expected 3 profile + 2 grid events, got ${profileEvents.length}+${gridEvents.length}`);
    return;
  }

  // стадии не перемешаны: сначала профили, затем сетка
  const firstGridIndex = events.findIndex(({ stage }) => stage === "grid");
  if (events.slice(firstGridIndex).some(({ stage }) => stage === "profiles")) {
    fail("profiles events must all precede grid events");
    return;
  }

  // processed монотонен 1..total, total корректен
  const checkSequence = (list, total) =>
    list.every((e, i) => e.processed === i + 1 && e.total === total && e.symbol === "TESTUSDT");
  if (!checkSequence(profileEvents, 3)) {
    fail(`profiles sequence broken: ${JSON.stringify(profileEvents)}`);
    return;
  }
  if (!checkSequence(gridEvents, 2)) {
    fail(`grid sequence broken: ${JSON.stringify(gridEvents)}`);
    return;
  }

  pass(`onProgress: profiles 1..3, grid 1..2, stages ordered; NEUTRAL and foreign symbols filtered`);
});

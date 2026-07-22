import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Вырожденные фиды:
 *  1) пустой массив идей — прогон завершается структурированно:
 *     нулевые счётчики, полная сетка нулевых точек, рейтинги
 *     разрешены, ничего не падает;
 *  2) идеи у самого края данных и за краем — обе отбрасываются через
 *     null-путь BUILD_PROFILE_FN: из-за строгого контракта Exchange
 *     (ровно limit свечей, иначе исключение) идея, чей ПЕРВЫЙ чанк
 *     задевает край истории, не получает ни одной свечи — у края
 *     существует "теневая зона" глубиной в один чанк (1000 минут).
 *     profileCount < ideasDirectional, прогон жив.
 */

const START = 1704067200000;
const MINUTE = 60_000;
const END_M = 500; // мир свечей: всего 500 минут
const END_TS = START + END_M * MINUTE;

const registerBoundedExchange = (exchangeName) => {
  addExchangeSchema({
    exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = Math.floor(since.getTime() / MINUTE) * MINUTE;
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * MINUTE;
        if (timestamp >= END_TS) {
          break;
        }
        result.push({ timestamp, open: 1000, high: 1000, low: 1000, close: 1000, volume: 100 });
      }
      return result;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });
};

const GRID_AXES = {
  hardStopPercent: [5, 50],
  trailingTakePercent: [100],
  holdMinutes: [60],
  minIdeasAligned: [1],
  minAuthorTrack: [1],
  minAuthorHitRate: [0],
  minWeightAligned: [0],
  profitLockPercent: [0],
  entryDelayMinutes: [0],
  authorMetric: ["close"],
};

test("SIM: empty ideas feed resolves structurally — zero counters, zero grid, rankings intact", async ({ pass, fail }) => {
  registerBoundedExchange("sim-empty-exchange");
  addSimulatorSchema({
    simulatorName: "sim_empty",
    exchangeName: "sim-empty-exchange",
    gridAxes: GRID_AXES,
    callbacks: {},
  });

  const result = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_empty",
    ideas: [],
  });

  if (result.ideasTotal !== 0 || result.ideasDirectional !== 0 || result.profileCount !== 0) {
    fail(`counters must be zero, got ${result.ideasTotal}/${result.ideasDirectional}/${result.profileCount}`);
    return;
  }
  if (result.reports.length !== 2 || result.reports.some((r) => r.trades !== 0 || r.totalPnlPercent !== 0)) {
    fail(`grid must be full of zero points, got ${JSON.stringify(result.reports.map((r) => r.trades))}`);
    return;
  }
  if (result.best.length !== 4 || result.best.some((b) => !b.report)) {
    fail("rankings must resolve on an empty feed");
    return;
  }
  if (result.best.find(({ criterion }) => criterion === "sharpe").allowedAuthors.length !== 0 || result.best.find(({ criterion }) => criterion === "sharpe").bannedAuthors.length !== 0 || result.best.find(({ criterion }) => criterion === "sharpe").authorStats.length !== 0) {
    fail("author artifacts must be empty");
    return;
  }
  if (result.avgHoldMinutes !== 0 || result.p99HoldMinutes !== 0) {
    fail(`hold stats must be zero, got ${result.avgHoldMinutes}/${result.p99HoldMinutes}`);
    return;
  }

  pass("empty feed: zero counters, 2 zero points, 4 rankings resolved, no crash");
});

test("SIM: idea entirely beyond the end of data is dropped via the null-profile path", async ({ pass, fail }) => {
  registerBoundedExchange("sim-beyond-exchange");
  addSimulatorSchema({
    simulatorName: "sim_beyond",
    exchangeName: "sim-beyond-exchange",
    gridAxes: GRID_AXES,
    callbacks: {},
  });

  const result = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_beyond",
    ideas: [
      // внутри мира (500м < чанка): первый же чанк задевает край ->
      // ноль свечей -> null-профиль (теневая зона края)
      { id: 1, ts: START, symbol: "TESTUSDT", direction: "LONG", author: "edge" },
      // целиком за краем данных: ни одной свечи -> профиль null
      { id: 2, ts: END_TS + 1000 * MINUTE, symbol: "TESTUSDT", direction: "LONG", author: "ghost" },
    ],
  });

  if (result.ideasDirectional !== 2) {
    fail(`expected 2 directional ideas, got ${result.ideasDirectional}`);
    return;
  }
  if (result.profileCount !== 0 || result.truncatedCount !== 0) {
    fail(`both ideas must be dropped via null profile, got profiles=${result.profileCount} truncated=${result.truncatedCount}`);
    return;
  }
  // авторы без профилей не попадают в статистику
  if (result.best.find(({ criterion }) => criterion === "sharpe").authorStats.length !== 0) {
    fail(`no author may have stats without a profile, got ${JSON.stringify(result.best.find(({ criterion }) => criterion === "sharpe").authorStats)}`);
    return;
  }
  if (result.reports.some((r) => r.trades !== 0)) {
    fail("no trades may appear without profiles");
    return;
  }

  pass("edge-zone and beyond-the-edge ideas both dropped via null profile; run intact");
});

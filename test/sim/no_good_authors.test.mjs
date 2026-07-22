import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Датасет без единого хорошего автора: дефолт-бан выпиливает всех,
 * и симулятор обязан отработать вырожденный случай без сделок
 * корректно — пустой белый список, нулевые отчёты по всем точкам,
 * нулевые hold-статистики, победители рейтингов существуют (нулевая
 * точка), ничего не падает.
 *
 * Мир с дрейфом вверх (+1e-4% в минуту):
 *  - wrong1: 4 SHORT — каждый прогноз мимо (hitRate 0, бан по правоте);
 *  - wrong2: 3 SHORT — то же;
 *  - rookie: 1 LONG — прав, но трек 1 < 3 (бан за недоказанность).
 *
 * Профили при этом строятся для всех идей: фильтр авторов — это
 * оценка сетки, а не препроцессинг свечного прохода.
 */

const START = 1704067200000;
const MINUTE = 60_000;
const SPACING = 481;

const priceAt = (timestamp) => {
  const m = Math.floor((timestamp - START) / MINUTE);
  return m < 0 ? 1000 : 1000 * (1 + 1e-6 * m);
};

const idea = (id, minute, direction, author) => ({
  id,
  ts: START + minute * MINUTE,
  symbol: "TESTUSDT",
  direction,
  author,
});

test("SIM: dataset with no good author — everyone banned, zero trades, no crash", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "sim-nogood-exchange",
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

  const pointReports = [];
  addSimulatorSchema({
    simulatorName: "sim_nogood",
    exchangeName: "sim-nogood-exchange",
    gridAxes: {
      hardStopPercent: [5, 50],
      trailingTakePercent: [2, 100],
      holdMinutes: [60],
      minIdeasAligned: [1],
      minAuthorTrack: [3],
      minAuthorHitRate: [0.5],
      minWeightAligned: [0],
    },
    callbacks: {
      onGridPoint: (_symbol, report) => pointReports.push(report),
    },
  });

  const ideas = [
    ...Array.from({ length: 4 }, (_, k) => idea(10 + k, k * SPACING, "SHORT", "wrong1")),
    ...Array.from({ length: 3 }, (_, k) => idea(20 + k, k * SPACING + 100, "SHORT", "wrong2")),
    idea(30, 150, "LONG", "rookie"),
  ];

  const result = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_nogood",
    ideas,
  });

  // профили построены для всех: фильтр — не препроцессинг свечей
  if (result.profileCount !== 8 || result.ideasDirectional !== 8) {
    fail(`expected 8 profiles, got ${result.profileCount}/${result.ideasDirectional}`);
    return;
  }

  // белый список пуст, в бане все трое
  if (result.allowedAuthors.length !== 0) {
    fail(`allowedAuthors must be empty, got ${JSON.stringify(result.allowedAuthors)}`);
    return;
  }
  const banned = new Set(result.bannedAuthors);
  for (const author of ["wrong1", "wrong2", "rookie"]) {
    if (!banned.has(author)) {
      fail(`${author} must be banned, bannedAuthors=${JSON.stringify(result.bannedAuthors)}`);
      return;
    }
  }

  // статистика авторов честная: у wrong-авторов нулевая правота,
  // у rookie — правота есть, трека нет
  const stats = Object.fromEntries(result.authorStats.map((s) => [s.author, s]));
  if (stats.wrong1.hitRate !== 0 || stats.wrong2.hitRate !== 0) {
    fail(`wrong authors must have hitRate 0, got ${stats.wrong1.hitRate}/${stats.wrong2.hitRate}`);
    return;
  }
  if (stats.rookie.hitRate !== 1 || stats.rookie.ideas !== 1 || !stats.rookie.banned) {
    fail(`rookie must be right but banned as unproven, got ${JSON.stringify(stats.rookie)}`);
    return;
  }

  // все точки сетки — нулевые, но существуют
  if (pointReports.length !== 4) {
    fail(`expected 4 grid points, got ${pointReports.length}`);
    return;
  }
  for (const report of pointReports) {
    if (
      report.trades !== 0 ||
      report.skippedBusy !== 0 ||
      report.totalPnlPercent !== 0 ||
      report.sharpe !== 0 ||
      report.sortino !== 0 ||
      report.avgHoldMinutes !== 0 ||
      report.p99HoldMinutes !== 0
    ) {
      fail(`zero-trade point must be all zeros, got ${JSON.stringify(report)}`);
      return;
    }
  }

  // победители рейтингов существуют (нулевая точка), прогон не падает
  if (result.best.length !== 3 || result.best.some((b) => !b.report || b.report.trades !== 0)) {
    fail(`rankings must resolve to a zero-trade point, got ${JSON.stringify(result.best.map((b) => b.report?.trades))}`);
    return;
  }

  // hold-статистики уровня прогона нулевые
  if (result.avgHoldMinutes !== 0 || result.p95HoldMinutes !== 0 || result.p99HoldMinutes !== 0) {
    fail(`run-level hold stats must be zeros, got ${result.avgHoldMinutes}/${result.p95HoldMinutes}/${result.p99HoldMinutes}`);
    return;
  }

  pass(
    `no good authors: 8 profiles built, whitelist empty, 3/3 banned ` +
    `(wrong 0.0 hitRate, rookie unproven), 4 zero points, rankings resolved without crash`
  );
});

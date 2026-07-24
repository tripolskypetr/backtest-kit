import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Метрика "pnl" — фиксированный порог +1% MFE, независимый от lock:
 *  1) при lock=0 метрика грейдит достижимость +1% как есть: автор
 *     paying (спайк +1.5%) допущен, автор edge (спайк ровно +1.0%)
 *     банится — порог СТРОГО больше;
 *  2) словарь result.reports: единственная точка лежит в корзине
 *     "pnl", остальные корзины существуют и пусты.
 *
 * Мир: цикл длиной в горизонт (7200м). Чётные циклы — спайк ровно
 * +1.5% (paying), нечётные — спайк ровно +1.0% (edge). Дальше база
 * до конца цикла: close-исход у обоих нулевой.
 */

const START = 1704067200000;
const MINUTE = 60_000;
const CYCLE = 7200;

const priceAt = (timestamp) => {
  const m = Math.floor((timestamp - START) / MINUTE);
  if (m < 0) return 1000;
  const cycle = Math.floor(m / CYCLE);
  const phase = m % CYCLE;
  if (phase < 2 || phase > 60) return 1000;
  // чётный цикл: пик 1015 (+1.5%); нечётный: ровно 1010 (+1.0%)
  return cycle % 2 === 0 ? 1015 : 1010;
};

const idea = (id, cycle, author) => ({
  id,
  ts: START + cycle * CYCLE * MINUTE,
  symbol: "TESTUSDT",
  direction: "LONG",
  author,
});

const IDEAS = [
  ...Array.from({ length: 5 }, (_, k) => idea(10 + k, 2 * k, "paying")),
  ...Array.from({ length: 5 }, (_, k) => idea(20 + k, 2 * k + 1, "edge")),
];

test("SIM: pnl metric grades the fixed +1% threshold independent of lock — strictly greater", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "sim-pnlmetric-exchange",
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

  const trained = [];
  addSimulatorSchema({
    simulatorName: "sim_pnlmetric",
    exchangeName: "sim-pnlmetric-exchange",
    gridAxes: {
      hardStopPercent: [5],
      trailingTakePercent: [100],
      holdMinutes: [60],
      minAuthorTrack: [3],
      minAuthorHitRate: [0.5],
      // lock=0: pnl-метрика от замка не зависит и грейдит как есть
      profitLockPercent: [0],
      authorMetric: ["pnl"],
    },
    callbacks: {
      onAuthorsTrained: (_symbol, stats) => trained.push(stats),
    },
  });

  const result = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_pnlmetric",
    ideas: IDEAS,
  });

  // словарь отчётов: точка в корзине "pnl", остальные ключи пусты
  if (result.reports.pnl.reports.length !== 1) {
    fail(`the point must land in reports.pnl, got ${result.reports.pnl.reports.length}`);
    return;
  }
  for (const key of ["close", "reach", "retain"]) {
    if (!Array.isArray(result.reports[key].reports) || result.reports[key].reports.length !== 0) {
      fail(`reports.${key} must exist and be empty, got ${JSON.stringify(result.reports[key].reports)}`);
      return;
    }
  }

  if (trained.length !== 1) {
    fail(`expected 1 training (single pnl rule), got ${trained.length}`);
    return;
  }
  const stats = Object.fromEntries(trained[0].map((s) => [s.author, s]));
  // paying: MFE +1.5% > 1 -> 5/5, допуск
  if (stats.paying.hits !== 5 || stats.paying.banned) {
    fail(`paying (+1.5% spikes) must be 5/5 allowed, got ${JSON.stringify(stats.paying)}`);
    return;
  }
  // edge: MFE ровно +1.0% — НЕ больше порога, 0/5, бан
  if (stats.edge.hits !== 0 || !stats.edge.banned) {
    fail(`edge (exactly +1.0% spikes) must be 0/5 banned — the threshold is strictly greater, got ${JSON.stringify(stats.edge)}`);
    return;
  }

  // торгует только paying
  const [report] = result.reports.pnl.reports;
  if (report.trades !== 5) {
    fail(`only paying's 5 ideas must trade, got ${report.trades}`);
    return;
  }

  pass(
    `pnl metric @ lock=0: paying (+1.5%) 5/5 allowed, edge (exactly +1.0%) 0/5 banned (strict >), ` +
    `report in reports.pnl bucket, other buckets present and empty`
  );
});

import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Анти-флюк порог выбора победителя (MIN_TRADES_FOR_BEST = 8):
 * точка с 1 монструозной сделкой доминирует по totalPnl, но не может
 * стать победителем ни одного рейтинга — им обязана стать точка с
 * достаточным треком сделок. Заодно проверяется порядок sorted в
 * onRanking (невозрастание по своему критерию).
 *
 * Мир "лестница": каждый цикл (481м) даёт всплеск +1% (минуты 2..61)
 * и поднимает базу на +3% навсегда (12 ступеней). Точка hold=60
 * снимает всплески: 12 скромных сделок ~ +0.6%. Точка hold=7200
 * въезжает в лестницу целиком: ОДНА сделка ~ +42%, остальные идеи
 * поглощены слотом — трек 1 < 8, в победители нельзя.
 */

const START = 1704067200000;
const MINUTE = 60_000;
const SPACING = 481;
const CYCLES = 12;

const priceAt = (timestamp) => {
  const m = Math.floor((timestamp - START) / MINUTE);
  if (m < 0) return 1000;
  const cycle = Math.floor(m / SPACING);
  const base = 1000 * Math.pow(1.03, Math.min(cycle, CYCLES));
  const phase = m % SPACING;
  if (cycle < CYCLES && phase >= 2 && phase <= 61) {
    return base * 1.01;
  }
  return base;
};

test("SIM: a monster single-trade point cannot win any ranking — the trades floor holds", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "sim-best-exchange",
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

  const rankings = [];
  addSimulatorSchema({
    simulatorName: "sim_best",
    exchangeName: "sim-best-exchange",
    gridAxes: {
      hardStopPercent: [50],
      trailingTakePercent: [100],
      holdMinutes: [60, 7200],
      minIdeasAligned: [1],
      minAuthorTrack: [3],
      minAuthorHitRate: [0.5],
      minWeightAligned: [0],
      profitLockPercent: [0],
      authorMetric: ["close"],
    },
    callbacks: {
      onRanking: (_symbol, criterion, sorted, best) => {
        rankings.push({ criterion, sorted, best });
      },
    },
  });

  const result = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_best",
    ideas: Array.from({ length: CYCLES }, (_, k) => ({
      id: 1 + k,
      ts: START + k * SPACING * MINUTE,
      symbol: "TESTUSDT",
      direction: "LONG",
      author: "steady",
    })),
  });

  const steady = result.reports.find(({ point }) => point.holdMinutes === 60);
  const fluke = result.reports.find(({ point }) => point.holdMinutes === 7200);
  if (!steady || !fluke) {
    fail("both points must be evaluated");
    return;
  }

  // флюк: одна сделка, но тотальное доминирование по PnL
  if (fluke.trades !== 1 || fluke.totalPnlPercent < 30) {
    fail(`fluke point must have 1 monster trade (>+30%), got ${fluke.trades}/${fluke.totalPnlPercent.toFixed(2)}`);
    return;
  }
  if (steady.trades !== CYCLES || !(fluke.totalPnlPercent > steady.totalPnlPercent)) {
    fail(`steady must have ${CYCLES} modest trades below fluke pnl, got ${steady.trades}/${steady.totalPnlPercent.toFixed(2)}`);
    return;
  }

  // порог сделок: победитель каждого рейтинга — steady, не флюк
  for (const best of result.best) {
    if (!best.report || best.report.point.holdMinutes !== 60) {
      fail(`${best.criterion} winner must be the 12-trade point, got hold=${best.report?.point.holdMinutes}`);
      return;
    }
    if (best.report.trades < 8) {
      fail(`${best.criterion} winner must satisfy the trades floor, got ${best.report.trades}`);
      return;
    }
  }

  // sorted в onRanking невозрастает по своему критерию
  const valueOf = (criterion, report) =>
    criterion === "pnl" ? report.totalPnlPercent : report[criterion];
  for (const { criterion, sorted } of rankings) {
    for (let i = 1; i < sorted.length; i++) {
      if (valueOf(criterion, sorted[i - 1]) < valueOf(criterion, sorted[i])) {
        fail(`onRanking(${criterion}) sorted must be non-increasing`);
        return;
      }
    }
  }

  pass(
    `fluke +${fluke.totalPnlPercent.toFixed(1)}% (1 trade) dominated pnl but lost every ranking to ` +
    `steady +${steady.totalPnlPercent.toFixed(1)}% (${steady.trades} trades); sorted order verified`
  );
});

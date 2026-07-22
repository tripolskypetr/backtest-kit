import { test } from "worker-testbed";
import { readFileSync } from "fs";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Интеграционный вариант eternal_hold.test.mjs: идеи приходят не из
 * кода, а из data/simulator_1.jsonl — тем же путём, каким их подаёт
 * CLI-режим --simulator (jsonl-файл, строка = ISimulatorIdea).
 * Свечной мир — та же детерминированная "пила" (см. eternal_hold).
 *
 * Проверяется тот же математический инвариант: точка с вечным холдом
 * проигрывает точке с нормальными входами и по PnL, и по time-based
 * Sharpe, а победители всех рейтингов указывают на короткий холд.
 */

const START = 1704067200000; // 2024-01-01T00:00:00Z — совпадает с ts первой идеи файла
const MINUTE = 60_000;
const SPACING = 481;
const IDEAS_COUNT = 90;
const BASE_PRICE = 1000;
const DRIFT_PER_MINUTE = 1e-6;
const SPIKE = 1.01;

const priceAt = (timestamp) => {
  const m = Math.floor((timestamp - START) / MINUTE);
  if (m < 0) {
    return BASE_PRICE;
  }
  const base = BASE_PRICE * (1 + DRIFT_PER_MINUTE * m);
  const phase = m % SPACING;
  const cycle = Math.floor(m / SPACING);
  if (cycle < IDEAS_COUNT && phase >= 2 && phase <= 61) {
    return base * SPIKE;
  }
  return base;
};

test("SIM: jsonl feed end-to-end — eternal hold loses to normal entries", async ({ pass, fail }) => {
  const ideas = readFileSync(
    new URL("../data/simulator_1.jsonl", import.meta.url),
    "utf-8",
  )
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  if (ideas.length !== IDEAS_COUNT) {
    fail(`data/simulator_1.jsonl expected ${IDEAS_COUNT} ideas, got ${ideas.length}`);
    return;
  }

  addExchangeSchema({
    exchangeName: "sim-jsonl-exchange",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = Math.floor(since.getTime() / MINUTE) * MINUTE;
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * MINUTE;
        const open = priceAt(timestamp);
        const close = priceAt(timestamp + MINUTE);
        result.push({
          timestamp,
          open,
          high: Math.max(open, close),
          low: Math.min(open, close),
          close,
          volume: 100,
        });
      }
      return result;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, qty) => qty.toFixed(8),
  });

  addSimulatorSchema({
    simulatorName: "sim_jsonl",
    exchangeName: "sim-jsonl-exchange",
    gridAxes: {
      hardStopPercent: [50],
      trailingTakePercent: [100],
      holdMinutes: [60, 7200],
      minIdeasAligned: [1],
      minAuthorTrack: [3],
      minAuthorHitRate: [0.5],
      minWeightAligned: [0],
    },
    callbacks: {},
  });

  const result = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_jsonl",
    ideas,
  });

  if (result.ideasTotal !== IDEAS_COUNT || result.ideasDirectional !== IDEAS_COUNT) {
    fail(`feed mismatch: total=${result.ideasTotal}, directional=${result.ideasDirectional}`);
    return;
  }
  if (result.profileCount !== IDEAS_COUNT || result.truncatedCount !== 0) {
    fail(`profiles mismatch: count=${result.profileCount}, truncated=${result.truncatedCount}`);
    return;
  }

  const short = result.reports.find(({ point }) => point.holdMinutes === 60);
  const eternal = result.reports.find(({ point }) => point.holdMinutes === 7200);
  if (!short || !eternal) {
    fail("short/eternal hold reports not found");
    return;
  }

  if (!(short.totalPnlPercent > eternal.totalPnlPercent && short.sharpe > eternal.sharpe)) {
    fail(
      `waiting must be punished: short pnl=${short.totalPnlPercent.toFixed(2)}/sharpe=${short.sharpe.toFixed(2)} ` +
      `vs eternal pnl=${eternal.totalPnlPercent.toFixed(2)}/sharpe=${eternal.sharpe.toFixed(2)}`
    );
    return;
  }
  for (const best of result.best) {
    if (!best.report || best.report.point.holdMinutes !== 60) {
      fail(`ranking ${best.criterion} must pick hold=60`);
      return;
    }
  }

  pass(
    `jsonl e2e: short pnl=${short.totalPnlPercent.toFixed(2)}%/sharpe=${short.sharpe.toFixed(2)} beats ` +
    `eternal pnl=${eternal.totalPnlPercent.toFixed(2)}%/sharpe=${eternal.sharpe.toFixed(2)}; all rankings pick hold=60`
  );
});

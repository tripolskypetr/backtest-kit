import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Порог консенсуса minIdeasAligned: вход требует N УНИКАЛЬНЫХ
 * однонаправленных авторов в скользящем 4-часовом окне.
 *
 * Сценарий: A постит LONG на минуте 0, B — LONG на минуте 70
 * (в окне A ещё жив: 70 < 240), C — LONG на минуте 600 (один).
 *  - N=1: торгуются все три идеи (слот успевает освободиться);
 *  - N=2: торгуется только идея B (на её входе окно содержит {A, B});
 *    идея A входила при {A} = 1, идея C — при {C} = 1.
 *
 * Мир плоский, фильтр авторов пермиссивный — изолируется только
 * консенсус-порог.
 */

const START = 1704067200000;
const MINUTE = 60_000;

const idea = (id, minute, author) => ({
  id,
  ts: START + minute * MINUTE,
  symbol: "TESTUSDT",
  direction: "LONG",
  author,
});

test("SIM: minIdeasAligned counts unique aligned authors in the rolling window", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "sim-consensus-exchange",
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

  const captured = new Map();
  addSimulatorSchema({
    simulatorName: "sim_consensus",
    exchangeName: "sim-consensus-exchange",
    gridAxes: {
      hardStopPercent: [50],
      trailingTakePercent: [100],
      holdMinutes: [60],
      minIdeasAligned: [1, 2],
      minAuthorTrack: [1],
      minAuthorHitRate: [0],
      minWeightAligned: [0],
      profitLockPercent: [0],
    },
    callbacks: {
      onGridPoint: (_symbol, report, trades) => {
        captured.set(report.point.minIdeasAligned, { report, trades });
      },
    },
  });

  await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_consensus",
    ideas: [idea(1, 0, "A"), idea(2, 70, "B"), idea(3, 600, "C")],
  });

  const solo = captured.get(1);
  const pair = captured.get(2);
  if (!solo || !pair) {
    fail("both N points must be evaluated");
    return;
  }

  if (solo.report.trades !== 3) {
    fail(`N=1 must trade all three ideas, got ${solo.report.trades}`);
    return;
  }

  if (pair.report.trades !== 1) {
    fail(`N=2 must trade only idea B, got ${pair.report.trades}`);
    return;
  }
  if (pair.trades[0].ideaId !== 2) {
    fail(`N=2 trade must be triggered by idea B (id=2), got ${pair.trades[0].ideaId}`);
    return;
  }

  pass(`N=1 traded 3 ideas; N=2 traded only B where window held {A,B}`);
});

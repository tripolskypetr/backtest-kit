import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Взвешенный консенсус — это СУММА весов, не максимум: два автора с
 * одной идеей каждый (вес Лапласа (1+1)/(1+2) = 0.667) порознь не
 * проходят порог W=1.0, а парой (0.667 + 0.667 = 1.333) — проходят.
 *
 * P постит первым (в его окне только он сам: 0.667 < 1.0 — отсечён),
 * Q через 30 минут (в окне P+Q: 1.333 >= 1.0 — торгует). Контрольная
 * схема W=0.5 пропускает обоих поодиночке — 2 сделки.
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

const AXES = {
  hardStopPercent: [50],
  trailingTakePercent: [100],
  holdMinutes: [20],
  minIdeasAligned: [1],
  minAuthorTrack: [1],
  minAuthorHitRate: [0],
  profitLockPercent: [0],
  entryDelayMinutes: [0],
  minAuthorWilson: [0],
  authorMetric: ["close"],
};

test("SIM: the weight gate passes on the SUM of pair weights, not on any single author", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "sim-pairweight-exchange",
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

  addSimulatorSchema({
    simulatorName: "sim_pairweight_strict",
    exchangeName: "sim-pairweight-exchange",
    gridAxes: { ...AXES, minWeightAligned: [1.0] },
  });
  addSimulatorSchema({
    simulatorName: "sim_pairweight_soft",
    exchangeName: "sim-pairweight-exchange",
    gridAxes: { ...AXES, minWeightAligned: [0.5] },
  });

  const IDEAS = [idea(1, 0, "P"), idea(2, 30, "Q")];

  // W=1.0: только пара проходит — торгует один Q
  const strict = await Simulator.run({ symbol: "TESTUSDT", simulatorName: "sim_pairweight_strict", ideas: IDEAS });
  const strictTrades = strict.best.find(({ criterion }) => criterion === "sharpe").trades;
  if (strict.reports[0].trades !== 1 || strictTrades[0].ideaId !== 2) {
    fail(
      `W=1.0 must pass only the pair entry (Q), got ${strict.reports[0].trades} trades ` +
      `ids=${JSON.stringify(strictTrades.map(({ ideaId }) => ideaId))}`
    );
    return;
  }
  // P отсечён гейтом, не слотом
  if (strict.reports[0].skippedBusy !== 0) {
    fail(`P must be weight-gated, not absorbed: skippedBusy=${strict.reports[0].skippedBusy}`);
    return;
  }

  // контроль W=0.5: каждый проходит соло — 2 сделки
  const soft = await Simulator.run({ symbol: "TESTUSDT", simulatorName: "sim_pairweight_soft", ideas: IDEAS });
  if (soft.reports[0].trades !== 2) {
    fail(`W=0.5 must pass both solo entries, got ${soft.reports[0].trades}`);
    return;
  }

  pass("weight gate sums the pair: solo 0.667 < 1.0 gated, pair 1.333 >= 1.0 trades (Q only); control W=0.5 -> 2 trades");
});

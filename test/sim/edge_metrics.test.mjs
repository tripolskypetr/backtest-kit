import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Граничные случаи метрик и правила бана:
 *  1) Sortino без убыточных ДНЕЙ бесконечен (Infinity, как у
 *     profitFactor) при конечном положительном Sharpe — конечный
 *     сентинель вводил бы в заблуждение: реальные значения Sortino
 *     могут превышать любую константу;
 *  2) hitRate ровно на пороге: правило банит СТРОГО ниже порога,
 *     автор с точным 0.5 при пороге 0.5 остаётся допущенным, а
 *     автор с 0.25 — банится.
 */

const START = 1704067200000;
const MINUTE = 60_000;
const SPACING = 962; // 2 x 481: две идеи одного направления вне дедупа

const idea = (id, minute, direction, author) => ({
  id,
  ts: START + minute * MINUTE,
  symbol: "TESTUSDT",
  direction,
  author,
});

test("SIM: profitable series with no losing day yields infinite Sortino", async ({ pass, fail }) => {
  // пила из eternal_hold: всплеск +1% на минутах 2..61 каждого цикла
  const CYCLES = 10;
  const priceAt = (timestamp) => {
    const m = Math.floor((timestamp - START) / MINUTE);
    if (m < 0) return 1000;
    const base = 1000 * (1 + 1e-6 * m);
    const phase = m % 481;
    const cycle = Math.floor(m / 481);
    if (cycle < CYCLES && phase >= 2 && phase <= 61) {
      return base * 1.01;
    }
    return base;
  };
  addExchangeSchema({
    exchangeName: "sim-sortino-exchange",
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

  addSimulatorSchema({
    simulatorName: "sim_sortino",
    exchangeName: "sim-sortino-exchange",
    gridAxes: {
      hardStopPercent: [50],
      trailingTakePercent: [100],
      holdMinutes: [60],
      minIdeasAligned: [1],
      minAuthorTrack: [3],
      minAuthorHitRate: [0.5],
      minWeightAligned: [0],
      profitLockPercent: [0],
      minAuthorWilson: [0],
      authorMetric: ["close"],
    },
    callbacks: {},
  });

  const result = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_sortino",
    ideas: Array.from({ length: CYCLES }, (_, k) => idea(1 + k, k * 481, "LONG", "prophet")),
  });

  const [report] = result.reports;
  if (report.trades !== CYCLES || report.totalPnlPercent <= 0) {
    fail(`expected ${CYCLES} profitable trades, got ${report.trades} / ${report.totalPnlPercent}`);
    return;
  }
  if (report.sortino !== Number.POSITIVE_INFINITY) {
    fail(`no-losing-day series must have infinite Sortino, got ${report.sortino}`);
    return;
  }
  if (!(Number.isFinite(report.sharpe) && report.sharpe > 0)) {
    fail(`sharpe must stay finite and positive, got ${report.sharpe}`);
    return;
  }
  // кривая без просадки при положительном PnL: Calmar и recovery
  // бесконечны по той же конвенции, что profitFactor/sortino
  if (report.calmarRatio !== Number.POSITIVE_INFINITY || report.recoveryFactor !== Number.POSITIVE_INFINITY) {
    fail(`drawdown-free profitable curve must have infinite calmar/recovery, got ${report.calmarRatio}/${report.recoveryFactor}`);
    return;
  }

  pass(`sortino=Infinity, calmar=Infinity, recovery=Infinity with finite sharpe=${report.sharpe.toFixed(2)} on ${report.trades} clean trades`);
});

test("SIM: hitRate exactly at the threshold stays allowed — the ban is strictly below", async ({ pass, fail }) => {
  // дрейф вверх: LONG = hit, SHORT = miss
  const priceAt = (timestamp) => {
    const m = Math.floor((timestamp - START) / MINUTE);
    return m < 0 ? 1000 : 1000 * (1 + 1e-6 * m);
  };
  addExchangeSchema({
    exchangeName: "sim-boundary-exchange",
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

  addSimulatorSchema({
    simulatorName: "sim_boundary",
    exchangeName: "sim-boundary-exchange",
    gridAxes: {
      hardStopPercent: [50],
      trailingTakePercent: [100],
      holdMinutes: [60],
      minIdeasAligned: [1],
      minAuthorTrack: [4],
      minAuthorHitRate: [0.5],
      minWeightAligned: [0],
      profitLockPercent: [0],
      minAuthorWilson: [0],
      authorMetric: ["close"],
    },
    callbacks: {},
  });

  const result = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_boundary",
    ideas: [
      // coin: ровно 2 hit (LONG) + 2 miss (SHORT) = 0.5
      idea(1, 0, "LONG", "coin"),
      idea(2, SPACING, "LONG", "coin"),
      idea(3, 481, "SHORT", "coin"),
      idea(4, 481 + SPACING, "SHORT", "coin"),
      // quarter: 1 hit + 3 miss = 0.25
      idea(11, 100, "LONG", "quarter"),
      idea(12, 100 + 481, "SHORT", "quarter"),
      idea(13, 100 + 962, "SHORT", "quarter"),
      idea(14, 100 + 1443, "SHORT", "quarter"),
    ],
  });

  const stats = Object.fromEntries(result.best.find(({ criterion }) => criterion === "sharpe").authorStats.map((s) => [s.author, s]));
  if (stats.coin.hitRate !== 0.5 || stats.coin.ideas !== 4) {
    fail(`coin must have exactly 0.5 on 4 ideas, got ${JSON.stringify(stats.coin)}`);
    return;
  }
  if (stats.coin.banned) {
    fail(`hitRate == threshold must stay allowed (ban is strictly below), got banned`);
    return;
  }
  if (stats.quarter.hitRate !== 0.25 || !stats.quarter.banned) {
    fail(`quarter (0.25) must be banned, got ${JSON.stringify(stats.quarter)}`);
    return;
  }
  if (!result.best.find(({ criterion }) => criterion === "sharpe").allowedAuthors.includes("coin") || result.best.find(({ criterion }) => criterion === "sharpe").allowedAuthors.includes("quarter")) {
    fail(`whitelist must include coin and exclude quarter, got ${JSON.stringify(result.best.find(({ criterion }) => criterion === "sharpe").allowedAuthors)}`);
    return;
  }

  pass(`boundary: coin 2/4 = 0.50 allowed at threshold 0.5; quarter 1/4 = 0.25 banned`);
});

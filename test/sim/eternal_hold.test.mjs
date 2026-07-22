import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Синтетический мир "пила": после каждой идеи цена всплескивает на +1%
 * ровно на минуты 2..61 от публикации, затем возвращается к базе.
 * База имеет микроскопический дрейф вверх (+1e-4% в минуту), чтобы
 * 5-дневный исход каждой идеи был строго положителен (hit = true) и
 * автор проходил дефолт-бан фильтра.
 *
 * Идеи одного автора каждые SPACING = 481 минуту — ровно за порогом
 * антифлуда (480), так что дедуп ничего не режет.
 *
 * Точки сетки различаются ТОЛЬКО холдом: 60 минут против 7200
 * (вечный холд = кап горизонта идеи). Стоп и трейлинг отключены
 * сентинелями (H=50 недостижим на пиле, TT=100 никогда не
 * вооружается), поэтому выход — только по времени:
 *  - hold=60  выходит на минуте 60 внутри всплеска: ~ +1% на сделку;
 *  - hold=7200 выходит на фазе 466 следующего цикла (7200 mod 481 =
 *    466 — детерминированно во флэте): ~ +0.7% дрейфа минус издержки,
 *    и слот занят 5 суток — идеи k+1..k+14 поглощаются.
 *
 * Ожидание: time-based Sharpe и totalPnl обязаны предпочесть
 * короткий холд — метрика математически штрафует ожидание.
 */

const START = 1704067200000; // 2024-01-01T00:00:00Z, совпадает с data/simulator_1.jsonl
const MINUTE = 60_000;
const SPACING = 481;
const IDEAS_COUNT = 90;
const BASE_PRICE = 1000;
const DRIFT_PER_MINUTE = 1e-6; // +1e-4% в минуту
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

const makeIdeas = () =>
  Array.from({ length: IDEAS_COUNT }, (_, k) => ({
    id: 1000 + k,
    ts: START + k * SPACING * MINUTE,
    symbol: "TESTUSDT",
    direction: "LONG",
    author: "prophet",
  }));

const registerExchange = (exchangeName) => {
  addExchangeSchema({
    exchangeName,
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
};

const GRID_AXES = {
  hardStopPercent: [50],
  trailingTakePercent: [100],
  holdMinutes: [60, 7200],
  minIdeasAligned: [1],
  minAuthorTrack: [3],
  minAuthorHitRate: [0.5],
  minWeightAligned: [0],
  profitLockPercent: [0],
  authorMetric: ["close"],
};

test("SIM: time-based Sharpe punishes eternal hold in favor of normal entries", async ({ pass, fail }) => {
  registerExchange("sim-eternal-exchange");
  addSimulatorSchema({
    simulatorName: "sim_eternal",
    exchangeName: "sim-eternal-exchange",
    gridAxes: GRID_AXES,
    callbacks: {},
  });

  const result = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_eternal",
    ideas: makeIdeas(),
  });

  if (result.reports.length !== 2) {
    fail(`expected 2 grid points, got ${result.reports.length}`);
    return;
  }

  const short = result.reports.find(({ point }) => point.holdMinutes === 60);
  const eternal = result.reports.find(({ point }) => point.holdMinutes === 7200);
  if (!short || !eternal) {
    fail("short/eternal hold reports not found");
    return;
  }

  // автор должен пройти фильтр: 90 идей, все hit
  if (result.best.find(({ criterion }) => criterion === "sharpe").allowedAuthors.length !== 1 || result.best.find(({ criterion }) => criterion === "sharpe").allowedAuthors[0] !== "prophet") {
    fail(`expected prophet allowed, got ${JSON.stringify(result.best.find(({ criterion }) => criterion === "sharpe").allowedAuthors)}`);
    return;
  }

  // короткий холд торгует каждую идею, вечный — поглощает пачки
  if (short.trades < 80) {
    fail(`short hold expected ~90 trades, got ${short.trades}`);
    return;
  }
  if (eternal.trades > 10) {
    fail(`eternal hold expected ~6 trades, got ${eternal.trades}`);
    return;
  }

  // математический штраф за ожидание: и доходность, и Sharpe
  if (!(short.totalPnlPercent > eternal.totalPnlPercent)) {
    fail(`totalPnl: short=${short.totalPnlPercent.toFixed(2)} must beat eternal=${eternal.totalPnlPercent.toFixed(2)}`);
    return;
  }
  if (!(short.sharpe > eternal.sharpe)) {
    fail(`sharpe: short=${short.sharpe.toFixed(3)} must beat eternal=${eternal.sharpe.toFixed(3)}`);
    return;
  }

  // победители всех рейтингов — короткий холд (вечный ещё и не проходит
  // анти-флюк порог по числу сделок)
  for (const best of result.best) {
    if (!best.report || best.report.point.holdMinutes !== 60) {
      fail(`ranking ${best.criterion} must pick hold=60, got ${best.report?.point.holdMinutes}`);
      return;
    }
  }

  // хвостовые перцентили холда палят вечное сидение на уровне прогона
  if (result.p99HoldMinutes < 7200) {
    fail(`run-level p99HoldMinutes must expose the eternal hold cap, got ${result.p99HoldMinutes}`);
    return;
  }

  pass(
    `short: ${short.trades} trades, pnl=${short.totalPnlPercent.toFixed(2)}%, sharpe=${short.sharpe.toFixed(2)} | ` +
    `eternal: ${eternal.trades} trades, pnl=${eternal.totalPnlPercent.toFixed(2)}%, sharpe=${eternal.sharpe.toFixed(2)}`
  );
});

test("SIM: eternal hold absorbs foreign ideas and the accounting proves it", async ({ pass, fail }) => {
  registerExchange("sim-absorb-exchange");

  const tradesByHold = new Map();
  addSimulatorSchema({
    simulatorName: "sim_absorb",
    exchangeName: "sim-absorb-exchange",
    gridAxes: GRID_AXES,
    callbacks: {
      onGridPoint: (_symbol, report, trades) => {
        tradesByHold.set(report.point.holdMinutes, { report, trades });
      },
    },
  });

  await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_absorb",
    ideas: makeIdeas(),
  });

  const short = tradesByHold.get(60);
  const eternal = tradesByHold.get(7200);
  if (!short || !eternal) {
    fail("onGridPoint did not deliver both hold points");
    return;
  }

  // короткий холд успевает освободить слот до следующей идеи — ничего не съедает
  if (short.report.skippedBusy !== 0) {
    fail(`short hold must absorb nothing, skippedBusy=${short.report.skippedBusy}`);
    return;
  }

  // вечный холд съедает ~14 идей на сделку; учёт обязан это показать
  if (eternal.report.skippedBusy < 70) {
    fail(`eternal hold must absorb most ideas, skippedBusy=${eternal.report.skippedBusy}`);
    return;
  }
  const absorbed = eternal.trades.reduce((acc, t) => acc + t.absorbedIdeaIds.length, 0);
  if (absorbed !== eternal.report.skippedBusy) {
    fail(`absorbedIdeaIds total (${absorbed}) must equal skippedBusy (${eternal.report.skippedBusy})`);
    return;
  }
  const firstTrade = eternal.trades[0];
  if (!firstTrade || firstTrade.absorbedIdeaIds.length < 10) {
    fail(`first eternal trade must list absorbed ideas, got ${firstTrade?.absorbedIdeaIds.length}`);
    return;
  }

  // холды в отчёте точки соответствуют капам
  if (eternal.report.p99HoldMinutes !== 7200 || short.report.p99HoldMinutes !== 60) {
    fail(`p99 holds mismatch: short=${short.report.p99HoldMinutes}, eternal=${eternal.report.p99HoldMinutes}`);
    return;
  }

  pass(
    `eternal hold: ${eternal.report.trades} trades absorbed ${absorbed} ideas ` +
    `(first trade ate ${firstTrade.absorbedIdeaIds.length}); short hold absorbed 0`
  );
});

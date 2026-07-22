import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Метрика авторского hit'а — параметр правила бана (authorMetric):
 *  - "close": hit по знаку закрытия 5-дневного горизонта;
 *  - "reach": hit по собираемости замком — MFE дошла до уровня
 *    profitLockPercent, а худший откат ДО пика не достал хардстоп.
 *
 * Мир «спайкер»: каждая идея взлетает до +4% за полчаса и к
 * горизонту умирает в -3%. По close автор — тотальный лузер
 * (hitRate 0, бан), по reach — идеальный (hitRate 1, допуск), и
 * ровно на нём точка с замком зарабатывает: та самая ситуация, где
 * close-фильтр банит авторов, кормящих lock-механику.
 *
 * Сетка 2 точки (metric close|reach при одинаковых прочих осях):
 * close-точка не торгует вовсе, reach-точка снимает все 5 идей по
 * profit_lock. Победители всех рейтингов — reach-точка, и её
 * per-best артефакт несёт spiker в белом списке.
 */

const START = 1704067200000;
const MINUTE = 60_000;
const CYCLE = 481;

// фаза цикла: 0..1 база, 2..30 линейный взлёт к +4%,
// 31..200 линейный слив к -3%, дальше -3% до конца цикла
const factorAt = (phase) => {
  if (phase <= 1) return 1;
  if (phase <= 30) return 1 + (0.04 * (phase - 1)) / 29;
  if (phase <= 200) return 1.04 - (0.07 * (phase - 30)) / 170;
  return 0.97;
};

const priceAt = (timestamp) => {
  const m = Math.floor((timestamp - START) / MINUTE);
  if (m < 0) return 1000;
  return 1000 * (1 + 1e-6 * m) * factorAt(m % CYCLE);
};

const idea = (id, minute, direction, author) => ({
  id,
  ts: START + minute * MINUTE,
  symbol: "TESTUSDT",
  direction,
  author,
});

test("SIM: reach metric allows the spiker the close metric bans — and the lock point feeds on him", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "sim-metric-exchange",
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

  const trainedStats = [];
  const reportsByMetric = new Map();
  addSimulatorSchema({
    simulatorName: "sim_metric",
    exchangeName: "sim-metric-exchange",
    gridAxes: {
      hardStopPercent: [5],
      trailingTakePercent: [100],
      holdMinutes: [240],
      minIdeasAligned: [1],
      minAuthorTrack: [5],
      minAuthorHitRate: [0.5],
      minWeightAligned: [0],
      profitLockPercent: [2.5],
      entryDelayMinutes: [0],
      minAuthorWilson: [0],
      authorMetric: ["close", "reach"],
    },
    callbacks: {
      onAuthorsTrained: (_symbol, stats) => trainedStats.push(stats),
      onGridPoint: (_symbol, report, trades) => {
        reportsByMetric.set(report.point.authorMetric, { report, trades });
      },
    },
  });

  const result = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_metric",
    ideas: Array.from({ length: 5 }, (_, k) => idea(1 + k, k * CYCLE, "LONG", "spiker")),
  });

  if (result.reports.length !== 2 || reportsByMetric.size !== 2) {
    fail(`grid must have exactly 2 points (close|reach), got ${result.reports.length}`);
    return;
  }

  // фильтр обучен дважды — по разу на метрику, с разными hits
  if (trainedStats.length !== 2) {
    fail(`expected 2 filter trainings (one per metric), got ${trainedStats.length}`);
    return;
  }
  const hitCounts = trainedStats
    .map((stats) => stats.find(({ author }) => author === "spiker")?.hits)
    .sort((a, b) => a - b);
  if (hitCounts[0] !== 0 || hitCounts[1] !== 5) {
    fail(`spiker must be 0/5 hits by close and 5/5 by reach, got ${JSON.stringify(hitCounts)}`);
    return;
  }

  // close-точка: автор забанен (hitRate 0 < 0.5), сделок нет
  const closePoint = reportsByMetric.get("close");
  if (closePoint.report.trades !== 0) {
    fail(`close metric must ban the spiker: expected 0 trades, got ${closePoint.report.trades}`);
    return;
  }

  // reach-точка: автор допущен, все 5 идей сняты замком в плюс
  const reachPoint = reportsByMetric.get("reach");
  if (reachPoint.report.trades !== 5 || reachPoint.report.exitReasons.profit_lock !== 5) {
    fail(`reach metric must harvest all 5 ideas by profit_lock, got ${JSON.stringify(reachPoint.report.exitReasons)}`);
    return;
  }
  if (reachPoint.trades.some(({ pnlPercent }) => pnlPercent <= 0)) {
    fail(`every lock exit must be profitable, got ${JSON.stringify(reachPoint.trades.map(({ pnlPercent }) => +pnlPercent.toFixed(2)))}`);
    return;
  }

  // победители всех рейтингов — reach-точка, и её артефакт авторов
  // несёт spiker в белом списке ПОД ЕЁ метрику
  for (const b of result.best) {
    if (b.report?.point.authorMetric !== "reach") {
      fail(`${b.criterion} winner must be the reach point, got ${b.report?.point.authorMetric}`);
      return;
    }
    if (!b.allowedAuthors.includes("spiker") || b.bannedAuthors.includes("spiker")) {
      fail(`per-best artifact must allow spiker under reach, got ${JSON.stringify(b.allowedAuthors)}`);
      return;
    }
  }

  // ран-левел артефакт без привилегий: allowed = union по победителям
  // (все победители reach -> spiker допущен), banned = дополнение
  if (JSON.stringify(result.allowedAuthors) !== JSON.stringify(["spiker"]) || result.bannedAuthors.length !== 0) {
    fail(`run-level union artifact wrong: allowed=${JSON.stringify(result.allowedAuthors)} banned=${JSON.stringify(result.bannedAuthors)}`);
    return;
  }

  pass(
    `author metric splits the world: close bans spiker (0/5 hits, 0 trades), ` +
    `reach allows him (5/5 hits) and the lock point takes 5/5 profit_lock exits, ` +
    `pnl=${reachPoint.report.totalPnlPercent.toFixed(2)}%`
  );
});

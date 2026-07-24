import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Грейдинг в окне холда СВОЕЙ точки: одна сетка с двумя холдами
 * обязана судить одного и того же автора по-разному. Мир «спринтер»:
 * каждая идея даёт +2% и держит уровень два часа, к 5-му часу цена
 * сливается в -3% и стоит там до конца цикла.
 *
 *  - точка hold=120: close окна = +2% -> автор 5/5, допущен, 5 сделок;
 *  - точка hold=720: close окна = -3% -> автор 0/5, забанен, 0 сделок;
 *  - тренировки ДВЕ (окно входит в ключ правила), словари банов
 *    close-корзины самоидентифицируются полем holdMinutes.
 *
 * Профиль при этом один на идею (fetch = max(holdMinutes) = 720) —
 * различие только в окне арифметики.
 */

const START = 1704067200000;
const MINUTE = 60_000;
const CYCLE = 1440;

const priceAt = (timestamp) => {
  const m = Math.floor((timestamp - START) / MINUTE);
  if (m < 0) return 1000;
  const phase = m % CYCLE;
  if (phase < 2) return 1000;
  if (phase <= 120) return 1020;
  if (phase <= 300) return 1020 - (50 * (phase - 120)) / 180;
  return 970;
};

test("SIM: author metrics are graded inside each point's own hold window — two holds, two verdicts", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "sim-holdwindow-exchange",
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
  const pointReports = [];
  addSimulatorSchema({
    simulatorName: "sim_holdwindow",
    exchangeName: "sim-holdwindow-exchange",
    gridAxes: {
      hardStopPercent: [5],
      trailingTakePercent: [100],
      // два окна грейдинга в одной сетке — сердце теста
      holdMinutes: [120, 720],
      minAuthorTrack: [3],
      minAuthorHitRate: [0.5],
      profitLockPercent: [0],
      authorMetric: ["close"],
    },
    callbacks: {
      onAuthorsTrained: (_symbol, stats) => trained.push(stats),
      onGridPoint: (_symbol, report) => pointReports.push(report),
    },
  });

  const result = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_holdwindow",
    ideas: Array.from({ length: 5 }, (_, k) => ({
      id: 1 + k,
      ts: START + k * CYCLE * MINUTE,
      symbol: "TESTUSDT",
      direction: "LONG",
      author: "sprinter",
    })),
  });

  // окно — часть правила: два холда обязаны дать ДВЕ тренировки
  if (trained.length !== 2) {
    fail(`expected 2 trainings (one per hold window), got ${trained.length}`);
    return;
  }

  // словари банов самоидентифицируются окном
  const shortBan = result.reports.close.bans.find(({ holdMinutes }) => holdMinutes === 120);
  const longBan = result.reports.close.bans.find(({ holdMinutes }) => holdMinutes === 720);
  if (!shortBan || !longBan) {
    fail(`bans must carry holdMinutes 120 and 720, got ${JSON.stringify(result.reports.close.bans.map(({ holdMinutes }) => holdMinutes))}`);
    return;
  }
  const shortStat = shortBan.authorStats.find(({ author }) => author === "sprinter");
  const longStat = longBan.authorStats.find(({ author }) => author === "sprinter");
  // hold=120: close окна +2% — 5/5, допуск
  if (shortStat.hits !== 5 || shortStat.banned || !shortBan.allowedAuthors.includes("sprinter")) {
    fail(`120m window must credit the sprinter 5/5, got ${JSON.stringify(shortStat)}`);
    return;
  }
  // hold=720: close окна -3% — 0/5, бан
  if (longStat.hits !== 0 || !longStat.banned || !longBan.bannedAuthors.includes("sprinter")) {
    fail(`720m window must ban the sprinter 0/5, got ${JSON.stringify(longStat)}`);
    return;
  }

  // сделки следуют вердиктам своих окон: короткая точка торгует все
  // 5 идей, длинная — ни одной
  const shortPoint = pointReports.find(({ point }) => point.holdMinutes === 120);
  const longPoint = pointReports.find(({ point }) => point.holdMinutes === 720);
  if (shortPoint.trades !== 5 || longPoint.trades !== 0) {
    fail(`expected 5/0 trades for 120m/720m points, got ${shortPoint.trades}/${longPoint.trades}`);
    return;
  }

  pass(
    `hold-window grading: sprinter 5/5 allowed at 120m (+2% window close) and 0/5 banned at 720m ` +
    `(-3% window close); 2 trainings, bans self-identified by holdMinutes, trades 5 vs 0`
  );
});

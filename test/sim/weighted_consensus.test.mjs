import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Взвешенный консенсус улучшает прогноз там, где бинарный фильтр
 * бессилен: оба автора ДОПУЩЕНЫ правилом бана, но качество их трека
 * различается вдвое — и только вес это видит.
 *
 *  - sniper: 12/12 hit -> вес Лапласа (12+1)/(12+2) = 0.9286;
 *    его идеи ловят всплеск +1% (сделки прибыльны);
 *  - coin: 6/12 hit -> вес (6+1)/(12+2) = 0.5 — ровно на пороге бана
 *    (rate 0.5 проходит), его сделки во флэте убыточны на издержках.
 *
 * Точка W=0 (бинарная) обязана торговать обоих: 24 сделки, прибыль
 * снайпера разбавлена монетчиком. Точка W=0.7 пропускает только
 * окна с суммой весов >= 0.7: соло-идеи coin (0.5) отсечены,
 * соло-идеи sniper (0.93) торгуются. Ожидание: W=0.7 бьёт W=0
 * и по PnL, и по Sharpe, и выигрывает все рейтинги.
 */

const START = 1704067200000;
const MINUTE = 60_000;
const SPACING = 481;
const CYCLES = 12;

const priceAt = (timestamp) => {
  const m = Math.floor((timestamp - START) / MINUTE);
  if (m < 0) return 1000;
  const base = 1000 * (1 + 1e-6 * m);
  const phase = m % SPACING;
  const cycle = Math.floor(m / SPACING);
  // всплеск только в начале цикла — его ловят идеи sniper (фаза 0)
  if (cycle < CYCLES && phase >= 2 && phase <= 61) {
    return base * 1.01;
  }
  // памп +2% в окно шортов coin (фазы 253..312): его SHORT-сделки
  // реально убыточны (-2.4%), дневные корзины бинарной точки уходят
  // в минус — иначе убытки монетчика тонут рядом с победами снайпера
  // и обе точки упираются в Sortino-сентинель
  if (cycle < CYCLES && phase >= 253 && phase <= 312) {
    return base * 1.02;
  }
  return base;
};

test("SIM: weighted consensus filters the coin-flipper the binary rule lets through — and wins every ranking", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "sim-weight-exchange",
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
    simulatorName: "sim_weight",
    exchangeName: "sim-weight-exchange",
    gridAxes: {
      hardStopPercent: [50],
      trailingTakePercent: [100],
      holdMinutes: [60],
      minIdeasAligned: [1],
      minAuthorTrack: [3],
      minAuthorHitRate: [0.5],
      minWeightAligned: [0, 0.7],
      profitLockPercent: [0],
      entryDelayMinutes: [0],
      authorMetric: ["close"],
    },
    callbacks: {},
  });

  const ideas = [];
  for (let k = 0; k < CYCLES; k++) {
    // sniper: LONG на фазе 0 — вход м1, выход м60 внутри всплеска
    ideas.push({ id: 100 + k, ts: START + k * SPACING * MINUTE, symbol: "TESTUSDT", direction: "LONG", author: "sniper" });
    if (k % 2 === 0) {
      // coin LONG во флэте (фаза 320): 5-дневный дрейф -> hit
      ideas.push({ id: 200 + k, ts: START + (k * SPACING + 320) * MINUTE, symbol: "TESTUSDT", direction: "LONG", author: "coin" });
    } else {
      // coin SHORT во флэте (фаза 251): дрейф вверх -> miss
      ideas.push({ id: 300 + k, ts: START + (k * SPACING + 251) * MINUTE, symbol: "TESTUSDT", direction: "SHORT", author: "coin" });
    }
  }

  const result = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_weight",
    ideas,
  });

  // ключевая предпосылка: coin ДОПУЩЕН правилом бана (0.5 на пороге)
  const stats = Object.fromEntries(result.best.find(({ criterion }) => criterion === "sharpe").authorStats.map((s) => [s.author, s]));
  if (stats.coin?.banned !== false || stats.coin?.hitRate !== 0.5) {
    fail(`coin must be allowed with hitRate 0.5, got ${JSON.stringify(stats.coin)}`);
    return;
  }
  if (stats.sniper?.hitRate !== 1) {
    fail(`sniper must be 12/12, got ${JSON.stringify(stats.sniper)}`);
    return;
  }

  const binary = result.reports.find(({ point }) => point.minWeightAligned === 0);
  const weighted = result.reports.find(({ point }) => point.minWeightAligned === 0.7);
  if (!binary || !weighted) {
    fail("both weight points must be evaluated");
    return;
  }

  // бинарная точка разбавлена монетчиком, взвешенная торгует чистого снайпера
  if (binary.trades !== 24) {
    fail(`W=0 must trade both authors (24), got ${binary.trades}`);
    return;
  }
  if (weighted.trades !== 12) {
    fail(`W=0.7 must trade sniper only (12), got ${weighted.trades}`);
    return;
  }

  // улучшение прогноза: и доходность, и качество
  if (!(weighted.totalPnlPercent > binary.totalPnlPercent)) {
    fail(`weighted pnl ${weighted.totalPnlPercent.toFixed(2)} must beat binary ${binary.totalPnlPercent.toFixed(2)}`);
    return;
  }
  if (!(weighted.sharpe > binary.sharpe)) {
    fail(`weighted sharpe ${weighted.sharpe.toFixed(2)} must beat binary ${binary.sharpe.toFixed(2)}`);
    return;
  }
  for (const best of result.best) {
    if (!best.report || best.report.point.minWeightAligned !== 0.7) {
      fail(`${best.criterion} winner must be the weighted point, got W=${best.report?.point.minWeightAligned}`);
      return;
    }
  }

  pass(
    `weighted W=0.7: 12 trades, pnl=${weighted.totalPnlPercent.toFixed(2)}%, sharpe=${weighted.sharpe.toFixed(2)} beats ` +
    `binary W=0: 24 trades, pnl=${binary.totalPnlPercent.toFixed(2)}%, sharpe=${binary.sharpe.toFixed(2)}; all rankings pick weighted`
  );
});

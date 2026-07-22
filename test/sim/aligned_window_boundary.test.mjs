import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Точная граница окна консенсуса (ts - 240м, ts]: помощник, чей вход
 * РОВНО за 240 минут до входа кандидата, исключён из подсчёта
 * (ideaTs <= from), за 239 минут — включён. Гейт N=2 превращает эту
 * границу в наличие/отсутствие сделки:
 *  - кандидат-239: пара с помощником, сделка есть;
 *  - кандидат-240: помощник за границей, aligned=1 < 2, сделки нет.
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

test("SIM: the 240-minute consensus window boundary is exclusive on the far edge", async ({ pass, fail }) => {
  addExchangeSchema({
    exchangeName: "sim-window-exchange",
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
    simulatorName: "sim_window",
    exchangeName: "sim-window-exchange",
    gridAxes: {
      hardStopPercent: [50],
      trailingTakePercent: [100],
      holdMinutes: [10],
      minIdeasAligned: [2],
      minAuthorTrack: [1],
      minAuthorHitRate: [0],
      minWeightAligned: [0],
      profitLockPercent: [0],
      entryDelayMinutes: [0],
      authorMetric: ["close"],
    },
  });

  const IN_CANDIDATE = idea(2, 239, "inA");   // вход m240, from=m0: помощник (вход m1) ВНУТРИ
  const OUT_CANDIDATE = idea(4, 2240, "outA"); // вход m2241, from=m2001: помощник (вход m2001) РОВНО НА границе -> исключён
  const result = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_window",
    ideas: [
      idea(1, 0, "h1"),
      IN_CANDIDATE,
      idea(3, 2000, "h2"),
      OUT_CANDIDATE,
    ],
  });

  const [report] = result.reports;
  const trades = result.best.find(({ criterion }) => criterion === "sharpe").trades;

  // сделка ровно одна — кандидат-239; помощники соло не проходят N=2
  if (report.trades !== 1 || trades[0].ideaId !== IN_CANDIDATE.id) {
    fail(
      `expected exactly the 239-minute candidate to trade, got ${report.trades} trades ` +
      `ids=${JSON.stringify(trades.map(({ ideaId }) => ideaId))}`
    );
    return;
  }
  // кандидат-240 не поглощён слотом — он отсечён консенсус-гейтом
  if (report.skippedBusy !== 0) {
    fail(`240-minute candidate must be gated, not absorbed: skippedBusy=${report.skippedBusy}`);
    return;
  }

  pass("window boundary exact: helper at -239m counts (trade), helper exactly at -240m is excluded (no trade)");
});

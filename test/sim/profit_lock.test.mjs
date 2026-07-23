import { test } from "worker-testbed";

import { addExchangeSchema, addSimulatorSchema, Simulator } from "../../build/index.mjs";

/**
 * Пол прибыли (profitLockPercent): взводится при касании +X% от
 * входа, выход — только на откате к уровню X. Закрывает зону, где
 * трейлинг ещё не взведён (пик < entry/(1-r)) и профит стекал бы в
 * ноль; раннеры не режет — над замком трейлинг-пол выше и
 * исполняется первым.
 *
 *  1) Кровоточащая зона: рост до +2.5% и слив в минус. TT=3% не
 *     взведён (нужен пик +3.09%), пол X=2 ловит откат на +2% —
 *     формульная сверка pnl до 1e-9. Точка с lock=0 в той же сетке
 *     доезжает до time_expired с убытком — выключенный ноль честен.
 *  2) Хлебный раннер: рост до +20%, затем откат 4.2%. Пол взведён,
 *     но трейлинг-уровень (пик−3% = +16.4%) выше — выходит
 *     trailing_take, а не срез по +2%.
 */

const START = 1704067200000;
const MINUTE = 60_000;

const idea = (id, minute, direction, author) => ({
  id,
  ts: START + minute * MINUTE,
  symbol: "TESTUSDT",
  direction,
  author,
});

const registerWorld = (exchangeName, priceAt) => {
  addExchangeSchema({
    exchangeName,
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
};

test("SIM: profit lock catches the +2.5%-then-dump bleed the trailing take never arms for", async ({ pass, fail }) => {
  // рост 1000 -> 1025 (+2.5%) на минутах 2..30, затем слив на 980
  const priceAt = (timestamp) => {
    const m = Math.floor((timestamp - START) / MINUTE);
    if (m <= 1) return 1000;
    if (m <= 30) return 1000 + (25 * (m - 1)) / 29;
    return 980;
  };
  registerWorld("sim-lock-bleed-exchange", priceAt);

  const tradesByLock = new Map();
  addSimulatorSchema({
    simulatorName: "sim_lock_bleed",
    exchangeName: "sim-lock-bleed-exchange",
    gridAxes: {
      hardStopPercent: [5],
      trailingTakePercent: [3],
      holdMinutes: [240],
      minAuthorTrack: [1],
      minAuthorHitRate: [0],
      profitLockPercent: [0, 2],
      authorMetric: ["close"],
    },
    callbacks: {
      onGridPoint: (_symbol, report, trades) => {
        tradesByLock.set(report.point.profitLockPercent, { report, trades });
      },
    },
  });

  const result = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_lock_bleed",
    ideas: [idea(1, 0, "LONG", "bleeder")],
  });

  const locked = tradesByLock.get(2);
  const bare = tradesByLock.get(0);
  if (!locked || !bare || locked.report.trades !== 1 || bare.report.trades !== 1) {
    fail(`both grid points must trade once, got ${JSON.stringify([...tradesByLock.keys()])}`);
    return;
  }

  // пол ловит откат к +2%: формульная сверка честного филла
  const [lockTrade] = locked.trades;
  if (lockTrade.exitReason !== "profit_lock") {
    fail(`lock=2 must exit by profit_lock, got ${lockTrade.exitReason}`);
    return;
  }
  const entryFill = 1000 * 1.001;
  const lockLevel = entryFill * 1.02;
  const exitFill = lockLevel * 0.999;
  const expectedPnl = ((exitFill - entryFill) / entryFill) * 100 - 0.2;
  if (Math.abs(lockTrade.pnlPercent - expectedPnl) > 1e-9) {
    fail(`profit_lock pnl mismatch: expected ${expectedPnl}, got ${lockTrade.pnlPercent}`);
    return;
  }
  if (locked.report.exitReasons.profit_lock !== 1) {
    fail(`exitReasons must count profit_lock, got ${JSON.stringify(locked.report.exitReasons)}`);
    return;
  }

  // lock=0 честно выключен: трейлинг не взведён (пик +2.5% < +3.09%),
  // позиция доезжает до time_expired в минусе — кровь без пола видна
  const [bareTrade] = bare.trades;
  if (bareTrade.exitReason !== "time_expired" || bareTrade.pnlPercent >= 0) {
    fail(`lock=0 must bleed to time_expired loss, got ${bareTrade.exitReason} ${bareTrade.pnlPercent}`);
    return;
  }
  if (lockTrade.pnlPercent <= bareTrade.pnlPercent) {
    fail(`lock must beat the bleed: ${lockTrade.pnlPercent} vs ${bareTrade.pnlPercent}`);
    return;
  }
  if (Object.values(result.reports).flatMap((b) => b.reports).length !== 2) {
    fail(`grid must have exactly 2 points, got ${Object.values(result.reports).flatMap((b) => b.reports).length}`);
    return;
  }

  pass(
    `bleed zone: lock=2 exits profit_lock at +${lockTrade.pnlPercent.toFixed(4)}% (formula exact), ` +
    `lock=0 bleeds to ${bareTrade.pnlPercent.toFixed(4)}% time_expired`
  );
});

test("SIM: profit lock never cuts a runner — the trailing floor above it fills first", async ({ pass, fail }) => {
  // рост 1000 -> 1200 (+20%) на минутах 2..100, затем откат на 1150
  const priceAt = (timestamp) => {
    const m = Math.floor((timestamp - START) / MINUTE);
    if (m <= 1) return 1000;
    if (m <= 100) return 1000 + (200 * (m - 1)) / 99;
    return 1150;
  };
  registerWorld("sim-lock-runner-exchange", priceAt);

  addSimulatorSchema({
    simulatorName: "sim_lock_runner",
    exchangeName: "sim-lock-runner-exchange",
    gridAxes: {
      hardStopPercent: [5],
      trailingTakePercent: [3],
      holdMinutes: [240],
      minAuthorTrack: [1],
      minAuthorHitRate: [0],
      profitLockPercent: [2],
      authorMetric: ["close"],
    },
    callbacks: {},
  });

  const result = await Simulator.run({
    symbol: "TESTUSDT",
    simulatorName: "sim_lock_runner",
    ideas: [idea(1, 0, "LONG", "runner")],
  });

  const [report] = Object.values(result.reports).flatMap((b) => b.reports);
  const winner = result.reports.close.best.find(({ criterion }) => criterion === "sharpe");
  const [trade] = winner.trades;
  if (report.trades !== 1 || !trade) {
    fail(`expected exactly one trade, got ${report.trades}`);
    return;
  }
  // выход по трейлингу от пика +20%, а не срез по замку +2%
  if (trade.exitReason !== "trailing_take") {
    fail(`runner must exit by trailing_take, got ${trade.exitReason}`);
    return;
  }
  if (trade.pnlPercent <= 10) {
    fail(`runner pnl must stay double-digit, got ${trade.pnlPercent}`);
    return;
  }
  // формульная сверка: пол трейлинга = пик 1200 * 0.97
  const entryFill = 1000 * 1.001;
  const trailLevel = 1200 * 0.97;
  const exitFill = trailLevel * 0.999;
  const expectedPnl = ((exitFill - entryFill) / entryFill) * 100 - 0.2;
  if (Math.abs(trade.pnlPercent - expectedPnl) > 1e-9) {
    fail(`trailing pnl mismatch: expected ${expectedPnl}, got ${trade.pnlPercent}`);
    return;
  }
  if (report.exitReasons.profit_lock !== 0 || report.exitReasons.trailing_take !== 1) {
    fail(`exit reasons must be pure trailing, got ${JSON.stringify(report.exitReasons)}`);
    return;
  }

  pass(`runner preserved: +20% peak exits trailing_take at +${trade.pnlPercent.toFixed(2)}% (formula exact), lock untouched`);
});

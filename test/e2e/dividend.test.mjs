import { test } from "worker-testbed";
import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  commitDividendAdd,
  commitDividendRemove,
  getPositionAccruals,
  listenStrategyCommit,
  toProfitLossDto,
} from "../../build/index.mjs";

const MIN = 60_000;
const BASE = 50_000;

const alignTimestamp = (ts, intervalMinutes) => {
  const ms = intervalMinutes * MIN;
  return Math.floor(ts / ms) * ms;
};

const addFlatExchange = (exchangeName) => {
  addExchangeSchema({
    exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const start = alignTimestamp(since.getTime(), 1);
      const out = [];
      for (let i = 0; i < limit; i++) {
        out.push({ timestamp: start + i * MIN, open: BASE, high: BASE, low: BASE, close: BASE, volume: 100 });
      }
      return out;
    },
    formatPrice: async (_s, p) => p.toFixed(8),
    formatQuantity: async (_s, q) => q.toFixed(8),
  });
};

test("DIVIDEND: cash and asset accruals reach the closed PNL, removal drops its value", async ({ pass, fail }) => {
  const start = new Date("2024-01-01T00:00:00Z").getTime();
  addFlatExchange("binance-dividend-e2e");

  const commits = [];
  const unCommit = listenStrategyCommit((event) => {
    if (event.action === "dividend-add" || event.action === "dividend-remove") commits.push(event);
  });

  let issued = false;
  let pings = 0;
  let addedDuplicate = null;
  let removedUnknown = null;
  let accrualsSeen = null;
  addStrategySchema({
    strategyName: "test-strategy-dividend-e2e",
    interval: "1m",
    getSignal: async () => {
      if (issued) return null;
      issued = true;
      return { position: "long", priceTakeProfit: BASE * 2, priceStopLoss: BASE / 2, minuteEstimatedTime: 30 };
    },
    callbacks: {
      onActivePing: async (symbol) => {
        pings += 1;
        if (pings === 2) {
          await commitDividendAdd(symbol, { amount: 5, id: "div-q3", note: "Q3 dividend" }); // cash
          await commitDividendAdd(symbol, { amount: 0.001, type: "asset", id: "stake-1" }); // 0.001 × 50000 = 50
          await commitDividendAdd(symbol, { amount: 100, id: "to-be-removed" });
          addedDuplicate = await commitDividendAdd(symbol, { amount: 1, id: "div-q3" }); // duplicate id -> false
        }
        if (pings === 5) {
          await commitDividendRemove(symbol, "to-be-removed");
          removedUnknown = await commitDividendRemove(symbol, "nope"); // unknown id -> false
          accrualsSeen = await getPositionAccruals(symbol);
        }
      },
    },
  });

  addFrameSchema({
    frameName: "dividend-e2e-frame",
    interval: "1m",
    startDate: new Date(start),
    endDate: new Date(start + 120 * MIN),
  });

  const closed = [];
  for await (const result of Backtest.run("BTCUSDT", {
    strategyName: "test-strategy-dividend-e2e",
    exchangeName: "binance-dividend-e2e",
    frameName: "dividend-e2e-frame",
  })) {
    if (result.action === "closed") closed.push(result);
  }
  unCommit();

  if (closed.length !== 1) return fail(`expected one closed result, got ${closed.length}`);
  const [result] = closed;
  const { pnl, signal } = result;

  if (addedDuplicate !== false) return fail(`duplicate accrual id must return false, got ${addedDuplicate}`);
  if (removedUnknown !== false) return fail(`removing an unknown id must return false, got ${removedUnknown}`);

  if (!Array.isArray(accrualsSeen) || accrualsSeen.length !== 2) return fail(`getPositionAccruals after removal must list 2 accruals, got ${JSON.stringify(accrualsSeen)}`);
  if (!Array.isArray(signal.accruals) || signal.accruals.length !== 2) return fail(`closed signal must expose 2 accruals, got ${JSON.stringify(signal.accruals)}`);
  const ids = signal.accruals.map((a) => a.id).sort();
  if (ids.join(",") !== "div-q3,stake-1") return fail(`unexpected accrual ids: ${ids}`);
  if (signal.accruals.find((a) => a.id === "div-q3").note !== "Q3 dividend") return fail("note must be stored on the accrual");

  // cash 5 + asset 0.001 × 50000 (flat market) = 55; the removed $100 must be gone
  if (Math.abs(pnl.pnlDividends - 55) > 1e-9) return fail(`pnlDividends must be 55, got ${pnl.pnlDividends}`);
  const recomputed = toProfitLossDto(signal, result.currentPrice);
  if (Math.abs(recomputed.pnlCost - pnl.pnlCost) > 1e-9) return fail("toProfitLossDto on the public row must reproduce the closed pnl");
  if (Math.abs(pnl.pnlCost - (pnl.pnlPercentage / 100) * pnl.pnlEntries) > 1e-9) return fail("pnlCost/pnlPercentage consistency broken");
  const pricePnl = pnl.pnlCost - pnl.pnlDividends;
  if (!(pricePnl < 0 && pnl.pnlCost > 0)) return fail(`flat market: price pnl must be negative (fees) and total positive thanks to accruals, got price=${pricePnl} total=${pnl.pnlCost}`);

  const actions = commits.map((c) => c.action);
  if (actions.filter((a) => a === "dividend-add").length !== 3 || actions.filter((a) => a === "dividend-remove").length !== 1) {
    return fail(`expected 3 dividend-add and 1 dividend-remove commits, got ${JSON.stringify(actions)}`);
  }
  const removeCommit = commits.find((c) => c.action === "dividend-remove");
  if (removeCommit.accrualId !== "to-be-removed" || removeCommit.amount !== 100 || removeCommit.totalAccruals !== 2) {
    return fail(`dividend-remove commit payload wrong: ${JSON.stringify({ id: removeCommit.accrualId, amount: removeCommit.amount, total: removeCommit.totalAccruals })}`);
  }
  if (Math.abs(removeCommit.pnlDividends - 55) > 1e-9) return fail(`dividend-remove commit must carry pnlDividends 55, got ${removeCommit.pnlDividends}`);
  if (removeCommit.signalId !== signal.id) return fail("commit must reference the position");

  pass(`closed with pnlDividends=55 (cash 5 + asset 50), $100 accrual removed, 3 add + 1 remove commits, pnlCost=${pnl.pnlCost.toFixed(4)}`);
});

test("DIVIDEND: commitDividendAdd is rejected without a pending signal and for invalid amounts", async ({ pass, fail }) => {
  const start = new Date("2024-02-01T00:00:00Z").getTime();
  addFlatExchange("binance-dividend-e2e-invalid");

  let issued = false;
  let pings = 0;
  const results = {};
  addStrategySchema({
    strategyName: "test-strategy-dividend-e2e-invalid",
    interval: "1m",
    getSignal: async () => {
      if (issued) return null;
      issued = true;
      return { position: "short", priceTakeProfit: BASE / 2, priceStopLoss: BASE * 2, minuteEstimatedTime: 10 };
    },
    callbacks: {
      onActivePing: async (symbol) => {
        pings += 1;
        if (pings !== 1) return;
        results.zero = await commitDividendAdd(symbol, { amount: 0 });
        results.negative = await commitDividendAdd(symbol, { amount: -1 });
        results.nan = await commitDividendAdd(symbol, { amount: NaN });
        results.badType = await commitDividendAdd(symbol, { amount: 1, type: "bonus" });
        results.ok = await commitDividendAdd(symbol, { amount: 1 });
      },
      onIdle: async (symbol) => {
        if (results.idle === undefined) results.idle = await commitDividendAdd(symbol, { amount: 1 });
      },
    },
  });

  addFrameSchema({
    frameName: "dividend-e2e-invalid-frame",
    interval: "1m",
    startDate: new Date(start),
    endDate: new Date(start + 40 * MIN),
  });

  const closed = [];
  for await (const result of Backtest.run("BTCUSDT", {
    strategyName: "test-strategy-dividend-e2e-invalid",
    exchangeName: "binance-dividend-e2e-invalid",
    frameName: "dividend-e2e-invalid-frame",
  })) {
    if (result.action === "closed") closed.push(result);
  }

  if (results.zero !== false || results.negative !== false || results.nan !== false) return fail(`non-positive / NaN amounts must be rejected: ${JSON.stringify(results)}`);
  if (results.badType !== false) return fail("unknown type must be rejected");
  if (results.ok !== true) return fail("a valid accrual must be accepted");
  if (results.idle !== false) return fail(`without a pending signal commitDividendAdd must return false, got ${results.idle}`);
  if (closed.length !== 1 || Math.abs(closed[0].pnl.pnlDividends - 1) > 1e-9) return fail(`only the valid $1 accrual must survive, got ${closed.length ? closed[0].pnl.pnlDividends : "no close"}`);
  pass("invalid amounts/type and no-position calls rejected; SHORT position records the valid accrual");
});

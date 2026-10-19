import { test } from "worker-testbed";
import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  commitDividend,
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

test("DIVIDEND: signed cash and asset accruals net into the closed PNL", async ({ pass, fail }) => {
  const start = new Date("2024-01-01T00:00:00Z").getTime();
  addFlatExchange("binance-dividend-e2e");

  const commits = [];
  const unCommit = listenStrategyCommit((event) => {
    if (event.action === "dividend") commits.push(event);
  });

  let issued = false;
  let pings = 0;
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
          await commitDividend(symbol, { amount: 5, note: "Q3 dividend" }); // cash
          await commitDividend(symbol, { amount: 0.001, type: "asset", note: "staking reward" }); // 0.001 × 50000 = 50
          await commitDividend(symbol, { amount: 100, note: "advance" });
        }
        if (pings === 5) {
          await commitDividend(symbol, { amount: -100, note: "advance cash-out" }); // charge: nets the advance out
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

  if (!Array.isArray(accrualsSeen) || accrualsSeen.length !== 4) return fail(`getPositionAccruals must list 4 accruals, got ${JSON.stringify(accrualsSeen)}`);
  if (!Array.isArray(signal.accruals) || signal.accruals.length !== 4) return fail(`closed signal must expose 4 accruals, got ${JSON.stringify(signal.accruals)}`);
  if (signal.accruals.some((a) => "id" in a)) return fail("accruals must not carry an id");
  const notes = signal.accruals.map((a) => a.note).sort();
  if (notes.join(",") !== "Q3 dividend,advance,advance cash-out,staking reward") return fail(`unexpected accrual notes: ${notes}`);
  const charge = signal.accruals.find((a) => a.note === "advance cash-out");
  if (charge.type !== "cash" || charge.amount !== -100) return fail(`the charge must be stored as cash -100, got ${JSON.stringify(charge)}`);

  // cash 5 + asset 0.001 × 50000 (flat market) + 100 − 100 = 55
  if (Math.abs(pnl.pnlDividends - 55) > 1e-9) return fail(`pnlDividends must be 55, got ${pnl.pnlDividends}`);
  const recomputed = toProfitLossDto(signal, result.currentPrice);
  if (Math.abs(recomputed.pnlCost - pnl.pnlCost) > 1e-9) return fail("toProfitLossDto on the public row must reproduce the closed pnl");
  if (Math.abs(pnl.pnlCost - (pnl.pnlPercentage / 100) * pnl.pnlEntries) > 1e-9) return fail("pnlCost/pnlPercentage consistency broken");
  const pricePnl = pnl.pnlCost - pnl.pnlDividends;
  if (!(pricePnl < 0 && pnl.pnlCost > 0)) return fail(`flat market: price pnl must be negative (fees) and total positive thanks to accruals, got price=${pricePnl} total=${pnl.pnlCost}`);

  if (commits.length !== 4 || commits.some((c) => c.action !== "dividend")) {
    return fail(`expected 4 dividend commits, got ${JSON.stringify(commits.map((c) => c.action))}`);
  }
  const chargeCommit = commits[3];
  if (chargeCommit.accrualType !== "cash" || chargeCommit.amount !== -100 || chargeCommit.totalAccruals !== 4) {
    return fail(`charge commit payload wrong: ${JSON.stringify({ type: chargeCommit.accrualType, amount: chargeCommit.amount, total: chargeCommit.totalAccruals })}`);
  }
  if ("accrualId" in chargeCommit) return fail("commit must not carry an accrual id");
  if (Math.abs(chargeCommit.pnlDividends - 55) > 1e-9) return fail(`charge commit must carry pnlDividends 55, got ${chargeCommit.pnlDividends}`);
  if (chargeCommit.signalId !== signal.id) return fail("commit must reference the position");

  pass(`closed with pnlDividends=55 (cash 5 + asset 50 + 100 − 100), 4 dividend commits, pnlCost=${pnl.pnlCost.toFixed(4)}`);
});

test("DIVIDEND: commitDividend rejects zero / NaN / unknown type and no-position calls, accepts a negative amount (SHORT pays)", async ({ pass, fail }) => {
  const start = new Date("2024-02-01T00:00:00Z").getTime();
  addFlatExchange("binance-dividend-e2e-invalid");

  let issued = false;
  const results = {};
  addStrategySchema({
    strategyName: "test-strategy-dividend-e2e-invalid",
    interval: "1m",
    getSignal: async () => {
      if (issued) return null;
      issued = true;
      return { position: "short", priceTakeProfit: BASE / 2, priceStopLoss: BASE * 2, minuteEstimatedTime: 20 };
    },
    callbacks: {
      onActivePing: async (symbol) => {
        if (results.zero !== undefined) return;
        results.zero = await commitDividend(symbol, { amount: 0 });
        results.negative = await commitDividend(symbol, { amount: -2, note: "dividend owed on the short" });
        results.nan = await commitDividend(symbol, { amount: NaN });
        results.infinite = await commitDividend(symbol, { amount: Infinity });
        results.badType = await commitDividend(symbol, { amount: 1, type: "bonus" });
        results.ok = await commitDividend(symbol, { amount: 1 });
      },
      onIdle: async (symbol) => {
        if (results.idle === undefined) results.idle = await commitDividend(symbol, { amount: 1 });
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

  if (results.zero !== false || results.nan !== false || results.infinite !== false) return fail(`zero / NaN / Infinity amounts must be rejected: ${JSON.stringify(results)}`);
  if (results.badType !== false) return fail("unknown type must be rejected");
  if (results.negative !== true) return fail(`a negative amount must be accepted, got ${results.negative}`);
  if (results.ok !== true) return fail("a valid accrual must be accepted");
  if (results.idle !== false) return fail(`without a pending signal commitDividend must return false, got ${results.idle}`);
  // −2 (owed) + 1 = −1 on the SHORT position
  if (closed.length !== 1 || Math.abs(closed[0].pnl.pnlDividends - -1) > 1e-9) return fail(`pnlDividends must net to -1, got ${closed.length ? closed[0].pnl.pnlDividends : "no close"}`);
  pass("zero / NaN / Infinity / unknown type / no-position rejected; SHORT position nets -2 + 1 = -1 pnlDividends");
});

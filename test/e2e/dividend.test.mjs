import { test } from "worker-testbed";
import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  commitDividend,
  getPositionAccruals,
  listenStrategyCommit,
  ReportWriter,
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
  // flat market: every accrual is stamped with the VWAP price of its commit (BASE)
  if (signal.accruals.some((a) => a.currentPrice !== BASE)) return fail(`accruals must record the commit price ${BASE}, got ${JSON.stringify(signal.accruals.map((a) => a.currentPrice))}`);

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

test("DIVIDEND: the closed row of the backtest report carries accruals / entries / partials and pnlDividends", async ({ pass, fail }) => {
  const start = new Date("2024-03-01T00:00:00Z").getTime();
  addFlatExchange("binance-dividend-e2e-report");

  // capture everything the report writer is asked to persist (no files)
  const rows = [];
  ReportWriter.useReportAdapter(class {
    constructor(reportName) { this.reportName = reportName; }
    async waitForInit() {}
    // strategy.jsonl keeps strategyName in the dump options, backtest.jsonl inside the row
    async write(data, options) { rows.push({ reportName: this.reportName, data, strategyName: options?.strategyName ?? data.strategyName }); }
  });

  let issued = false;
  let pings = 0;
  addStrategySchema({
    strategyName: "test-strategy-dividend-e2e-report",
    interval: "1m",
    getSignal: async () => {
      if (issued) return null;
      issued = true;
      return { position: "long", priceTakeProfit: BASE * 2, priceStopLoss: BASE / 2, minuteEstimatedTime: 20 };
    },
    callbacks: {
      onActivePing: async (symbol) => {
        pings += 1;
        if (pings === 2) await commitDividend(symbol, { amount: 3, note: "Q1" });
        if (pings === 4) await commitDividend(symbol, { amount: 0.001, type: "asset", note: "epoch" });
      },
    },
  });

  addFrameSchema({
    frameName: "dividend-e2e-report-frame",
    interval: "1m",
    startDate: new Date(start),
    endDate: new Date(start + 40 * MIN),
  });

  try {
    for await (const _ of Backtest.run("BTCUSDT", {
      strategyName: "test-strategy-dividend-e2e-report",
      exchangeName: "binance-dividend-e2e-report",
      frameName: "dividend-e2e-report-frame",
    })) { /* drain */ }
  } finally {
    ReportWriter.useDummy();
  }

  const closed = rows.filter((r) => r.reportName === "backtest" && r.data.action === "closed" && r.strategyName === "test-strategy-dividend-e2e-report");
  if (closed.length !== 1) return fail(`expected one closed backtest report row, got ${closed.length} (reports seen: ${[...new Set(rows.map((r) => r.reportName))].join(",")})`);
  const row = closed[0].data;
  if (!Array.isArray(row.accruals) || row.accruals.length !== 2) return fail(`closed row must carry 2 accruals, got ${JSON.stringify(row.accruals)}`);
  if (row.accruals[0].note !== "Q1" || row.accruals[1].type !== "asset" || row.accruals[1].currentPrice !== BASE) return fail(`accrual rows wrong: ${JSON.stringify(row.accruals)}`);
  if (!Array.isArray(row.entries) || row.entries.length !== 1 || !Array.isArray(row.partials) || row.partials.length !== 0) return fail(`entries/partials wrong: ${JSON.stringify({ entries: row.entries, partials: row.partials })}`);
  // cash 3 + asset 0.001 × 50000 = 53
  if (Math.abs(row.pnlDividends - 53) > 1e-9 || Math.abs(row.pnl.pnlDividends - 53) > 1e-9) return fail(`pnlDividends must be 53 on the row and inside pnl, got ${row.pnlDividends} / ${row.pnl.pnlDividends}`);
  const strategyRows = rows.filter((r) => r.reportName === "strategy" && r.data.action === "dividend" && r.strategyName === "test-strategy-dividend-e2e-report");
  if (strategyRows.length !== 2 || !Array.isArray(strategyRows[1].data.accruals) || strategyRows[1].data.accruals.length !== 2) return fail(`strategy report dividend rows must carry the accrual list: ${JSON.stringify(strategyRows.map((r) => r.data.accruals))}; seen: ${JSON.stringify([...new Set(rows.filter((r) => r.strategyName === "test-strategy-dividend-e2e-report").map((r) => `${r.reportName}/${r.data.action}`))])}`);
  pass("backtest.jsonl closed row: accruals[2] (notes, commit price), entries[1], partials[0], pnlDividends=53; strategy.jsonl dividend rows carry accruals too");
});

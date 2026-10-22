import { test } from "worker-testbed";

import {
  Budget,
  BudgetBacktest,
  BudgetLive,
  BudgetRejectedError,
  BudgetMissingError,
  PersistBudgetAdapter,
  ExecutionContextService,
  MethodContextService,
  ReportWriter,
  Markdown,
  listenBudget,
  getConfig,
} from "../../build/index.mjs";

// Budget contract (PLAN.md stages 1–2): one journal per
// (strategyName, exchangeName, frameName, backtest) + name, read at the
// caller's logical time, written by insertion at the action's timestamp.

const METHOD = { strategyName: "budget-strategy", exchangeName: "budget-exchange", frameName: "budget-frame" };

const T0 = new Date("2024-06-01T00:00:00Z").getTime();
const MIN = 60_000;
const at = (minutes) => new Date(T0 + minutes * MIN);

/** Runs `fn` as the strategy module would see it: execution + method context */
const inContext = (symbol, when, fn, { backtest = true, method = METHOD } = {}) =>
  MethodContextService.runInContext(
    () => ExecutionContextService.runInContext(fn, { symbol, when, backtest }),
    method,
  );

const expectRejected = async (fn) => {
  try {
    await fn();
  } catch (error) {
    if (BudgetRejectedError.isBudgetRejectedError(error)) return error;
    throw error;
  }
  return null;
};

// ---------------------------------------------------------------------------
// Stage 1
// ---------------------------------------------------------------------------
test("budget: single symbol reserve/release/deposit/withdraw with ordered history", async ({ pass, fail }) => {
  Budget.enable();
  const fund = new Budget({ name: "fund", initialCapital: 1000 });

  const afterReserve = await inContext("BTCUSDT", at(1), () => fund.reserve({ id: "sig-1", amount: 400, note: "entry" }));
  if (afterReserve.capital !== 1000 || afterReserve.deployed !== 400 || afterReserve.free !== 600) {
    return fail(`after reserve expected 1000/400/600, got ${JSON.stringify(afterReserve)}`);
  }
  const free = await inContext("BTCUSDT", at(2), () => fund.getFree());
  if (free !== 600) return fail(`getFree expected 600, got ${free}`);

  const afterRelease = await inContext("BTCUSDT", at(3), () => fund.release({ id: "sig-1", pnl: 50, note: "tp" }));
  if (afterRelease.capital !== 1050 || afterRelease.deployed !== 0 || afterRelease.free !== 1050) {
    return fail(`after release expected 1050/0/1050, got ${JSON.stringify(afterRelease)}`);
  }

  const repeated = await inContext("BTCUSDT", at(4), () => fund.release({ id: "sig-1", pnl: 999 }));
  if (repeated.capital !== 1050) return fail(`repeated release must be a no-op, got capital ${repeated.capital}`);

  const afterDeposit = await inContext("BTCUSDT", at(5), () => fund.deposit({ asset: "ETH", amount: 2.5, note: "staking" }));
  if (afterDeposit.assets.ETH !== 2.5) return fail(`deposit expected ETH 2.5, got ${JSON.stringify(afterDeposit.assets)}`);

  const afterWithdraw = await inContext("BTCUSDT", at(6), () => fund.withdraw({ asset: "ETH", amount: 1 }));
  if (afterWithdraw.assets.ETH !== 1.5) return fail(`withdraw expected ETH 1.5, got ${JSON.stringify(afterWithdraw.assets)}`);

  const rejected = await expectRejected(() => inContext("BTCUSDT", at(7), () => fund.withdraw({ asset: "ETH", amount: 5 })));
  if (!rejected) return fail("withdraw above held amount must throw BudgetRejectedError");

  const tooMuch = await expectRejected(() => inContext("BTCUSDT", at(8), () => fund.reserve({ id: "sig-2", amount: 5000 })));
  if (!tooMuch) return fail("reserve above free must throw BudgetRejectedError");

  const history = await inContext("BTCUSDT", at(9), () => fund.getHistory());
  const types = history.map((row) => row.type);
  const expected = ["reserve", "release", "deposit", "withdraw", "reject", "reject"];
  if (JSON.stringify(types) !== JSON.stringify(expected)) {
    return fail(`history types expected ${expected.join(",")}, got ${types.join(",")}`);
  }
  for (let i = 1; i < history.length; i++) {
    if (history[i].timestamp < history[i - 1].timestamp) return fail("history must be ascending by timestamp");
  }
  if (history[0].note !== "entry" || history[1].note !== "tp" || history[2].note !== "staking") {
    return fail("notes must be stored on rows");
  }
  if (history[1].amount !== 400) return fail(`release row must carry the reserved amount, got ${history[1].amount}`);
  if (history[4].action !== "withdraw" || history[4].asset !== "ETH" || history[4].requested !== 5 || history[4].available !== 1.5) {
    return fail(`withdraw reject row wrong: ${JSON.stringify(history[4])}`);
  }
  if (history[5].action !== "reserve" || history[5].requested !== 5000 || history[5].available !== 1050) {
    return fail(`reserve reject row wrong: ${JSON.stringify(history[5])}`);
  }
  if (history.some((row) => row.symbol !== "BTCUSDT")) return fail("every row must carry the authoring symbol");
  if (history[5].balance.free !== 1050) return fail("reject row must leave the balance unchanged");

  const balance = await inContext("BTCUSDT", at(9), () => fund.getBalance());
  if (balance.name !== "fund" || balance.when.getTime() !== at(9).getTime()) return fail("getBalance must carry name and when");
  pass();
});

test("budget: a read at an earlier when does not see later rows", async ({ pass, fail }) => {
  Budget.enable();
  const fund = new Budget({ name: "fund", initialCapital: 1000 });

  await inContext("BTCUSDT", at(10), () => fund.reserve({ id: "late", amount: 700 }));

  const freeBefore = await inContext("BTCUSDT", at(5), () => fund.getFree());
  if (freeBefore !== 1000) return fail(`read at t=5 must not see the reserve at t=10, got ${freeBefore}`);
  const historyBefore = await inContext("BTCUSDT", at(5), () => fund.getHistory());
  if (historyBefore.length !== 0) return fail(`history at t=5 must be empty, got ${historyBefore.length}`);

  const freeAt = await inContext("BTCUSDT", at(10), () => fund.getFree());
  if (freeAt !== 300) return fail(`read at t=10 must see the reserve, got ${freeAt}`);

  // A reserve at t=5 is checked against the balance as of t=5 (1000 free), inserted before the late row
  await inContext("ETHUSDT", at(5), () => fund.reserve({ id: "early", amount: 500 }));
  const history = await inContext("BTCUSDT", at(20), () => fund.getHistory());
  if (history.map((row) => row.id).join(",") !== "early,late") return fail(`journal order expected early,late got ${history.map((row) => row.id)}`);
  if (history[0].balance.free !== 500) return fail(`early row balance expected free 500, got ${history[0].balance.free}`);
  if (history[1].balance.free !== -200) return fail(`late row must be recomputed to free -200, got ${history[1].balance.free}`);
  if (history[1].overdraft !== 200) return fail(`late row must show overdraft 200, got ${history[1].overdraft}`);
  const free = await inContext("BTCUSDT", at(20), () => fund.getFree());
  if (free !== -200) return fail(`overdraft must be visible as negative free, got ${free}`);

  const refused = await expectRejected(() => inContext("BTCUSDT", at(21), () => fund.reserve({ id: "third", amount: 1 })));
  if (!refused) return fail("any reserve while free is negative must be refused");

  await inContext("ETHUSDT", at(22), () => fund.release({ id: "early", pnl: 0 }));
  const freeAfter = await inContext("BTCUSDT", at(23), () => fund.getFree());
  if (freeAfter !== 300) return fail(`release must bring free back to 300, got ${freeAfter}`);
  pass();
});

test("budget: instance methods throw outside the execution or method context", async ({ pass, fail }) => {
  Budget.enable();
  const fund = new Budget({ name: "fund", initialCapital: 1000 });
  try {
    await fund.getFree();
    return fail("getFree without any context must throw");
  } catch (error) {
    if (!String(error.message).includes("requires an execution context")) return fail(`unexpected: ${error.message}`);
  }
  try {
    await ExecutionContextService.runInContext(() => fund.reserve({ id: "x", amount: 1 }), { symbol: "BTCUSDT", when: at(1), backtest: true });
    return fail("reserve without a method context must throw");
  } catch (error) {
    if (!String(error.message).includes("requires a method context")) return fail(`unexpected: ${error.message}`);
  }
  pass();
});

test("budget: statics throw when Budget is not enabled", async ({ pass, fail }) => {
  try {
    await Budget._getFree({ ...METHOD, backtest: true, name: "fund", when: at(1) });
    return fail("_getFree before enable must throw");
  } catch (error) {
    if (!String(error.message).includes("Budget.enable()")) return fail(`unexpected: ${error.message}`);
  }
  pass();
});

// ---------------------------------------------------------------------------
// Stage 2
// ---------------------------------------------------------------------------
test("budget: the record is shared across symbols of one run", async ({ pass, fail }) => {
  Budget.enable();
  const fund = new Budget({ name: "fund", initialCapital: 1000 });

  await inContext("BTCUSDT", at(1), () => fund.reserve({ id: "btc", amount: 600 }));
  const ethFree = await inContext("ETHUSDT", at(2), () => fund.getFree());
  if (ethFree !== 400) return fail(`ETHUSDT must see BTCUSDT's reserve, got ${ethFree}`);

  const refused = await expectRejected(() => inContext("ETHUSDT", at(3), () => fund.reserve({ id: "eth", amount: 500 })));
  if (!refused) return fail("ETHUSDT reserve above the shared free must be refused");

  await inContext("BTCUSDT", at(4), () => fund.release({ id: "btc", pnl: -100 }));
  await inContext("ETHUSDT", at(5), () => fund.reserve({ id: "eth", amount: 500 }));
  const history = await inContext("SOLUSDT", at(6), () => fund.getHistory());
  const symbols = history.map((row) => row.symbol).join(",");
  if (symbols !== "BTCUSDT,ETHUSDT,BTCUSDT,ETHUSDT") return fail(`symbols expected BTCUSDT,ETHUSDT,BTCUSDT,ETHUSDT got ${symbols}`);
  const balance = await inContext("SOLUSDT", at(6), () => fund.getBalance());
  if (balance.capital !== 900 || balance.deployed !== 500 || balance.free !== 400) return fail(`expected 900/500/400, got ${JSON.stringify(balance)}`);

  // Statics with the same key hit the same record (listener path, no signalId)
  const viaStatic = await Budget._getFree({ ...METHOD, backtest: true, name: "fund", when: at(6) });
  if (viaStatic !== 400) return fail(`static read must see the instance's record, got ${viaStatic}`);
  const other = await Budget._getFree({ ...METHOD, backtest: true, name: "other", when: at(6), initialCapital: 5 });
  if (other !== 5) return fail(`a different name must be a different record, got ${other}`);
  pass();
});

test("budget: different strategy, exchange, frame or mode is a different record", async ({ pass, fail }) => {
  Budget.enable();
  BudgetLive.useLocal();
  const fund = new Budget({ name: "fund", initialCapital: 1000 });

  await inContext("BTCUSDT", at(1), () => fund.reserve({ id: "a", amount: 300 }));
  const base = await inContext("BTCUSDT", at(2), () => fund.getFree());
  if (base !== 700) return fail(`base expected 700, got ${base}`);

  const variants = {
    strategy: { ...METHOD, strategyName: "other-strategy" },
    exchange: { ...METHOD, exchangeName: "other-exchange" },
    frame: { ...METHOD, frameName: "other-frame" },
  };
  for (const [label, method] of Object.entries(variants)) {
    const free = await inContext("BTCUSDT", at(2), () => fund.getFree(), { method });
    if (free !== 1000) return fail(`${label} variant must be an untouched record, got ${free}`);
  }
  const live = await inContext("BTCUSDT", at(2), () => fund.getFree(), { backtest: false, method: { ...METHOD, frameName: "" } });
  if (live !== 1000) return fail(`live record must be separate from backtest, got ${live}`);
  await inContext("BTCUSDT", at(3), () => fund.reserve({ id: "live", amount: 100 }), { backtest: false, method: { ...METHOD, frameName: "" } });
  const backtestAgain = await inContext("BTCUSDT", at(4), () => fund.getFree());
  if (backtestAgain !== 700) return fail(`live write must not touch the backtest record, got ${backtestAgain}`);
  pass();
});

test("budget: persist backend stores the record under the run key without a signalId and restores it", async ({ pass, fail }) => {
  Budget.enable();
  const store = new Map();
  const seenKeys = [];
  PersistBudgetAdapter.usePersistBudgetAdapter(class {
    constructor(key, name) {
      this.key = key;
      this.name = name;
      this.storeKey = `${JSON.stringify(key)}|${name}`;
      seenKeys.push({ key, name });
    }
    async waitForInit() { void 0; }
    async readBudgetData() { return store.get(this.storeKey) ?? null; }
    async writeBudgetData(data) { store.set(this.storeKey, structuredClone(data)); }
    async dispose() { void 0; }
  });
  BudgetBacktest.usePersist();
  const fund = new Budget({ name: "fund", initialCapital: 1000 });

  await inContext("BTCUSDT", at(1), () => fund.reserve({ id: "a", amount: 250 }));
  await inContext("ETHUSDT", at(2), () => fund.deposit({ asset: "ETH", amount: 1 }));

  if (seenKeys.length !== 1) return fail(`one persist instance per record expected, got ${seenKeys.length}`);
  const { key, name } = seenKeys[0];
  if ("signalId" in key || "symbol" in key) return fail(`record key must not contain signalId/symbol: ${JSON.stringify(key)}`);
  if (key.strategyName !== METHOD.strategyName || key.exchangeName !== METHOD.exchangeName || key.frameName !== METHOD.frameName || key.backtest !== true || name !== "fund") {
    return fail(`record key wrong: ${JSON.stringify({ key, name })}`);
  }
  const written = [...store.values()][0];
  if (written.data.journal.length !== 2 || written.data.initialCapital !== 1000) return fail(`written record wrong: ${JSON.stringify(written)}`);

  // Drop the memoized instance: the next call must restore the journal from the store
  BudgetBacktest.clear();
  const free = await inContext("SOLUSDT", at(3), () => fund.getFree());
  if (free !== 750) return fail(`restored record expected free 750, got ${free}`);
  await inContext("SOLUSDT", at(4), () => fund.release({ id: "a", pnl: 10 }));
  const history = await inContext("SOLUSDT", at(5), () => fund.getHistory());
  if (history.length !== 3 || history[2].seq <= history[1].seq) return fail(`restored journal must continue the seq, got ${JSON.stringify(history.map((row) => row.seq))}`);
  const balance = await inContext("SOLUSDT", at(5), () => fund.getBalance());
  if (balance.capital !== 1010 || balance.free !== 1010 || balance.assets.ETH !== 1) return fail(`expected 1010/0/1010 ETH 1, got ${JSON.stringify(balance)}`);
  pass();
});

test("budget: journal order is deterministic for equal timestamps (symbol, then insertion)", async ({ pass, fail }) => {
  Budget.enable();
  const fund = new Budget({ name: "fund", initialCapital: 1000 });

  await inContext("ETHUSDT", at(1), () => fund.reserve({ id: "eth", amount: 100 }));
  await inContext("BTCUSDT", at(1), () => fund.reserve({ id: "btc", amount: 100 }));
  await inContext("BTCUSDT", at(1), () => fund.deposit({ asset: "X", amount: 1 }));

  const history = await inContext("BTCUSDT", at(1), () => fund.getHistory());
  const order = history.map((row) => `${row.symbol}:${row.type}`).join(",");
  if (order !== "BTCUSDT:reserve,BTCUSDT:deposit,ETHUSDT:reserve") return fail(`order expected BTCUSDT:reserve,BTCUSDT:deposit,ETHUSDT:reserve got ${order}`);
  if (history[2].balance.free !== 800) return fail(`tail balance expected 800, got ${history[2].balance.free}`);
  pass();
});

// ---------------------------------------------------------------------------
// A record is created by the first call: a static call must bring the capital
// ---------------------------------------------------------------------------
test("budget: a static call that would create the record without initialCapital is refused and leaves nothing behind", async ({ pass, fail }) => {
  Budget.enable();
  const base = { ...METHOD, backtest: true, name: "fund" };

  // a listener touches the account before the strategy did
  try {
    await Budget._getFree({ ...base, when: at(1) });
    return fail("a static read creating the record without initialCapital must throw");
  } catch (error) {
    if (!BudgetMissingError.isBudgetMissingError(error)) return fail(`expected BudgetMissingError, got ${error.message}`);
  }
  try {
    await Budget._reserve({ id: "early", amount: 1 }, { ...base, when: at(1), symbol: "BTCUSDT" });
    return fail("a static write creating the record without initialCapital must throw");
  } catch (error) {
    if (!BudgetMissingError.isBudgetMissingError(error)) return fail(`expected BudgetMissingError, got ${error.message}`);
  }

  // nothing was created with a guessed capital: the next call that brings the capital creates it properly
  const free = await Budget._getFree({ ...base, when: at(2), initialCapital: 5000 });
  if (free !== 5000) return fail(`the record must be created with the capital of the first successful call, got ${free}`);
  const instance = new Budget({ name: "fund", initialCapital: 5000 });
  const seen = await inContext("BTCUSDT", at(3), () => instance.getFree());
  if (seen !== 5000) return fail(`the strategy instance must see the same record, got ${seen}`);
  pass();
});

test("budget: once the record exists, static calls without initialCapital read and write it", async ({ pass, fail }) => {
  Budget.enable();
  const fund = new Budget({ name: "fund", initialCapital: 1000 });
  await inContext("BTCUSDT", at(1), () => fund.reserve({ id: "a", amount: 300 }));

  const base = { ...METHOD, backtest: true, name: "fund" };
  const free = await Budget._getFree({ ...base, when: at(2) });
  if (free !== 700) return fail(`static read without initialCapital expected 700, got ${free}`);
  const after = await Budget._release({ id: "a", pnl: 10 }, { ...base, when: at(3), symbol: "BTCUSDT" });
  if (after.capital !== 1010 || after.free !== 1010) return fail(`static write without initialCapital expected 1010/1010, got ${JSON.stringify(after)}`);
  pass();
});

test("budget: a persisted record is served to a static call without initialCapital, an unpersisted one is refused", async ({ pass, fail }) => {
  Budget.enable();
  const store = new Map();
  PersistBudgetAdapter.usePersistBudgetAdapter(class {
    constructor(key, name) { this.storeKey = `${JSON.stringify(key)}|${name}`; }
    async waitForInit() { void 0; }
    async readBudgetData() { return store.get(this.storeKey) ?? null; }
    async writeBudgetData(data) { store.set(this.storeKey, structuredClone(data)); }
    async dispose() { void 0; }
  });
  BudgetBacktest.usePersist();
  const fund = new Budget({ name: "fund", initialCapital: 2000 });
  await inContext("BTCUSDT", at(1), () => fund.reserve({ id: "a", amount: 500 }));

  // a restart: no memoized instance, the record comes back from the store without any capital in the call
  BudgetBacktest.clear();
  const base = { ...METHOD, backtest: true, name: "fund" };
  const free = await Budget._getFree({ ...base, when: at(2) });
  if (free !== 1500) return fail(`the persisted record must be served without initialCapital, got ${free}`);

  // a record that was never persisted is still refused
  try {
    await Budget._getFree({ ...base, name: "other", when: at(2) });
    return fail("an unpersisted record must not be created without initialCapital");
  } catch (error) {
    if (!BudgetMissingError.isBudgetMissingError(error)) return fail(`expected BudgetMissingError, got ${error.message}`);
  }
  const other = await Budget._getFree({ ...base, name: "other", when: at(3), initialCapital: 7 });
  if (other !== 7) return fail(`the refused creation must not pin a broken instance, got ${other}`);
  pass();
});

// ---------------------------------------------------------------------------
// Diagnostics: a release ahead of its reserve, a shortfall that stays on record
// ---------------------------------------------------------------------------
test("budget: a release dated before its reserve is a no-op that leaves a warning, the same release at a proper when works", async ({ pass, fail }) => {
  Budget.enable();
  const fund = new Budget({ name: "fund", initialCapital: 1000 });
  await inContext("BTCUSDT", at(10), () => fund.reserve({ id: "late", amount: 400 }));

  const warnings = [];
  const realWarn = console.warn;
  console.warn = (...args) => { warnings.push(args.map(String).join(" ")); };
  try {
    const balance = await inContext("BTCUSDT", at(5), () => fund.release({ id: "late", pnl: 50 }));
    if (balance.deployed !== 0 || balance.capital !== 1000) return fail(`a read at t=5 must not see the reserve at t=10: ${JSON.stringify(balance)}`);
    const later = await inContext("BTCUSDT", at(11), () => fund.getBalance());
    if (later.deployed !== 400) return fail(`the early release must not touch the reserve: deployed=${later.deployed}`);
  } finally {
    console.warn = realWarn;
  }
  const warning = warnings.find((w) => w.includes('release of "late"') && w.includes("lies ahead"));
  if (!warning) return fail(`expected a warning about the release ahead of its reserve, got ${JSON.stringify(warnings)}`);
  if (!warning.includes(at(5).toISOString()) || !warning.includes(at(10).toISOString())) return fail(`the warning must carry both timestamps: ${warning}`);

  // an id that was never reserved stays a silent no-op (the documented repeat-release behaviour)
  warnings.length = 0;
  console.warn = (...args) => { warnings.push(args.join(" ")); };
  try {
    await inContext("BTCUSDT", at(12), () => fund.release({ id: "never", pnl: 0 }));
  } finally {
    console.warn = realWarn;
  }
  if (warnings.length) return fail(`an unknown id must not warn: ${JSON.stringify(warnings)}`);

  const after = await inContext("BTCUSDT", at(13), () => fund.release({ id: "late", pnl: 50 }));
  if (after.deployed !== 0 || after.capital !== 1050) return fail(`the release at a proper when must go through: ${JSON.stringify(after)}`);
  pass();
});

test("budget: an overdraft healed by an earlier release that arrived later is cleared, what it refused meanwhile stays on record", async ({ pass, fail }) => {
  Budget.enable();
  const fund = new Budget({ name: "fund", initialCapital: 1000 });
  await inContext("BTCUSDT", at(10), () => fund.reserve({ id: "late", amount: 700 }));
  await inContext("ETHUSDT", at(5), () => fund.reserve({ id: "early", amount: 500 }));
  let history = await inContext("BTCUSDT", at(20), () => fund.getHistory());
  const lateBefore = history.find((r) => r.type === "reserve" && r.id === "late");
  if (lateBefore.overdraft !== 200 || lateBefore.balance.free !== -200) return fail(`expected overdraft 200 on the late row first, got ${JSON.stringify(lateBefore)}`);

  // while the shortfall stands, a reserve is refused: that refusal is the durable trace
  const refused = await expectRejected(() => inContext("BTCUSDT", at(12), () => fund.reserve({ id: "meanwhile", amount: 100 })));
  if (!refused) return fail("a reserve during the shortfall must be refused");

  // an earlier release of "early" (t=7, before the late reserve) arrives later: by logical time the
  // late reserve never lacked money, the rows only came out of order, so the mark goes away
  await inContext("ETHUSDT", at(7), () => fund.release({ id: "early", pnl: 0 }));
  history = await inContext("BTCUSDT", at(20), () => fund.getHistory());
  const lateAfter = history.find((r) => r.type === "reserve" && r.id === "late");
  if (lateAfter.balance.free !== 300) return fail(`the late row's balance must be recomputed to free 300, got ${lateAfter.balance.free}`);
  if (lateAfter.overdraft !== undefined) return fail(`a healed shortfall must not keep its mark (the journal would depend on arrival order), got ${lateAfter.overdraft}`);
  const rejectRow = history.find((r) => r.type === "reject" && r.timestamp === at(12).getTime());
  if (!rejectRow) return fail(`the refusal made during the shortfall must stay in the journal: ${history.map((r) => r.type).join(",")}`);
  const free = await inContext("BTCUSDT", at(20), () => fund.getFree());
  if (free !== 300) return fail(`current free expected 300, got ${free}`);
  pass();
});

// ---------------------------------------------------------------------------
// Stage 4: budget.jsonl, the budget markdown report, listenBudget
// ---------------------------------------------------------------------------
test("budget: every journal row goes to budget.jsonl, the budget markdown report and listenBudget", async ({ pass, fail }) => {
  Budget.enable();
  const fund = new Budget({ name: "fund", initialCapital: 1000 });

  // capture everything the report writer is asked to persist (no files)
  const rows = [];
  ReportWriter.useReportAdapter(class {
    constructor(reportName) { this.reportName = reportName; }
    async waitForInit() {}
    async write(data, options) { rows.push({ reportName: this.reportName, data, options }); }
  });
  const events = [];
  const unlisten = listenBudget((event) => { events.push(event); });

  try {
    await inContext("BTCUSDT", at(1), () => fund.reserve({ id: "sig-1", amount: 400, note: "entry" }));
    await inContext("BTCUSDT", at(3), () => fund.release({ id: "sig-1", pnl: 50 }));
    const refused = await expectRejected(() => inContext("ETHUSDT", at(4), () => fund.reserve({ id: "sig-2", amount: 2000 })));
    if (!refused) return fail("the oversized reserve must be refused");
    await inContext("ETHUSDT", at(5), () => fund.deposit({ asset: "ETH", amount: 2 }));
    await inContext("ETHUSDT", at(6), () => fund.withdraw({ asset: "ETH", amount: 1 }));
    await new Promise((resolve) => setTimeout(resolve, 10));
  } finally {
    unlisten();
    ReportWriter.useDummy();
  }

  // budget.jsonl: one flat row per journal row, in insertion order
  const written = rows.filter((r) => r.reportName === "budget");
  const types = written.map((r) => r.data.type);
  if (types.join(",") !== "reserve,release,reject,deposit,withdraw") return fail(`budget.jsonl rows expected reserve,release,reject,deposit,withdraw, got ${types.join(",")} (reports seen: ${[...new Set(rows.map((r) => r.reportName))].join(",")})`);
  const [reserve, release, reject] = written.map((r) => r.data);
  if (reserve.name !== "fund" || reserve.strategyName !== METHOD.strategyName || reserve.exchangeName !== METHOD.exchangeName || reserve.frameName !== METHOD.frameName || reserve.backtest !== true) return fail(`the row must carry the record key and the name: ${JSON.stringify(reserve)}`);
  if (reserve.symbol !== "BTCUSDT" || reserve.timestamp !== at(1).getTime() || reserve.id !== "sig-1" || reserve.amount !== 400 || reserve.note !== "entry" || reserve.seq !== 1) return fail(`reserve row fields wrong: ${JSON.stringify(reserve)}`);
  if (reserve.balance.free !== 600 || release.balance.capital !== 1050 || release.pnl !== 50) return fail(`balances after the rows wrong: ${JSON.stringify([reserve.balance, release.balance])}`);
  if (reject.action !== "reserve" || reject.requested !== 2000 || reject.available !== 1050 || reject.asset !== "capital") return fail(`reject row wrong: ${JSON.stringify(reject)}`);
  const { options } = written[0];
  if (options.strategyName !== METHOD.strategyName || options.symbol !== "BTCUSDT" || options.signalId !== "" || options.walkerName !== "") return fail(`search keys wrong: ${JSON.stringify(options)}`);

  // listenBudget: the same five events, with the row and a Date
  if (events.length !== 5) return fail(`listenBudget expected 5 events, got ${events.length}`);
  if (events[0].row.type !== "reserve" || events[0].name !== "fund" || !(events[0].when instanceof Date) || events[0].when.getTime() !== events[0].timestamp || events[0].timestamp !== at(1).getTime()) return fail(`first event wrong: ${JSON.stringify(events[0])}`);
  if (events[2].row.type !== "reject" || events[2].symbol !== "ETHUSDT") return fail(`third event wrong: ${JSON.stringify(events[2])}`);

  // markdown report: newest first, totals, the empty state for an unknown budget
  const context = { ...METHOD, name: "fund" };
  const data = await Budget.getData(context, true);
  if (data.totalEvents !== 5 || data.totalRejects !== 1 || data.totalOverdrafts !== 0) return fail(`getData totals wrong: ${JSON.stringify({ totalEvents: data.totalEvents, totalRejects: data.totalRejects, totalOverdrafts: data.totalOverdrafts })}`);
  if (data.eventList[0].type !== "withdraw" || data.eventList[4].type !== "reserve" || data.eventList[4].name !== "fund") return fail(`eventList must be newest first: ${data.eventList.map((e) => e.type).join(",")}`);
  const report = await Budget.getReport(context, true);
  for (const needle of ["# Budget Report: budget-strategy:fund", "| RESERVE |", "| REJECT RESERVE |", "| WITHDRAW |", "1050.00 USD", "ETH: 1.00", "**Total rows:** 5", "**Rejects:** 1", "**Overdrafts:** 0", "| Backtest |"]) {
    if (!report.includes(needle)) return fail(`report must contain ${JSON.stringify(needle)}:\n${report}`);
  }
  const showNote = getConfig().CC_REPORT_SHOW_SIGNAL_NOTE;
  if (report.includes("| Note |") !== showNote || report.includes("| entry |") !== showNote) return fail(`the note column follows CC_REPORT_SHOW_SIGNAL_NOTE=${showNote}:\n${report}`);
  const empty = await Budget.getReport({ ...METHOD, name: "other" }, true);
  if (!empty.includes("No budget rows recorded yet.")) return fail(`unknown budget must give the empty report, got:\n${empty}`);
  const live = await Budget.getData(context, false);
  if (live.totalEvents !== 0) return fail(`the live bucket must stay empty, got ${live.totalEvents}`);

  // Markdown.clear({ budget: true }) empties the buckets
  Markdown.clear({ budget: true });
  const cleared = await Budget.getData(context, true);
  if (cleared.totalEvents !== 0) return fail(`after clear expected 0 rows, got ${cleared.totalEvents}`);
  pass();
});

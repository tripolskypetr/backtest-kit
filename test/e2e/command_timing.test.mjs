import { test } from "worker-testbed";

import { spawn } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  addExchangeSchema,
  addStrategySchema,
  addFrameSchema,
  Backtest,
  listenIdlePing,
  listenActivePing,
  listenSchedulePing,
  listenStrategyCommit,
} from "../../build/index.mjs";

// When does a command take effect, counted from the ping that issued it? The same scenarios run
// through both orchestrators — BacktestLogicPrivateService (Backtest.run, entry steps on a
// frame) and LiveLogicPrivateService (Live.run, real minutes in a child process) — and must
// agree on every relative minute:
//   A  commitCreateSignal (market) from the idle ping ........ opened on that minute (0)
//      commitDividend from the active ping .................... commit stamped on that minute (0)
//      commitClosePending from the active ping ................ closed on the next minute (1)
//   B  setPendingSignal from the idle ping ................... opened on that minute (0)
//      commitCreateTakeProfit from the active ping ............ closed take_profit on the next minute (1)
//   C  commitCreateSignal (resting) from the idle ping ........ placed on that minute (0)
//      commitCancelScheduled from the schedule ping ........... cancelled on the next minute (1)

const MIN = 60_000;
const SYMBOL = "BTCUSDT";
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const MARKET = { position: "long", priceTakeProfit: 119, priceStopLoss: 85, cost: 1000, minuteEstimatedTime: 600 };
const ADOPTED = { position: "long", priceOpen: 95, priceTakeProfit: 119, priceStopLoss: 85, cost: 1000, minuteEstimatedTime: 600 };
const RESTING = { position: "long", priceOpen: 90, priceTakeProfit: 105, priceStopLoss: 80, cost: 1000, minuteEstimatedTime: 600 };

const EXPECTED = { A_OPENED: 0, A_DIVIDEND: 0, A_CLOSED: 1, B_OPENED: 0, B_CLOSED: 1, C_SCHEDULED: 0, C_CANCELLED: 1 };

// ---------------------------------------------------------------------------------------------
// Backtest: the three scenarios through Backtest.run on a 1m/1m frame, commands from the first
// ping of each channel, every relative minute collected under the same keys as the live child.
// ---------------------------------------------------------------------------------------------
const runBacktestScenario = async (key, { onIdle, onActive, onSchedule }) => {
  const FRAME_START = Date.parse("2024-03-01T00:00:00Z");
  const context = { strategyName: `timing-bt-${key}-strategy`, exchangeName: `timing-bt-${key}-exchange`, frameName: `timing-bt-${key}-frame` };
  addExchangeSchema({
    exchangeName: context.exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const aligned = Math.floor(since.getTime() / MIN) * MIN;
      return Array.from({ length: limit }, (_, i) => ({ timestamp: aligned + i * MIN, open: 100, high: 100, low: 100, close: 100, volume: 1_000 }));
    },
    formatPrice: async (_s, p) => p.toFixed(8),
    formatQuantity: async (_s, q) => q.toFixed(8),
  });
  addStrategySchema({ strategyName: context.strategyName, interval: "1m", getSignal: async () => null });
  addFrameSchema({ frameName: context.frameName, entryInterval: "1m", watchInterval: "1m", startDate: new Date(FRAME_START), endDate: new Date(FRAME_START + 30 * MIN) });
  const marks = {};
  const deltas = {};
  const fired = new Set();
  const once = (channel, fn) => async (event) => {
    const name = channel === "idle" ? event.strategyName : event.data.strategyName;
    if (name !== context.strategyName || fired.has(channel) || !fn) return;
    fired.add(channel);
    marks[channel] = event.timestamp;
    await fn(event, context);
  };
  const unsubscribe = [
    listenIdlePing(once("idle", onIdle)),
    listenActivePing(once("active", onActive)),
    listenSchedulePing(once("schedule", async (event, ctx) => {
      deltas[`${key}_SCHEDULED`] = (event.data.scheduledAt - marks.idle) / MIN;
      await onSchedule(event, ctx);
    })),
    listenStrategyCommit((event) => {
      if (event.strategyName === context.strategyName && event.action === "dividend") deltas[`${key}_DIVIDEND`] = (event.timestamp - marks.active) / MIN;
    }),
  ];
  try {
    for await (const result of Backtest.run(SYMBOL, context)) {
      if (result.action === "opened") deltas[`${key}_OPENED`] = (result.signal.pendingAt - marks.idle) / MIN;
      if (result.action === "closed") { deltas[`${key}_CLOSED`] = (result.closeTimestamp - marks.active) / MIN; deltas[`${key}_CLOSED_REASON`] = result.closeReason; }
      if (result.action === "cancelled") { deltas[`${key}_CANCELLED`] = (result.closeTimestamp - marks.schedule) / MIN; deltas[`${key}_CANCELLED_REASON`] = result.reason; }
    }
  } finally {
    unsubscribe.forEach((un) => un());
  }
  return deltas;
};

const runBacktestSide = async () => ({
  ...(await runBacktestScenario("A", {
    onIdle: (_e, ctx) => Backtest.commitCreateSignal(SYMBOL, ctx, MARKET),
    onActive: async (event, ctx) => {
      await Backtest.commitDividend(SYMBOL, event.currentPrice, ctx, { amount: 1, note: "timing" });
      await Backtest.commitClosePending(SYMBOL, ctx);
    },
  })),
  ...(await runBacktestScenario("B", {
    onIdle: (_e, ctx) => Backtest.setPendingSignal(SYMBOL, ctx, ADOPTED),
    onActive: (_e, ctx) => Backtest.commitCreateTakeProfit(SYMBOL, ctx),
  })),
  ...(await runBacktestScenario("C", {
    onIdle: (_e, ctx) => Backtest.commitCreateSignal(SYMBOL, ctx, RESTING),
    onSchedule: (_e, ctx) => Backtest.commitCancelScheduled(SYMBOL, ctx),
  })),
});

// ---------------------------------------------------------------------------------------------
// Live: the same three scenarios as three concurrent Live.run loops in one child process that
// lives through real minute boundaries (the loop waits for the candle in real time). Each loop
// prints its relative minutes as TIMING lines and the child exits when all three are done.
// ---------------------------------------------------------------------------------------------
const CHILD_SCRIPT = `
import "${REPO_ROOT}/test/config/setup.mjs";
import {
  addExchangeSchema, addStrategySchema, Live,
  listenIdlePing, listenActivePing, listenSchedulePing, listenStrategyCommit, listenError,
} from "${REPO_ROOT}/build/index.mjs";

const MIN = 60_000;
const SYMBOL = "BTCUSDT";
const MARKET = ${JSON.stringify(MARKET)};
const ADOPTED = ${JSON.stringify(ADOPTED)};
const RESTING = ${JSON.stringify(RESTING)};
const out = (line) => console.log("TIMING " + line);

const scenario = (key) => {
  const context = { strategyName: "timing-live-" + key + "-strategy", exchangeName: "timing-live-" + key + "-exchange" };
  addExchangeSchema({
    exchangeName: context.exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const aligned = Math.floor(since.getTime() / MIN) * MIN;
      return Array.from({ length: limit }, (_, i) => ({ timestamp: aligned + i * MIN, open: 100, high: 100, low: 100, close: 100, volume: 1000 }));
    },
    formatPrice: async (_s, p) => p.toFixed(8),
    formatQuantity: async (_s, q) => q.toFixed(8),
  });
  addStrategySchema({ strategyName: context.strategyName, interval: "1m", getSignal: async () => null });
  return context;
};
const CTX = { A: scenario("A"), B: scenario("B"), C: scenario("C") };
const keyOf = (name) => Object.keys(CTX).find((k) => CTX[k].strategyName === name);

const onIdle = {
  A: (ctx) => Live.commitCreateSignal(SYMBOL, ctx, MARKET),
  B: (ctx) => Live.setPendingSignal(SYMBOL, ctx, ADOPTED),
  C: (ctx) => Live.commitCreateSignal(SYMBOL, ctx, RESTING),
};
const onActive = {
  A: async (ctx, event) => {
    await Live.commitDividend(SYMBOL, event.currentPrice, ctx, { amount: 1, note: "timing" });
    await Live.commitClosePending(SYMBOL, ctx);
  },
  B: (ctx) => Live.commitCreateTakeProfit(SYMBOL, ctx),
};
const onSchedule = {
  C: (ctx) => Live.commitCancelScheduled(SYMBOL, ctx),
};
const marks = {};
const fired = new Set();
const once = (channel, table) => async (event) => {
  const key = keyOf(channel === "idle" ? event.strategyName : event.data.strategyName);
  if (!key || !table[key] || fired.has(channel + key)) return;
  fired.add(channel + key);
  marks[channel + key] = event.timestamp;
  if (channel === "schedule") out(key + "_SCHEDULED delta=" + (event.data.scheduledAt - marks["idle" + key]) / MIN);
  await table[key](CTX[key], event);
};
listenError((error) => out("ERROR " + String(error?.message ?? error)));
listenIdlePing(once("idle", onIdle));
listenActivePing(once("active", onActive));
listenSchedulePing(once("schedule", onSchedule));
listenStrategyCommit((event) => {
  const key = keyOf(event.strategyName);
  if (key && event.action === "dividend") out(key + "_DIVIDEND delta=" + (event.timestamp - marks["active" + key]) / MIN);
});

const expectedYields = { A: 2, B: 2, C: 1 };
let left = 3;
const loop = async (key) => {
  let yields = 0;
  for await (const result of Live.run(SYMBOL, CTX[key])) {
    if (result.action === "opened") out(key + "_OPENED delta=" + (result.signal.pendingAt - marks["idle" + key]) / MIN);
    if (result.action === "closed") out(key + "_CLOSED delta=" + (result.closeTimestamp - marks["active" + key]) / MIN + " reason=" + result.closeReason);
    if (result.action === "cancelled") out(key + "_CANCELLED delta=" + (result.closeTimestamp - marks["schedule" + key]) / MIN + " reason=" + result.reason);
    if (++yields >= expectedYields[key]) break;
  }
  if (--left === 0) {
    out("ALL_DONE");
    setTimeout(() => process.exit(0), 200);
  }
};
loop("A"); loop("B"); loop("C");
const watchdog = setTimeout(() => { out("TIMEOUT"); process.exit(3); }, 300_000);
watchdog.unref?.();
`;

const runLiveSide = () => new Promise((resolvePromise) => {
  const scriptPath = join(tmpdir(), `backtest-kit-command-timing-${process.pid}-${Math.floor(Math.random() * 1e9)}.mjs`);
  writeFileSync(scriptPath, CHILD_SCRIPT);
  const chunks = [];
  const child = spawn(process.execPath, [scriptPath], { stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (chunk) => chunks.push(String(chunk)));
  child.stderr.on("data", (chunk) => chunks.push(String(chunk)));
  const timer = setTimeout(() => { child.kill("SIGKILL"); finish(-1, true); }, 320_000);
  let finished = false;
  const finish = (code, timedOut) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    try { rmSync(scriptPath, { force: true }); } catch {}
    const output = chunks.join("");
    const deltas = {};
    for (const line of output.split("\n")) {
      const m = line.match(/^TIMING (\w+) delta=(-?\d+(?:\.\d+)?)(?: reason=(\w+))?/);
      if (!m) continue;
      deltas[m[1]] = Number(m[2]);
      if (m[3]) deltas[`${m[1]}_REASON`] = m[3];
    }
    resolvePromise({ code, timedOut, output, deltas, done: output.includes("TIMING ALL_DONE") });
  };
  child.on("exit", (code) => finish(code, false));
});

test("COMMAND TIMING: Backtest.run and Live.run apply every command on the same relative minute — same-tick opens and placements, next-tick closes and cancels, same-minute commits", async ({ pass, fail }) => {
  const backtestSide = await runBacktestSide();
  const liveSide = await runLiveSide();
  if (liveSide.timedOut || !liveSide.done) return fail(`the live child did not finish (code=${liveSide.code}, timedOut=${liveSide.timedOut}): ${JSON.stringify(liveSide.output.slice(-800))}`);
  const problems = [];
  for (const [key, expected] of Object.entries(EXPECTED)) {
    if (backtestSide[key] !== expected) problems.push(`backtest ${key}=${backtestSide[key]} (expected ${expected})`);
    if (liveSide.deltas[key] !== expected) problems.push(`live ${key}=${liveSide.deltas[key]} (expected ${expected})`);
  }
  if (backtestSide.B_CLOSED_REASON !== "take_profit" || liveSide.deltas.B_CLOSED_REASON !== "take_profit") problems.push(`B must close by take_profit: backtest ${backtestSide.B_CLOSED_REASON}, live ${liveSide.deltas.B_CLOSED_REASON}`);
  if (backtestSide.C_CANCELLED_REASON !== "user" || liveSide.deltas.C_CANCELLED_REASON !== "user") problems.push(`C must be cancelled by the user: backtest ${backtestSide.C_CANCELLED_REASON}, live ${liveSide.deltas.C_CANCELLED_REASON}`);
  for (const key of Object.keys(EXPECTED)) {
    if (backtestSide[key] !== liveSide.deltas[key]) problems.push(`parity ${key}: backtest ${backtestSide[key]} vs live ${liveSide.deltas[key]}`);
  }
  if (problems.length) return fail(`${problems.join("; ")} — backtest ${JSON.stringify(backtestSide)}, live ${JSON.stringify(liveSide.deltas)}, child output ${JSON.stringify(liveSide.output.slice(-600))}`);
  pass(`relative minutes identical in backtest and live: ${Object.entries(EXPECTED).map(([k, v]) => `${k}=${v}`).join(", ")} (B take_profit, C user)`);
});

import { test } from "worker-testbed";
import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  getAveragePrice,
  getCandlesSampled,
  setConfig,
  getDefaultConfig,
} from "../../build/index.mjs";

/**
 * Frame end must close an open position with "time_expired" no matter how the
 * candle feed behaves after endDate. Mirrors backtest-kit-template content/issue:
 * a synthetic daily source sampled to minutes by the engine, an hourly frame of
 * 10 days, a position whose lifetime is longer than the rest of the frame.
 *
 *   bounded - the series ends exactly on endDate (a source cut by the frame)
 *   dead    - the series stops 3 days before endDate (dead feed)
 *   reentry - crash -60% on day 3: stop loss, re-entry with a lifetime longer than the rest of the frame
 *   short   - lifetime only 3 days longer than the frame (inside the gap-fill limit)
 *   empty   - the source returns [] for any request starting inside the frame
 *   future  - the frame ends at the wall clock: the position's candle window extends past Date.now()
 */
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

const FRAME_START = Date.parse("2024-01-01T00:00:00Z");
const FRAME_END = Date.parse("2024-01-10T23:59:59Z");

const buildCase = (name, { frameStart = FRAME_START, frameEnd = FRAME_END, seriesEnd = frameEnd, holdMinutes = 30 * 24 * 60, crashDay = null, empty = false } = {}) => {
  const seriesStart = frameStart - 30 * DAY_MS;
  const closeOf = (dayIndex, dayStart) => (crashDay !== null && dayStart === frameStart + crashDay * DAY_MS ? 40 : 100 * Math.pow(1.005, dayIndex));
  const getDailyCandles = async (_symbol, interval, since, limit) => {
    if (interval !== "1d") throw new Error(`frame_end exchange: only 1d bars, got ${interval}`);
    const out = [];
    if (empty && since >= frameStart - DAY_MS) return out;
    let dayStart = Math.floor(since / DAY_MS) * DAY_MS;
    while (out.length < limit && dayStart <= seriesEnd) {
      if (dayStart >= seriesStart) {
        const dayIndex = Math.round((dayStart - seriesStart) / DAY_MS);
        const close = closeOf(dayIndex, dayStart);
        const prev = dayIndex > 0 ? closeOf(dayIndex - 1, dayStart - DAY_MS) : close;
        out.push([dayStart, prev, Math.max(prev, close), Math.min(prev, close), close, 1_000]);
      }
      dayStart += DAY_MS;
    }
    return out;
  };
  const exchangeName = `frame-end-exchange-${name}`;
  const strategyName = `frame-end-strategy-${name}`;
  const frameName = `frame-end-frame-${name}`;
  addExchangeSchema({
    exchangeName,
    getCandles: async (symbol, interval, since, limit) => await getCandlesSampled(getDailyCandles, { symbol, interval, since, limit }),
    formatPrice: async (_s, p) => p.toFixed(8),
    formatQuantity: async (_s, q) => q.toFixed(8),
  });
  addStrategySchema({
    strategyName,
    interval: "1h",
    // a position on every tick without one: after a stop loss the strategy re-enters
    getSignal: async (symbol) => {
      const currentPrice = await getAveragePrice(symbol);
      // within the engine's default SL/TP distance limits; the daily drift (+0.5%/day) never reaches them
      return { position: "long", priceStopLoss: currentPrice * 0.85, priceTakeProfit: currentPrice * 1.19, cost: 1000, minuteEstimatedTime: holdMinutes };
    },
  });
  addFrameSchema({ frameName, interval: "1h", startDate: new Date(frameStart), endDate: new Date(frameEnd) });
  return { exchangeName, strategyName, frameName, frameEnd };
};

/** Runs the backtest; a fatal engine error (process.exit) is turned into a thrown Error */
const runCase = async (schema) => {
  const opened = [], closed = [];
  const realExit = process.exit;
  let exitCode = null;
  process.exit = (code) => { exitCode = code; throw new Error(`process.exit(${code})`); };
  try {
    for await (const result of Backtest.run("FRAMEUSDT", schema)) {
      if (result.action === "opened") opened.push(result);
      if (result.action === "closed") closed.push(result);
    }
  } catch (error) {
    return { opened, closed, fatal: error, exitCode };
  } finally {
    process.exit = realExit;
  }
  return { opened, closed, fatal: null, exitCode };
};

/** Fails the test and returns true on any deviation; false when the position closed on the frame end */
const failedClosedAtFrameEnd = ({ opened, closed, fatal }, schema, fail, expectedOpens = 1) => {
  if (fatal) { fail(`backtest died instead of closing at the frame end: ${fatal.message}`); return true; }
  if (opened.length !== expectedOpens) { fail(`expected ${expectedOpens} opened, got ${opened.length}`); return true; }
  if (closed.length !== opened.length) { fail(`position left open: opened=${opened.length} closed=${closed.length}`); return true; }
  const last = closed[closed.length - 1];
  if (last.closeReason !== "time_expired") { fail(`last close must be time_expired, got ${last.closeReason}`); return true; }
  // closed on the last frame hour at the latest, never before the last timeframe
  if (last.closeTimestamp > schema.frameEnd + 60_000 || last.closeTimestamp < schema.frameEnd - HOUR_MS - 60_000) {
    fail(`close must sit on the frame end ${new Date(schema.frameEnd).toISOString()}, got ${new Date(last.closeTimestamp).toISOString()}`);
    return true;
  }
  return false;
};

const withConfig = async (fn) => {
  setConfig({ ...getDefaultConfig(), CC_MAX_SIGNAL_LIFETIME_MINUTES: Infinity, CC_BACKTEST_STEP_MINUTES: 24 * 60 });
  try { return await fn(); } finally { setConfig(getDefaultConfig()); }
};

test("FRAME END: bounded series (ends on endDate) closes the 30-day position by time_expired", async ({ pass, fail }) => {
  await withConfig(async () => {
    const schema = buildCase("bounded");
    const r = await runCase(schema);
    if (failedClosedAtFrameEnd(r, schema, fail)) return;
    pass(`bounded: closed ${new Date(r.closed[0].closeTimestamp).toISOString()} ${r.closed[0].closeReason}`);
  });
});

test("FRAME END: dead feed (series stops 3 days before endDate) still closes by time_expired at the frame end", async ({ pass, fail }) => {
  await withConfig(async () => {
    const schema = buildCase("dead", { seriesEnd: FRAME_END - 3 * DAY_MS });
    const r = await runCase(schema);
    if (failedClosedAtFrameEnd(r, schema, fail)) return;
    pass(`dead: closed ${new Date(r.closed[0].closeTimestamp).toISOString()} ${r.closed[0].closeReason}`);
  });
});

test("FRAME END: re-entry after a stop loss with a lifetime longer than the rest of the frame closes at the frame end", async ({ pass, fail }) => {
  await withConfig(async () => {
    const schema = buildCase("reentry", { crashDay: 2 });
    const r = await runCase(schema);
    if (r.fatal) return fail(`backtest died: ${r.fatal.message}`);
    if (r.closed.length < 1 || r.closed[0].closeReason !== "stop_loss") return fail(`first close must be the stop loss, got ${JSON.stringify(r.closed.map((c) => c.closeReason))}`);
    if (failedClosedAtFrameEnd(r, schema, fail, r.opened.length)) return;
    if (r.opened.length < 2) return fail(`expected a re-entry after the stop, opened=${r.opened.length}`);
    pass(`reentry: ${r.closed.map((c) => `${c.closeReason}@${new Date(c.closeTimestamp).toISOString()}`).join(", ")}`);
  });
});

test("FRAME END: lifetime 3 days past the frame (inside the gap-fill limit) closes by time_expired", async ({ pass, fail }) => {
  await withConfig(async () => {
    const schema = buildCase("short", { holdMinutes: 13 * 24 * 60 });
    const r = await runCase(schema);
    if (failedClosedAtFrameEnd(r, schema, fail)) return;
    pass(`short: closed ${new Date(r.closed[0].closeTimestamp).toISOString()} ${r.closed[0].closeReason}`);
  });
});

test("FRAME END: source returning [] inside the frame leaves no open position behind", async ({ pass, fail }) => {
  await withConfig(async () => {
    const schema = buildCase("empty", { empty: true });
    const r = await runCase(schema);
    if (r.fatal) return fail(`backtest died: ${r.fatal.message}`);
    if (r.closed.length !== r.opened.length) return fail(`position left open: opened=${r.opened.length} closed=${r.closed.length}`);
    pass(`empty: opened=${r.opened.length} closed=${r.closed.length}`);
  });
});

test("FRAME END: a position whose candle window extends past Date.now() closes at the frame end instead of ticking forever", async ({ pass, fail }) => {
  await withConfig(async () => {
    // frame of 10 full days ending at the last whole hour before now: the 30-day window reaches into the future
    const frameEnd = Math.floor((Date.now() - HOUR_MS) / HOUR_MS) * HOUR_MS;
    const frameStart = frameEnd - 10 * DAY_MS;
    const schema = buildCase("future", { frameStart, frameEnd, seriesEnd: frameEnd + 365 * DAY_MS });
    const r = await runCase(schema);
    if (failedClosedAtFrameEnd(r, schema, fail)) return;
    pass(`future: closed ${new Date(r.closed[0].closeTimestamp).toISOString()} ${r.closed[0].closeReason}`);
  });
});

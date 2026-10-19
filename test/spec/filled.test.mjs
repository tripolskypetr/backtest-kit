import { test } from "worker-testbed";
import { getCandlesFilled, setConfig, getDefaultConfig } from "../../build/index.mjs";

const DAY_MS = 86_400_000;
const DAY0 = Date.UTC(2024, 0, 1);

/** Daily source: day index -> [open, high, low, close, volume]; missing days are gaps */
const makeDailySource = (days) => async (_symbol, _interval, since, limit) => {
  const out = [];
  for (let d = 0; out.length < limit && d < 1000; d++) {
    const ts = Math.ceil(since / DAY_MS) * DAY_MS + d * DAY_MS;
    const bar = days[(ts - DAY0) / DAY_MS];
    if (bar) out.push([ts, ...bar]);
    if (ts > DAY0 + 30 * DAY_MS) break;
  }
  return out;
};

const SANE = [100, 110, 90, 105, 1000];
const BROKEN_LOW = [100, 110, 0.0004, 105, 1000]; // low 2500x below price (Yahoo bad tick)

test("getCandlesFilled: a single anomalous candle is repaired like a gap", async ({ pass, fail }) => {
  const fetchOHLCV = makeDailySource({ 0: SANE, 1: BROKEN_LOW, 2: [106, 112, 101, 108, 1000] });
  const candles = await getCandlesFilled(fetchOHLCV, { symbol: "X", interval: "1d", since: new Date(DAY0), limit: 3 });
  const [, repaired, after] = candles;
  if (repaired.open !== 105 || repaired.high !== 105 || repaired.low !== 105 || repaired.close !== 105 || repaired.volume !== 0) {
    return fail(`anomalous day must be a flat bar at the previous close with zero volume, got ${JSON.stringify(repaired)}`);
  }
  if (after.close !== 108) return fail("the following sane day must be kept as is");
  pass("bad-tick day replaced by a flat bar at 105, next day intact");
});

test("getCandlesFilled: anomalous candle at the window start is filled from history before the window", async ({ pass, fail }) => {
  const fetchOHLCV = makeDailySource({ 0: [50, 55, 45, 52, 1000], 1: BROKEN_LOW, 2: SANE });
  const candles = await getCandlesFilled(fetchOHLCV, { symbol: "X", interval: "1d", since: new Date(DAY0 + DAY_MS), limit: 2 });
  if (candles[0].close !== 52 || candles[0].volume !== 0) return fail(`expected flat fill at 52 from day 0, got ${JSON.stringify(candles[0])}`);
  pass("start anomaly filled from the last close before the window");
});

test("getCandlesFilled: more than maxAnomalyStreak anomalous candles in a row throw", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());
  const fetchOHLCV = makeDailySource({ 0: SANE, 1: BROKEN_LOW, 2: BROKEN_LOW, 3: BROKEN_LOW, 4: BROKEN_LOW, 5: SANE });
  try {
    await getCandlesFilled(fetchOHLCV, { symbol: "X", interval: "1d", since: new Date(DAY0), limit: 6 });
    return fail("4 anomalous days in a row must exceed the default streak of 3");
  } catch (error) {
    if (!String(error.message).includes("anomalous candles in a row")) return fail(`wrong error: ${error.message}`);
  }
  // exactly 3 in a row is tolerated by the default
  const ok = makeDailySource({ 0: SANE, 1: BROKEN_LOW, 2: BROKEN_LOW, 3: BROKEN_LOW, 4: SANE });
  const candles = await getCandlesFilled(ok, { symbol: "X", interval: "1d", since: new Date(DAY0), limit: 5 });
  if (candles.slice(1, 4).some((c) => c.close !== 105 || c.volume !== 0)) return fail("3 anomalous days must be flat-filled");
  pass("streak of 4 throws, streak of 3 is repaired (CC_GET_CANDLES_MAX_ANOMALY_STREAK = 3)");
});

test("getCandlesFilled: maxAnomalyStreak config overrides the GLOBAL_CONFIG default", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());
  const fetchOHLCV = makeDailySource({ 0: SANE, 1: BROKEN_LOW, 2: SANE });
  try {
    await getCandlesFilled(fetchOHLCV, { symbol: "X", interval: "1d", since: new Date(DAY0), limit: 3 }, { maxAnomalyStreak: 0 });
    return fail("maxAnomalyStreak = 0 must throw on the first anomalous candle");
  } catch (error) {
    if (!String(error.message).includes("maxAnomalyStreak=0")) return fail(`wrong error: ${error.message}`);
  }
  const wide = makeDailySource({ 0: SANE, 1: BROKEN_LOW, 2: BROKEN_LOW, 3: BROKEN_LOW, 4: BROKEN_LOW, 5: SANE });
  const candles = await getCandlesFilled(wide, { symbol: "X", interval: "1d", since: new Date(DAY0), limit: 6 }, { maxAnomalyStreak: 10 });
  if (candles.length !== 6) return fail("a wide per-call limit must repair the 4-day streak");
  pass("per-call maxAnomalyStreak 0 throws immediately, 10 repairs a 4-day streak");
});

test("getCandlesFilled: a sane candle resets the streak, a plain gap does not count", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());
  // 2 broken, sane, 2 broken, gap, 2 broken: never more than 3 in a row
  const fetchOHLCV = makeDailySource({
    0: SANE, 1: BROKEN_LOW, 2: BROKEN_LOW, 3: SANE, 4: BROKEN_LOW, 5: BROKEN_LOW, 7: BROKEN_LOW, 8: SANE,
  });
  const candles = await getCandlesFilled(fetchOHLCV, { symbol: "X", interval: "1d", since: new Date(DAY0), limit: 9 });
  if (candles.length !== 9) return fail("expected 9 candles");
  if (candles[6].volume !== 0 || candles[7].volume !== 0) return fail("gap and anomaly must both be flat-filled");
  pass("streaks of 2 and 3 (with a gap inside) are tolerated");
});

test("getCandlesFilled: non-finite / high<low / negative volume rows are anomalous", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());
  const fetchOHLCV = makeDailySource({
    0: SANE,
    1: [100, NaN, 90, 105, 1000],
    2: [100, 90, 110, 105, 1000],   // high < low
    3: [100, 110, 90, 105, -1],     // negative volume
    4: SANE,
  });
  const candles = await getCandlesFilled(fetchOHLCV, { symbol: "X", interval: "1d", since: new Date(DAY0), limit: 5 });
  if (candles.slice(1, 4).some((c) => c.close !== 105 || c.volume !== 0)) return fail("all three rows must be repaired");
  pass("NaN, inverted high/low and negative volume are treated as anomalies");
});

test("getCandlesFilled: the fill price before the window skips an anomalous close", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());
  // day 0 sane (close 52), day 1 has a broken CLOSE (0.0004) but positive, day 2 broken low, day 3 sane.
  // Window starts at day 2: its start candle is anomalous, so the fill price is looked up before
  // the window - it must be day 0's close, not day 1's broken close.
  const fetchOHLCV = makeDailySource({
    0: [50, 55, 45, 52, 1000],
    1: [50, 55, 45, 0.0004, 1000],
    2: BROKEN_LOW,
    3: SANE,
  });
  const candles = await getCandlesFilled(fetchOHLCV, { symbol: "X", interval: "1d", since: new Date(DAY0 + 2 * DAY_MS), limit: 2 });
  if (candles[0].close !== 52 || candles[0].volume !== 0) return fail(`fill price must be 52 (last sane close), got ${JSON.stringify(candles[0])}`);
  if (candles[1].close !== 105) return fail("day 3 must be kept");
  pass("broken close before the window is not used as the fill price");
});

test("getCandlesFilled: a row without volume throws a dedicated error", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());
  const fetchOHLCV = makeDailySource({ 0: SANE, 1: [100, 110, 90, 105, undefined], 2: SANE });
  try {
    await getCandlesFilled(fetchOHLCV, { symbol: "X", interval: "1d", since: new Date(DAY0), limit: 3 });
    return fail("a row without volume must throw");
  } catch (error) {
    const message = String(error.message);
    if (!message.includes("has no volume")) return fail(`wrong error: ${message}`);
    if (message.includes("anomalous candles in a row")) return fail("must not be reported as an anomaly streak");
  }
  pass("missing volume reported as a source contract violation with its own message");
});

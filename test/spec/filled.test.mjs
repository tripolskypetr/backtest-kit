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

test("getCandlesFilled: a broken stretch before the window counts toward the streak", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());
  // day 0 sane, days 1..29 broken, window = days 30..31 (30 broken, 31 sane).
  // Per-window counting would see ONE anomaly and fill day 30 from day 0's close, a month old.
  const days = { 0: [50, 55, 45, 52, 1000], 31: SANE };
  for (let d = 1; d <= 30; d++) days[d] = BROKEN_LOW;
  const fetchOHLCV = makeDailySource(days);
  try {
    await getCandlesFilled(fetchOHLCV, { symbol: "X", interval: "1d", since: new Date(DAY0 + 30 * DAY_MS), limit: 2 });
    return fail("29 broken days before the window + 1 inside must exceed the streak of 3");
  } catch (error) {
    if (!String(error.message).includes("anomalous candles in a row")) return fail(`wrong error: ${error.message}`);
  }
  pass("month of broken bars is rejected even though the window itself holds a single anomaly");
});

test("getCandlesFilled: streak across the boundary is exact at the limit", async ({ pass, fail }) => {
  setConfig(getDefaultConfig()); // limit 3
  // 2 broken before + 1 broken at window start = 3 -> tolerated, filled from day 0 close
  const ok = makeDailySource({ 0: [50, 55, 45, 52, 1000], 1: BROKEN_LOW, 2: BROKEN_LOW, 3: BROKEN_LOW, 4: SANE });
  const candles = await getCandlesFilled(ok, { symbol: "X", interval: "1d", since: new Date(DAY0 + 3 * DAY_MS), limit: 2 });
  if (candles[0].close !== 52 || candles[0].volume !== 0 || candles[1].close !== 105) {
    return fail(`streak of exactly 3 must be repaired from day 0, got ${JSON.stringify(candles)}`);
  }
  // 3 broken before + 1 broken at window start = 4 -> throws
  const bad = makeDailySource({ 0: [50, 55, 45, 52, 1000], 1: BROKEN_LOW, 2: BROKEN_LOW, 3: BROKEN_LOW, 4: BROKEN_LOW, 5: SANE });
  try {
    await getCandlesFilled(bad, { symbol: "X", interval: "1d", since: new Date(DAY0 + 4 * DAY_MS), limit: 2 });
    return fail("3 broken before + 1 inside = 4 must throw");
  } catch (error) {
    if (!String(error.message).includes("anomalous candles in a row")) return fail(`wrong error: ${error.message}`);
  }
  pass("2+1 across the boundary passes, 3+1 throws");
});

test("getCandlesFilled: a gap at the window start does not reset the streak from history", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());
  // day 0 sane, days 1..4 broken, day 5 MISSING (window start), day 6 sane
  const fetchOHLCV = makeDailySource({ 0: [50, 55, 45, 52, 1000], 1: BROKEN_LOW, 2: BROKEN_LOW, 3: BROKEN_LOW, 4: BROKEN_LOW, 6: SANE });
  try {
    await getCandlesFilled(fetchOHLCV, { symbol: "X", interval: "1d", since: new Date(DAY0 + 5 * DAY_MS), limit: 2 });
    return fail("4 broken rows before a gap must still exceed the streak");
  } catch (error) {
    if (!String(error.message).includes("anomalous candles in a row before")) return fail(`wrong error: ${error.message}`);
  }
  pass("history streak of 4 behind a gap throws");
});

test("getCandlesFilled: a sane window start ignores broken history", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());
  const days = { 0: [50, 55, 45, 52, 1000], 20: SANE, 21: SANE };
  for (let d = 1; d < 20; d++) days[d] = BROKEN_LOW;
  const candles = await getCandlesFilled(makeDailySource(days), { symbol: "X", interval: "1d", since: new Date(DAY0 + 20 * DAY_MS), limit: 2 });
  if (candles.length !== 2 || candles[0].close !== 105) return fail("a sane start candle must not trigger the lookback");
  pass("sane window start: no lookback, no streak");
});

test("getCandlesFilled: sequential 1-bar windows over a broken stretch throw at the 4th bar", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());
  // Engine-like access pattern: one native bar per request, day after day.
  const days = { 0: [50, 55, 45, 52, 1000], 11: SANE };
  for (let d = 1; d <= 10; d++) days[d] = BROKEN_LOW;
  const fetchOHLCV = makeDailySource(days);
  let filled = 0;
  for (let d = 1; d <= 10; d++) {
    try {
      const [candle] = await getCandlesFilled(fetchOHLCV, { symbol: "X", interval: "1d", since: new Date(DAY0 + d * DAY_MS), limit: 1 });
      if (candle.close !== 52 || candle.volume !== 0) return fail(`day ${d}: expected flat fill at 52, got ${JSON.stringify(candle)}`);
      filled += 1;
    } catch (error) {
      if (!String(error.message).includes("anomalous candles in a row")) return fail(`day ${d}: wrong error: ${error.message}`);
      if (d !== 4) return fail(`expected the throw on day 4 (streak 3 before + 1), got it on day ${d}`);
      return pass(`days 1..3 repaired, day ${d} rejected: a broken stretch cannot be laundered by 1-bar windows`);
    }
  }
  fail(`all 10 broken days were silently filled (${filled})`);
});

test("getCandlesFilled: a gap up to maxGapStreak is filled, a longer one throws", async ({ pass, fail }) => {
  setConfig(getDefaultConfig()); // CC_GET_CANDLES_MAX_GAP_STREAK = 7
  // day 0 sane, days 1..7 missing (7), day 8 sane -> filled
  const ok = makeDailySource({ 0: SANE, 8: [106, 112, 101, 108, 1000] });
  const candles = await getCandlesFilled(ok, { symbol: "X", interval: "1d", since: new Date(DAY0), limit: 9 });
  if (candles.length !== 9 || candles.slice(1, 8).some((c) => c.close !== 105 || c.volume !== 0) || candles[8].close !== 108) {
    return fail("a 7-day gap must be filled flat from day 0");
  }
  // days 1..8 missing (8) -> throws
  const bad = makeDailySource({ 0: SANE, 9: SANE });
  try {
    await getCandlesFilled(bad, { symbol: "X", interval: "1d", since: new Date(DAY0), limit: 10 });
    return fail("an 8-day gap must exceed maxGapStreak=7");
  } catch (error) {
    if (!String(error.message).includes("without a sane source row")) return fail(`wrong error: ${error.message}`);
  }
  pass("gap of 7 filled, gap of 8 rejected (CC_GET_CANDLES_MAX_GAP_STREAK = 7)");
});

test("getCandlesFilled: the gap streak is counted across the window boundary", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());
  // day 0 sane, days 1..10 missing, window = days 8..9 (both missing): 7 missing before + 1 = 8 > 7
  const dead = makeDailySource({ 0: SANE, 11: SANE });
  try {
    await getCandlesFilled(dead, { symbol: "X", interval: "1d", since: new Date(DAY0 + 8 * DAY_MS), limit: 2 });
    return fail("7 missing days before the window + 1 inside must exceed maxGapStreak=7");
  } catch (error) {
    if (!String(error.message).includes("without a sane source row")) return fail(`wrong error: ${error.message}`);
  }
  // window = days 6..7: 5 missing before + 2 inside = 7 -> filled
  const candles = await getCandlesFilled(dead, { symbol: "X", interval: "1d", since: new Date(DAY0 + 6 * DAY_MS), limit: 2 });
  if (candles.length !== 2 || candles.some((c) => c.close !== 105 || c.volume !== 0)) return fail("5 before + 2 inside = 7 must be filled");
  pass("5+2 across the boundary passes, 7+1 throws");
});

test("getCandlesFilled: sequential 1-bar windows over a dead feed throw at the 8th bar", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());
  // Engine-like access pattern over a delisted symbol: day 0 sane, nothing afterwards
  const dead = makeDailySource({ 0: SANE });
  for (let d = 1; d <= 12; d++) {
    try {
      const [candle] = await getCandlesFilled(dead, { symbol: "X", interval: "1d", since: new Date(DAY0 + d * DAY_MS), limit: 1 });
      if (candle.close !== 105 || candle.volume !== 0) return fail(`day ${d}: expected flat fill at 105`);
    } catch (error) {
      if (!String(error.message).includes("without a sane source row")) return fail(`day ${d}: wrong error: ${error.message}`);
      if (d !== 8) return fail(`expected the throw on day 8 (7 missing before + 1), got it on day ${d}`);
      return pass("days 1..7 filled, day 8 rejected: a dead feed cannot be laundered by 1-bar windows");
    }
  }
  fail("12 days of a dead feed were silently filled");
});

test("getCandlesFilled: missing and anomalous rows share the gap streak", async ({ pass, fail }) => {
  setConfig(getDefaultConfig()); // anomaly limit 3, gap limit 7
  // alternating anomalous / missing: 4 anomalous rows (gaps do not reset the anomaly streak, so the
  // anomaly limit is lifted here) and 8 positions without a sane candle -> the gap streak must fire
  const days = { 0: SANE, 9: SANE };
  for (let d = 1; d <= 8; d += 2) days[d] = BROKEN_LOW;
  try {
    await getCandlesFilled(makeDailySource(days), { symbol: "X", interval: "1d", since: new Date(DAY0), limit: 10 }, { maxAnomalyStreak: 10 });
    return fail("8 positions without a sane candle must exceed maxGapStreak=7 even if anomalies alternate with gaps");
  } catch (error) {
    if (!String(error.message).includes("without a sane source row")) return fail(`wrong error: ${error.message}`);
  }
  pass("alternating broken/missing rows are capped by the gap streak");
});

test("getCandlesFilled: maxGapStreak config overrides the default (0 and Infinity)", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());
  const src = makeDailySource({ 0: SANE, 2: SANE });
  try {
    await getCandlesFilled(src, { symbol: "X", interval: "1d", since: new Date(DAY0), limit: 3 }, { maxGapStreak: 0 });
    return fail("maxGapStreak = 0 must throw on the first missing row");
  } catch (error) {
    if (!String(error.message).includes("maxGapStreak=0")) return fail(`wrong error: ${error.message}`);
  }
  const dead = makeDailySource({ 0: SANE });
  const candles = await getCandlesFilled(dead, { symbol: "X", interval: "1d", since: new Date(DAY0), limit: 60 }, { maxGapStreak: Infinity });
  if (candles.length !== 60) return fail("Infinity must restore the unbounded fill");
  pass("per-call maxGapStreak 0 throws immediately, Infinity fills 59 missing days");
});

test("getCandlesFilled: a genuine crash (10-100x daily steps, 800000x overall) is NOT an anomaly", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());
  // LUNA-like: 80 -> 60 -> 30 -> 17 -> 1 -> 0.01 -> 0.0001 -> 0.0001 -> 0.0001
  const closes = [80, 60, 30, 17, 1, 0.01, 0.0001, 0.0001, 0.0001];
  const days = {};
  closes.forEach((c, i) => { days[i] = [c * 1.2, c * 1.3, c * 0.9, c, 1000]; });
  const fetchOHLCV = makeDailySource(days);
  const wide = await getCandlesFilled(fetchOHLCV, { symbol: "LUNA", interval: "1d", since: new Date(DAY0), limit: 9 });
  if (wide.some((c, i) => c.close !== closes[i] || c.volume !== 1000)) return fail(`crash bars must be returned as-is, got ${JSON.stringify(wide.map((c) => c.close))}`);
  for (let d = 0; d < 9; d++) {
    const [bar] = await getCandlesFilled(fetchOHLCV, { symbol: "LUNA", interval: "1d", since: new Date(DAY0 + d * DAY_MS), limit: 1 });
    if (bar.close !== closes[d] || bar.volume !== 1000) return fail(`day ${d}: crash bar replaced, got ${JSON.stringify(bar)}`);
  }
  pass("800000x crash over 9 days passes untouched in wide and 1-bar windows");
});

test("getCandlesFilled: a bad tick is caught against its neighbours, even in a 1-row window", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());
  const fetchOHLCV = makeDailySource({ 0: SANE, 1: BROKEN_LOW, 2: SANE });
  const [bar] = await getCandlesFilled(fetchOHLCV, { symbol: "X", interval: "1d", since: new Date(DAY0 + DAY_MS), limit: 1 });
  if (bar.close !== 105 || bar.volume !== 0 || bar.low !== 105) return fail(`broken low must be repaired flat from day 0, got ${JSON.stringify(bar)}`);
  const spike = makeDailySource({ 0: SANE, 1: [100, 500_000, 90, 105, 1000], 2: SANE });
  const candles = await getCandlesFilled(spike, { symbol: "X", interval: "1d", since: new Date(DAY0), limit: 3 });
  if (candles[1].high !== 105 || candles[1].volume !== 0) return fail("a 5000x high spike must be repaired");
  pass("bad low in a 1-row window and bad high spike are both repaired");
});

test("getCandlesFilled: two adjacent bars broken in every price are still caught by the 5-bar local window", async ({ pass, fail }) => {
  setConfig(getDefaultConfig());
  const allBroken = [0.0004, 0.0005, 0.0003, 0.0004, 1000];
  const fetchOHLCV = makeDailySource({ 0: SANE, 1: SANE, 2: allBroken, 3: allBroken, 4: SANE, 5: SANE });
  const candles = await getCandlesFilled(fetchOHLCV, { symbol: "X", interval: "1d", since: new Date(DAY0), limit: 6 });
  if (candles[2].close !== 105 || candles[3].close !== 105 || candles[2].volume !== 0 || candles[3].volume !== 0) {
    return fail(`both all-broken bars must be repaired, got ${JSON.stringify(candles.slice(2, 4))}`);
  }
  pass("2 of 5 broken in the local window: median stays sane, both repaired");
});

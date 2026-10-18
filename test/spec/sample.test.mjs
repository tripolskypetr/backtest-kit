import { test } from "worker-testbed";
import { getCandlesSampled } from "../../build/index.mjs";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const DAY0 = Date.UTC(2024, 0, 1);

/** Daily source: day index -> [ts, open, high, low, close, volume]; missing days are gaps */
const makeDailySource = (days) => {
  const calls = [];
  const fetchOHLCV = async (symbol, interval, since, limit) => {
    calls.push({ symbol, interval, since, limit });
    if (interval !== "1d") throw new Error(`source only has 1d, asked for ${interval}`);
    const out = [];
    for (let d = 0; out.length < limit && d < 1000; d++) {
      const ts = Math.ceil(since / DAY_MS) * DAY_MS + d * DAY_MS;
      const bar = days[(ts - DAY0) / DAY_MS];
      if (bar) out.push([ts, ...bar]);
      if (ts > DAY0 + 30 * DAY_MS) break;
    }
    return out;
  };
  return { fetchOHLCV, calls };
};

test("getCandlesSampled: 1d -> 1m copies the daily bar into every minute", async ({ pass, fail }) => {
  const { fetchOHLCV, calls } = makeDailySource({
    0: [100, 110, 90, 105, 1440 * 10],
    1: [105, 120, 100, 115, 1440 * 20],
  });

  const candles = await getCandlesSampled(fetchOHLCV, {
    symbol: "AAPL",
    interval: "1m",
    since: new Date(DAY0),
    limit: 2 * 1440,
  });

  if (candles.length !== 2880) return fail(`expected 2880 candles, got ${candles.length}`);
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const day = i < 1440 ? 0 : 1;
    const [open, high, low, close, volume] = day === 0
      ? [100, 110, 90, 105, 10] : [105, 120, 100, 115, 20];
    if (c.timestamp !== DAY0 + i * MINUTE_MS) return fail(`candle ${i}: bad timestamp`);
    if (c.open !== open || c.high !== high || c.low !== low || c.close !== close) {
      return fail(`candle ${i}: OHLC ${JSON.stringify(c)} does not match day ${day}`);
    }
    if (c.volume !== volume) return fail(`candle ${i}: volume ${c.volume}, expected daily/1440 = ${volume}`);
  }
  if (calls.some((c) => c.interval !== "1d")) return fail("source must be fetched as 1d only");
  pass("2 daily bars sampled into 2880 1m candles, volume split per minute");
});

test("getCandlesSampled: unaligned since starts mid-day and crosses into the next bar", async ({ pass, fail }) => {
  const { fetchOHLCV } = makeDailySource({
    0: [100, 110, 90, 105, 1440],
    1: [105, 120, 100, 115, 1440],
  });

  const since = new Date(DAY0 + 12 * HOUR_MS + 30_000); // 12:00:30 -> first candle 12:01
  const candles = await getCandlesSampled(fetchOHLCV, {
    symbol: "AAPL",
    interval: "1m",
    since,
    limit: 1440,
  });

  if (candles[0].timestamp !== DAY0 + 12 * HOUR_MS + MINUTE_MS) return fail("first candle must be aligned up to 12:01");
  const day0Count = candles.filter((c) => c.close === 105).length;
  const day1Count = candles.filter((c) => c.close === 115).length;
  if (day0Count !== 719 || day1Count !== 721) return fail(`expected 719 day-0 and 721 day-1 minutes, got ${day0Count}/${day1Count}`);
  pass("mid-day since: minutes 12:01..23:59 copy day 0, 00:00..12:00 copy day 1");
});

test("getCandlesSampled: 1d -> 1h splits volume by 24", async ({ pass, fail }) => {
  const { fetchOHLCV } = makeDailySource({ 0: [100, 110, 90, 105, 240] });
  const candles = await getCandlesSampled(fetchOHLCV, {
    symbol: "AAPL",
    interval: "1h",
    since: new Date(DAY0),
    limit: 24,
  });
  if (candles.length !== 24) return fail(`expected 24, got ${candles.length}`);
  if (candles.some((c) => c.volume !== 10)) return fail("hourly volume must be daily / 24");
  if (candles[23].timestamp !== DAY0 + 23 * HOUR_MS) return fail("hourly grid broken");
  pass("24 hourly candles, volume 10 each");
});

test("getCandlesSampled: a missing source day is filled flat from the previous close", async ({ pass, fail }) => {
  const { fetchOHLCV } = makeDailySource({
    0: [100, 110, 90, 105, 1440],
    // day 1 missing (holiday)
    2: [107, 120, 100, 115, 1440],
  });
  const candles = await getCandlesSampled(fetchOHLCV, {
    symbol: "AAPL",
    interval: "1m",
    since: new Date(DAY0),
    limit: 3 * 1440,
  });
  const gap = candles.slice(1440, 2880);
  if (gap.some((c) => c.open !== 105 || c.high !== 105 || c.low !== 105 || c.close !== 105 || c.volume !== 0)) {
    return fail("gap day must be a flat bar at the previous close with zero volume");
  }
  if (candles[2880].close !== 115) return fail("day 2 must resume real data");
  pass("holiday filled flat without look-ahead via getCandlesFilled");
});

test("getCandlesSampled: rejects intervals that do not divide the source", async ({ pass, fail }) => {
  const { fetchOHLCV } = makeDailySource({ 0: [100, 110, 90, 105, 1] });
  for (const interval of ["7m", "1d", "2d"]) {
    try {
      await getCandlesSampled(fetchOHLCV, { symbol: "AAPL", interval, since: new Date(DAY0), limit: 1 });
      return fail(`interval ${interval} must be rejected`);
    } catch (error) {
      if (!String(error.message).includes("getCandlesSampled")) return fail(`wrong error for ${interval}: ${error.message}`);
    }
  }
  pass("7m (not a divisor), 1d (equal) and 2d (larger) are rejected");
});

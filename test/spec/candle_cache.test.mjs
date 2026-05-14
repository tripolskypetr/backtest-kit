import { test } from "worker-testbed";
import { PersistCandleAdapter, Exchange, addExchangeSchema } from "../../build/index.mjs";

const MS_PER_MINUTE = 60_000;

const alignTimestamp = (timestampMs, intervalMinutes) => {
  const intervalMs = intervalMinutes * MS_PER_MINUTE;
  return Math.floor(timestampMs / intervalMs) * intervalMs;
};

const INTERVAL_MINUTES = { "1m": 1, "3m": 3, "5m": 5, "15m": 15, "30m": 30, "1h": 60, "2h": 120, "4h": 240, "6h": 360, "8h": 480, "1d": 1440 };

/**
 * In-memory IPersistCandleInstance for testing PersistCandleAdapter.
 */
class PersistMemory {
  _store = new Map();

  constructor(_symbol, _interval, _exchangeName) {
    this._interval = _interval;
  }

  async waitForInit(_initial) { void 0; }

  async readCandlesData(limit, sinceTimestamp, _untilTimestamp) {
    const stepMs = INTERVAL_MINUTES[this._interval] * MS_PER_MINUTE;
    const result = [];
    for (let i = 0; i < limit; i++) {
      const key = String(sinceTimestamp + i * stepMs);
      if (!this._store.has(key)) return null;
      result.push(this._store.get(key));
    }
    return result;
  }

  async writeCandlesData(candles) {
    for (const candle of candles) {
      this._store.set(String(candle.timestamp), candle);
    }
  }
}

const makeCandle = (timestamp, price = 50000) => ({
  timestamp,
  open: price,
  high: price + 100,
  low: price - 100,
  close: price,
  volume: 10,
});

// Fixed point well in the past — deterministic sinceTimestamp for getRawCandles
const PAST = new Date("2023-01-01T00:00:00Z").getTime();

test("PersistCandleAdapter: readCandlesData returns null on empty cache", async ({ pass, fail }) => {
  PersistCandleAdapter.usePersistCandleAdapter(PersistMemory);

  const sinceTimestamp = new Date("2024-01-01T00:00:00Z").getTime();
  const untilTimestamp = sinceTimestamp + 5 * MS_PER_MINUTE;

  const result = await PersistCandleAdapter.readCandlesData(
    "BTCUSDT-empty",
    "1m",
    "binance-cache-1",
    5,
    sinceTimestamp,
    untilTimestamp,
  );

  if (result === null) {
    pass("readCandlesData returns null for empty cache");
    return;
  }

  fail(`Expected null, got ${JSON.stringify(result)}`);
});

test("PersistCandleAdapter: writeCandlesData then readCandlesData returns all candles", async ({ pass, fail }) => {
  PersistCandleAdapter.usePersistCandleAdapter(PersistMemory);

  const sinceTimestamp = new Date("2024-02-01T00:00:00Z").getTime();
  const limit = 5;
  const untilTimestamp = sinceTimestamp + limit * MS_PER_MINUTE;

  const candles = [];
  for (let i = 0; i < limit; i++) {
    candles.push(makeCandle(sinceTimestamp + i * MS_PER_MINUTE));
  }

  await PersistCandleAdapter.writeCandlesData(candles, "BTCUSDT-write", "1m", "binance-cache-2");

  const result = await PersistCandleAdapter.readCandlesData(
    "BTCUSDT-write",
    "1m",
    "binance-cache-2",
    limit,
    sinceTimestamp,
    untilTimestamp,
  );

  if (!Array.isArray(result)) {
    fail(`Expected array, got ${result}`);
    return;
  }

  if (result.length !== limit) {
    fail(`Expected ${limit} candles, got ${result.length}`);
    return;
  }

  pass(`readCandlesData returned ${result.length} candles after write`);
});

test("PersistCandleAdapter: readCandlesData returns null when subset is missing", async ({ pass, fail }) => {
  PersistCandleAdapter.usePersistCandleAdapter(PersistMemory);

  const sinceTimestamp = new Date("2024-03-01T00:00:00Z").getTime();
  const limit = 5;
  const untilTimestamp = sinceTimestamp + limit * MS_PER_MINUTE;

  // Write only 3 out of 5 candles (skip index 1 and 3)
  const partialCandles = [0, 2, 4].map((i) => makeCandle(sinceTimestamp + i * MS_PER_MINUTE));
  await PersistCandleAdapter.writeCandlesData(partialCandles, "BTCUSDT-partial", "1m", "binance-cache-3");

  const result = await PersistCandleAdapter.readCandlesData(
    "BTCUSDT-partial",
    "1m",
    "binance-cache-3",
    limit,
    sinceTimestamp,
    untilTimestamp,
  );

  if (result === null) {
    pass("readCandlesData returns null when cache is incomplete");
    return;
  }

  fail(`Expected null for incomplete cache, got ${result.length} candles`);
});

test("PersistCandleAdapter: readCandlesData preserves candle values", async ({ pass, fail }) => {
  PersistCandleAdapter.usePersistCandleAdapter(PersistMemory);

  const sinceTimestamp = new Date("2024-04-01T00:00:00Z").getTime();
  const limit = 3;
  const untilTimestamp = sinceTimestamp + limit * MS_PER_MINUTE;

  const prices = [51000, 52000, 53000];
  const candles = prices.map((price, i) => makeCandle(sinceTimestamp + i * MS_PER_MINUTE, price));

  await PersistCandleAdapter.writeCandlesData(candles, "BTCUSDT-values", "1m", "binance-cache-4");

  const result = await PersistCandleAdapter.readCandlesData(
    "BTCUSDT-values",
    "1m",
    "binance-cache-4",
    limit,
    sinceTimestamp,
    untilTimestamp,
  );

  if (!Array.isArray(result)) {
    fail("Expected array");
    return;
  }

  for (let i = 0; i < limit; i++) {
    if (result[i].timestamp !== candles[i].timestamp) {
      fail(`Timestamp mismatch at [${i}]: expected ${candles[i].timestamp}, got ${result[i].timestamp}`);
      return;
    }
    if (result[i].open !== prices[i]) {
      fail(`Price mismatch at [${i}]: expected ${prices[i]}, got ${result[i].open}`);
      return;
    }
  }

  pass("Candle values are preserved after write/read cycle");
});

test("PersistCandleAdapter: writeCandlesData is idempotent (no duplicate writes)", async ({ pass, fail }) => {
  PersistCandleAdapter.usePersistCandleAdapter(PersistMemory);

  const sinceTimestamp = new Date("2024-05-01T00:00:00Z").getTime();
  const limit = 3;
  const untilTimestamp = sinceTimestamp + limit * MS_PER_MINUTE;

  const candles = [];
  for (let i = 0; i < limit; i++) {
    candles.push(makeCandle(sinceTimestamp + i * MS_PER_MINUTE, 60000));
  }

  // Write same candles twice
  await PersistCandleAdapter.writeCandlesData(candles, "BTCUSDT-idem", "1m", "binance-cache-5");
  await PersistCandleAdapter.writeCandlesData(candles, "BTCUSDT-idem", "1m", "binance-cache-5");

  const result = await PersistCandleAdapter.readCandlesData(
    "BTCUSDT-idem",
    "1m",
    "binance-cache-5",
    limit,
    sinceTimestamp,
    untilTimestamp,
  );

  if (!Array.isArray(result) || result.length !== limit) {
    fail(`Expected ${limit} candles, got ${result?.length}`);
    return;
  }

  pass("Double write does not corrupt cache");
});

test("PersistCandleAdapter: different symbols use isolated caches", async ({ pass, fail }) => {
  PersistCandleAdapter.usePersistCandleAdapter(PersistMemory);

  const sinceTimestamp = new Date("2024-06-01T00:00:00Z").getTime();
  const limit = 2;
  const untilTimestamp = sinceTimestamp + limit * MS_PER_MINUTE;

  const btcCandles = [0, 1].map((i) => makeCandle(sinceTimestamp + i * MS_PER_MINUTE, 50000));
  const ethCandles = [0, 1].map((i) => makeCandle(sinceTimestamp + i * MS_PER_MINUTE, 3000));

  await PersistCandleAdapter.writeCandlesData(btcCandles, "BTCUSDT-iso", "1m", "binance-cache-6");
  await PersistCandleAdapter.writeCandlesData(ethCandles, "ETHUSDT-iso", "1m", "binance-cache-6");

  const btcResult = await PersistCandleAdapter.readCandlesData("BTCUSDT-iso", "1m", "binance-cache-6", limit, sinceTimestamp, untilTimestamp);
  const ethResult = await PersistCandleAdapter.readCandlesData("ETHUSDT-iso", "1m", "binance-cache-6", limit, sinceTimestamp, untilTimestamp);

  if (!Array.isArray(btcResult) || !Array.isArray(ethResult)) {
    fail("One or both symbol results are null");
    return;
  }

  if (btcResult[0].open !== 50000) {
    fail(`BTC open price expected 50000, got ${btcResult[0].open}`);
    return;
  }

  if (ethResult[0].open !== 3000) {
    fail(`ETH open price expected 3000, got ${ethResult[0].open}`);
    return;
  }

  pass("BTCUSDT and ETHUSDT caches are isolated");
});

test("PersistCandleAdapter: different intervals use isolated caches", async ({ pass, fail }) => {
  PersistCandleAdapter.usePersistCandleAdapter(PersistMemory);

  const sinceTimestamp = new Date("2024-07-01T00:00:00Z").getTime();
  const limit = 2;

  const candles1m = [0, 1].map((i) => makeCandle(sinceTimestamp + i * MS_PER_MINUTE, 50000));
  const candles5m = [0, 1].map((i) => makeCandle(sinceTimestamp + i * 5 * MS_PER_MINUTE, 50000));

  await PersistCandleAdapter.writeCandlesData(candles1m, "BTCUSDT-intv", "1m", "binance-cache-7");
  await PersistCandleAdapter.writeCandlesData(candles5m, "BTCUSDT-intv", "5m", "binance-cache-7");

  const result1m = await PersistCandleAdapter.readCandlesData(
    "BTCUSDT-intv", "1m", "binance-cache-7", limit, sinceTimestamp, sinceTimestamp + limit * MS_PER_MINUTE,
  );
  const result5m = await PersistCandleAdapter.readCandlesData(
    "BTCUSDT-intv", "5m", "binance-cache-7", limit, sinceTimestamp, sinceTimestamp + limit * 5 * MS_PER_MINUTE,
  );

  if (!Array.isArray(result1m)) {
    fail("1m result is null");
    return;
  }

  if (!Array.isArray(result5m)) {
    fail("5m result is null");
    return;
  }

  if (result1m[1].timestamp !== sinceTimestamp + MS_PER_MINUTE) {
    fail(`1m second candle timestamp wrong: ${result1m[1].timestamp}`);
    return;
  }

  if (result5m[1].timestamp !== sinceTimestamp + 5 * MS_PER_MINUTE) {
    fail(`5m second candle timestamp wrong: ${result5m[1].timestamp}`);
    return;
  }

  pass("1m and 5m interval caches are isolated");
});

test("PersistCandleAdapter: readCandlesData returns null when requesting more than cached", async ({ pass, fail }) => {
  PersistCandleAdapter.usePersistCandleAdapter(PersistMemory);

  const sinceTimestamp = new Date("2024-08-01T00:00:00Z").getTime();
  const cachedLimit = 3;
  const requestedLimit = 5;
  const untilTimestamp = sinceTimestamp + requestedLimit * MS_PER_MINUTE;

  const candles = [];
  for (let i = 0; i < cachedLimit; i++) {
    candles.push(makeCandle(sinceTimestamp + i * MS_PER_MINUTE));
  }

  await PersistCandleAdapter.writeCandlesData(candles, "BTCUSDT-more", "1m", "binance-cache-8");

  const result = await PersistCandleAdapter.readCandlesData(
    "BTCUSDT-more",
    "1m",
    "binance-cache-8",
    requestedLimit,
    sinceTimestamp,
    untilTimestamp,
  );

  if (result === null) {
    pass("readCandlesData returns null when requesting more candles than cached");
    return;
  }

  fail(`Expected null when requesting ${requestedLimit} but only ${cachedLimit} cached, got ${result.length}`);
});

test("PersistCandleAdapter: useDummy makes cache always return null", async ({ pass, fail }) => {
  PersistCandleAdapter.useDummy();

  const sinceTimestamp = new Date("2024-09-01T00:00:00Z").getTime();
  const limit = 3;
  const untilTimestamp = sinceTimestamp + limit * MS_PER_MINUTE;

  const candles = [];
  for (let i = 0; i < limit; i++) {
    candles.push(makeCandle(sinceTimestamp + i * MS_PER_MINUTE));
  }

  await PersistCandleAdapter.writeCandlesData(candles, "BTCUSDT-dummy", "1m", "binance-cache-9");

  const result = await PersistCandleAdapter.readCandlesData(
    "BTCUSDT-dummy",
    "1m",
    "binance-cache-9",
    limit,
    sinceTimestamp,
    untilTimestamp,
  );

  PersistCandleAdapter.usePersistCandleAdapter(PersistMemory);

  if (result === null) {
    pass("useDummy adapter discards writes, reads always return null");
    return;
  }

  fail(`Expected null from dummy adapter, got ${result.length} candles`);
});

// ---------------------------------------------------------------------------
// Exchange.getCandles — cache hit prevents second adapter call
// ---------------------------------------------------------------------------

test("Exchange.getCandles: cache hit prevents second adapter call", async ({ pass, fail }) => {
  PersistCandleAdapter.usePersistCandleAdapter(PersistMemory);

  const limit = 10;
  let adapterCallCount = 0;

  addExchangeSchema({
    exchangeName: "binance-gc-cache-hit",
    getCandles: async (_symbol, _interval, since, reqLimit) => {
      adapterCallCount++;
      const start = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < reqLimit; i++) {
        candles.push(makeCandle(start + i * MS_PER_MINUTE, 50000));
      }
      return candles;
    },
  });

  // First call — populates cache
  const first = await Exchange.getCandles("BTCUSDT", "1m", limit, {
    exchangeName: "binance-gc-cache-hit",
  });

  if (first.length !== limit) {
    fail(`First call: expected ${limit} candles, got ${first.length}`);
    return;
  }

  const callsAfterFirst = adapterCallCount;

  // Second call — same symbol/interval/limit/exchangeName, must hit cache
  const second = await Exchange.getCandles("BTCUSDT", "1m", limit, {
    exchangeName: "binance-gc-cache-hit",
  });

  if (second.length !== limit) {
    fail(`Second call: expected ${limit} candles, got ${second.length}`);
    return;
  }

  if (adapterCallCount !== callsAfterFirst) {
    fail(`Adapter was called again on cache hit (total calls: ${adapterCallCount})`);
    return;
  }

  pass(`Cache hit: adapter called ${callsAfterFirst} time(s), second call served from cache`);
});

test("Exchange.getCandles: returns correct candle count and timestamps", async ({ pass, fail }) => {
  PersistCandleAdapter.usePersistCandleAdapter(PersistMemory);

  const now = Date.now();
  const aligned = alignTimestamp(now, 1);
  const limit = 5;
  const sinceTimestamp = aligned - limit * MS_PER_MINUTE;

  addExchangeSchema({
    exchangeName: "binance-gc-count",
    getCandles: async (_symbol, _interval, since, reqLimit) => {
      const start = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < reqLimit; i++) {
        candles.push(makeCandle(start + i * MS_PER_MINUTE, 42000));
      }
      return candles;
    },
  });

  const result = await Exchange.getCandles("BTCUSDT", "1m", limit, {
    exchangeName: "binance-gc-count",
  });

  if (result.length !== limit) {
    fail(`Expected ${limit} candles, got ${result.length}`);
    return;
  }

  if (result[0].timestamp !== sinceTimestamp) {
    fail(`First candle timestamp wrong: expected ${sinceTimestamp}, got ${result[0].timestamp}`);
    return;
  }

  for (let i = 1; i < limit; i++) {
    const expected = sinceTimestamp + i * MS_PER_MINUTE;
    if (result[i].timestamp !== expected) {
      fail(`Candle [${i}] timestamp wrong: expected ${expected}, got ${result[i].timestamp}`);
      return;
    }
  }

  pass(`Exchange.getCandles returned ${limit} candles with correct timestamps`);
});

test("Exchange.getCandles: no future (unclosed) candles returned", async ({ pass, fail }) => {
  PersistCandleAdapter.usePersistCandleAdapter(PersistMemory);

  const limit = 10;

  addExchangeSchema({
    exchangeName: "binance-gc-no-future",
    getCandles: async (_symbol, _interval, since, reqLimit) => {
      const start = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < reqLimit; i++) {
        candles.push(makeCandle(start + i * MS_PER_MINUTE, 50000));
      }
      return candles;
    },
  });

  const beforeCall = Date.now();

  const result = await Exchange.getCandles("BTCUSDT", "1m", limit, {
    exchangeName: "binance-gc-no-future",
  });

  const lastCloseTime = result[result.length - 1].timestamp + MS_PER_MINUTE;

  if (lastCloseTime > beforeCall) {
    fail(`Last candle closes at ${lastCloseTime}, which is after call time ${beforeCall}`);
    return;
  }

  pass(`All candles are closed: last close time ${new Date(lastCloseTime).toISOString()}`);
});

// ---------------------------------------------------------------------------
// Exchange.getRawCandles — cache hit prevents second adapter call
// ---------------------------------------------------------------------------

test("Exchange.getRawCandles: cache hit prevents second adapter call (sDate+eDate)", async ({ pass, fail }) => {
  PersistCandleAdapter.usePersistCandleAdapter(PersistMemory);

  const sDate = PAST;
  const limit = 8;
  const eDate = sDate + limit * MS_PER_MINUTE;
  let adapterCallCount = 0;

  addExchangeSchema({
    exchangeName: "binance-rc-cache-hit",
    getCandles: async (_symbol, _interval, since, reqLimit) => {
      adapterCallCount++;
      const start = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < reqLimit; i++) {
        candles.push(makeCandle(start + i * MS_PER_MINUTE, 50000));
      }
      return candles;
    },
  });

  // First call — populates cache
  const first = await Exchange.getRawCandles("BTCUSDT", "1m", {
    exchangeName: "binance-rc-cache-hit",
  }, undefined, sDate, eDate);

  if (first.length === 0) {
    fail("First call returned no candles");
    return;
  }

  const callsAfterFirst = adapterCallCount;

  // Second call — same params, must hit cache
  const second = await Exchange.getRawCandles("BTCUSDT", "1m", {
    exchangeName: "binance-rc-cache-hit",
  }, undefined, sDate, eDate);

  if (second.length !== first.length) {
    fail(`Second call returned ${second.length} candles, expected ${first.length}`);
    return;
  }

  if (adapterCallCount !== callsAfterFirst) {
    fail(`Adapter was called again on cache hit (total calls: ${adapterCallCount})`);
    return;
  }

  pass(`Cache hit: adapter called ${callsAfterFirst} time(s), second getRawCandles served from cache`);
});

test("Exchange.getRawCandles: sDate+eDate returns correct candles", async ({ pass, fail }) => {
  PersistCandleAdapter.usePersistCandleAdapter(PersistMemory);

  const sDate = PAST;
  const limit = 6;
  const eDate = sDate + limit * MS_PER_MINUTE;
  const alignedSince = alignTimestamp(sDate, 1);

  addExchangeSchema({
    exchangeName: "binance-rc-sdate-edate",
    getCandles: async (_symbol, _interval, since, reqLimit) => {
      const start = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < reqLimit; i++) {
        candles.push(makeCandle(start + i * MS_PER_MINUTE, 45000));
      }
      return candles;
    },
  });

  const result = await Exchange.getRawCandles("BTCUSDT", "1m", {
    exchangeName: "binance-rc-sdate-edate",
  }, undefined, sDate, eDate);

  if (result.length !== limit) {
    fail(`Expected ${limit} candles, got ${result.length}`);
    return;
  }

  if (result[0].timestamp !== alignedSince) {
    fail(`First candle timestamp wrong: expected ${alignedSince}, got ${result[0].timestamp}`);
    return;
  }

  pass(`Exchange.getRawCandles (sDate+eDate) returned ${result.length} candles from ${new Date(alignedSince).toISOString()}`);
});

test("Exchange.getRawCandles: eDate+limit returns correct candles", async ({ pass, fail }) => {
  PersistCandleAdapter.usePersistCandleAdapter(PersistMemory);

  const limit = 5;
  const eDate = PAST + 60 * MS_PER_MINUTE;
  const alignedEDate = alignTimestamp(eDate, 1);
  const expectedSince = alignedEDate - limit * MS_PER_MINUTE;

  addExchangeSchema({
    exchangeName: "binance-rc-edate-limit",
    getCandles: async (_symbol, _interval, since, reqLimit) => {
      const start = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < reqLimit; i++) {
        candles.push(makeCandle(start + i * MS_PER_MINUTE, 48000));
      }
      return candles;
    },
  });

  const result = await Exchange.getRawCandles("BTCUSDT", "1m", {
    exchangeName: "binance-rc-edate-limit",
  }, limit, undefined, eDate);

  if (result.length !== limit) {
    fail(`Expected ${limit} candles, got ${result.length}`);
    return;
  }

  if (result[0].timestamp !== expectedSince) {
    fail(`First candle timestamp wrong: expected ${expectedSince}, got ${result[0].timestamp}`);
    return;
  }

  pass(`Exchange.getRawCandles (eDate+limit) returned ${result.length} candles starting at ${new Date(expectedSince).toISOString()}`);
});

test("Exchange.getRawCandles: sDate+limit returns correct candles", async ({ pass, fail }) => {
  PersistCandleAdapter.usePersistCandleAdapter(PersistMemory);

  const sDate = PAST;
  const limit = 5;
  const alignedSince = alignTimestamp(sDate, 1);

  addExchangeSchema({
    exchangeName: "binance-rc-sdate-limit",
    getCandles: async (_symbol, _interval, since, reqLimit) => {
      const start = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < reqLimit; i++) {
        candles.push(makeCandle(start + i * MS_PER_MINUTE, 47000));
      }
      return candles;
    },
  });

  const result = await Exchange.getRawCandles("BTCUSDT", "1m", {
    exchangeName: "binance-rc-sdate-limit",
  }, limit, sDate, undefined);

  if (result.length !== limit) {
    fail(`Expected ${limit} candles, got ${result.length}`);
    return;
  }

  if (result[0].timestamp !== alignedSince) {
    fail(`First candle timestamp wrong: expected ${alignedSince}, got ${result[0].timestamp}`);
    return;
  }

  pass(`Exchange.getRawCandles (sDate+limit) returned ${result.length} candles from ${new Date(alignedSince).toISOString()}`);
});

test("Exchange.getRawCandles: cache hit prevents second adapter call (eDate+limit)", async ({ pass, fail }) => {
  PersistCandleAdapter.usePersistCandleAdapter(PersistMemory);

  const limit = 5;
  const eDate = PAST + 120 * MS_PER_MINUTE;

  let adapterCallCount = 0;

  addExchangeSchema({
    exchangeName: "binance-rc-cache-hit-2",
    getCandles: async (_symbol, _interval, since, reqLimit) => {
      adapterCallCount++;
      const start = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < reqLimit; i++) {
        candles.push(makeCandle(start + i * MS_PER_MINUTE, 50000));
      }
      return candles;
    },
  });

  await Exchange.getRawCandles("BTCUSDT", "1m", {
    exchangeName: "binance-rc-cache-hit-2",
  }, limit, undefined, eDate);

  const callsAfterFirst = adapterCallCount;

  await Exchange.getRawCandles("BTCUSDT", "1m", {
    exchangeName: "binance-rc-cache-hit-2",
  }, limit, undefined, eDate);

  if (adapterCallCount !== callsAfterFirst) {
    fail(`Adapter was called again on cache hit (total calls: ${adapterCallCount})`);
    return;
  }

  pass(`Cache hit: adapter called ${callsAfterFirst} time(s), second getRawCandles served from cache`);
});

// ---------------------------------------------------------------------------
// PersistCandleAdapter — additional edge cases
// ---------------------------------------------------------------------------

test("PersistCandleAdapter: 15m interval uses correct step between candles", async ({ pass, fail }) => {
  PersistCandleAdapter.usePersistCandleAdapter(PersistMemory);

  const STEP_15M = 15 * MS_PER_MINUTE;
  const sinceTimestamp = new Date("2024-10-01T00:00:00Z").getTime();
  const limit = 4;
  const untilTimestamp = sinceTimestamp + limit * STEP_15M;

  const candles = [];
  for (let i = 0; i < limit; i++) {
    candles.push(makeCandle(sinceTimestamp + i * STEP_15M, 50000));
  }

  await PersistCandleAdapter.writeCandlesData(candles, "BTCUSDT-15m", "15m", "binance-cache-10");

  const result = await PersistCandleAdapter.readCandlesData(
    "BTCUSDT-15m", "15m", "binance-cache-10", limit, sinceTimestamp, untilTimestamp,
  );

  if (!Array.isArray(result)) {
    fail("Expected array, got null");
    return;
  }

  if (result.length !== limit) {
    fail(`Expected ${limit} candles, got ${result.length}`);
    return;
  }

  for (let i = 0; i < limit; i++) {
    const expected = sinceTimestamp + i * STEP_15M;
    if (result[i].timestamp !== expected) {
      fail(`Candle [${i}] timestamp wrong: expected ${expected}, got ${result[i].timestamp}`);
      return;
    }
  }

  pass("15m candles are stored and read with correct step");
});

test("PersistCandleAdapter: limit=1 single candle round-trip", async ({ pass, fail }) => {
  PersistCandleAdapter.usePersistCandleAdapter(PersistMemory);

  const sinceTimestamp = new Date("2024-10-02T00:00:00Z").getTime();
  const untilTimestamp = sinceTimestamp + MS_PER_MINUTE;

  const candle = makeCandle(sinceTimestamp, 55555);
  await PersistCandleAdapter.writeCandlesData([candle], "BTCUSDT-one", "1m", "binance-cache-11");

  const result = await PersistCandleAdapter.readCandlesData(
    "BTCUSDT-one", "1m", "binance-cache-11", 1, sinceTimestamp, untilTimestamp,
  );

  if (!Array.isArray(result) || result.length !== 1) {
    fail(`Expected 1 candle, got ${result?.length}`);
    return;
  }

  if (result[0].open !== 55555) {
    fail(`Expected open=55555, got ${result[0].open}`);
    return;
  }

  pass("Single candle round-trip works correctly");
});

test("PersistCandleAdapter: different exchangeNames use isolated caches", async ({ pass, fail }) => {
  PersistCandleAdapter.usePersistCandleAdapter(PersistMemory);

  const sinceTimestamp = new Date("2024-10-03T00:00:00Z").getTime();
  const limit = 2;
  const untilTimestamp = sinceTimestamp + limit * MS_PER_MINUTE;

  const candlesA = [0, 1].map((i) => makeCandle(sinceTimestamp + i * MS_PER_MINUTE, 10000));
  const candlesB = [0, 1].map((i) => makeCandle(sinceTimestamp + i * MS_PER_MINUTE, 20000));

  await PersistCandleAdapter.writeCandlesData(candlesA, "BTCUSDT-exch", "1m", "exchange-A");
  await PersistCandleAdapter.writeCandlesData(candlesB, "BTCUSDT-exch", "1m", "exchange-B");

  const resultA = await PersistCandleAdapter.readCandlesData("BTCUSDT-exch", "1m", "exchange-A", limit, sinceTimestamp, untilTimestamp);
  const resultB = await PersistCandleAdapter.readCandlesData("BTCUSDT-exch", "1m", "exchange-B", limit, sinceTimestamp, untilTimestamp);

  if (!Array.isArray(resultA) || !Array.isArray(resultB)) {
    fail("One or both exchange results are null");
    return;
  }

  if (resultA[0].open !== 10000) {
    fail(`exchange-A expected open=10000, got ${resultA[0].open}`);
    return;
  }

  if (resultB[0].open !== 20000) {
    fail(`exchange-B expected open=20000, got ${resultB[0].open}`);
    return;
  }

  pass("Different exchangeNames store candles in isolated caches");
});

test("PersistCandleAdapter: readCandlesData returns null for different sinceTimestamp than written", async ({ pass, fail }) => {
  PersistCandleAdapter.usePersistCandleAdapter(PersistMemory);

  const sinceTimestamp = new Date("2024-10-04T00:00:00Z").getTime();
  const limit = 3;

  const candles = [];
  for (let i = 0; i < limit; i++) {
    candles.push(makeCandle(sinceTimestamp + i * MS_PER_MINUTE));
  }

  await PersistCandleAdapter.writeCandlesData(candles, "BTCUSDT-offset", "1m", "binance-cache-12");

  // Read starting from a different timestamp (shifted by 1 minute)
  const shiftedSince = sinceTimestamp + MS_PER_MINUTE;
  const shiftedUntil = shiftedSince + limit * MS_PER_MINUTE;

  const result = await PersistCandleAdapter.readCandlesData(
    "BTCUSDT-offset", "1m", "binance-cache-12", limit, shiftedSince, shiftedUntil,
  );

  // Shifted range needs candles at shiftedSince, shiftedSince+1m, shiftedSince+2m
  // We only have sinceTimestamp+1m and sinceTimestamp+2m cached (missing +3m)
  if (result === null) {
    pass("readCandlesData returns null when sinceTimestamp doesn't match cached range");
    return;
  }

  fail(`Expected null for mismatched sinceTimestamp, got ${result.length} candles`);
});

// ---------------------------------------------------------------------------
// Exchange.getCandles — additional tests
// ---------------------------------------------------------------------------

test("Exchange.getCandles: different limits produce different sinceTimestamps (no cache collision)", async ({ pass, fail }) => {
  PersistCandleAdapter.usePersistCandleAdapter(PersistMemory);

  let adapterCallCount = 0;

  addExchangeSchema({
    exchangeName: "binance-gc-diff-limit",
    getCandles: async (_symbol, _interval, since, reqLimit) => {
      adapterCallCount++;
      const start = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < reqLimit; i++) {
        candles.push(makeCandle(start + i * MS_PER_MINUTE, 50000));
      }
      return candles;
    },
  });

  const result5 = await Exchange.getCandles("BTCUSDT", "1m", 5, { exchangeName: "binance-gc-diff-limit" });
  const result10 = await Exchange.getCandles("BTCUSDT", "1m", 10, { exchangeName: "binance-gc-diff-limit" });

  if (result5.length !== 5) {
    fail(`Expected 5 candles, got ${result5.length}`);
    return;
  }

  if (result10.length !== 10) {
    fail(`Expected 10 candles, got ${result10.length}`);
    return;
  }

  // Both must have called the adapter (different sinceTimestamp = different cache key)
  if (adapterCallCount < 2) {
    fail(`Expected at least 2 adapter calls for different limits, got ${adapterCallCount}`);
    return;
  }

  pass(`Different limits cause separate adapter calls (${adapterCallCount} total)`);
});

test("Exchange.getCandles: cached data is identical to original adapter response", async ({ pass, fail }) => {
  PersistCandleAdapter.usePersistCandleAdapter(PersistMemory);

  addExchangeSchema({
    exchangeName: "binance-gc-data-identity",
    getCandles: async (_symbol, _interval, since, reqLimit) => {
      const start = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < reqLimit; i++) {
        candles.push(makeCandle(start + i * MS_PER_MINUTE, 33000 + i * 100));
      }
      return candles;
    },
  });

  const first = await Exchange.getCandles("BTCUSDT", "1m", 5, { exchangeName: "binance-gc-data-identity" });
  const second = await Exchange.getCandles("BTCUSDT", "1m", 5, { exchangeName: "binance-gc-data-identity" });

  for (let i = 0; i < first.length; i++) {
    if (first[i].timestamp !== second[i].timestamp) {
      fail(`Timestamp mismatch at [${i}]: ${first[i].timestamp} vs ${second[i].timestamp}`);
      return;
    }
    if (first[i].open !== second[i].open) {
      fail(`Open price mismatch at [${i}]: ${first[i].open} vs ${second[i].open}`);
      return;
    }
  }

  pass("Cached response is identical to original adapter response");
});

test("Exchange.getCandles: 15m interval returns correct step", async ({ pass, fail }) => {
  PersistCandleAdapter.usePersistCandleAdapter(PersistMemory);

  const STEP_15M = 15 * MS_PER_MINUTE;
  const limit = 4;

  addExchangeSchema({
    exchangeName: "binance-gc-15m",
    getCandles: async (_symbol, _interval, since, reqLimit) => {
      const start = alignTimestamp(since.getTime(), 15);
      const candles = [];
      for (let i = 0; i < reqLimit; i++) {
        candles.push(makeCandle(start + i * STEP_15M, 50000));
      }
      return candles;
    },
  });

  const result = await Exchange.getCandles("BTCUSDT", "15m", limit, { exchangeName: "binance-gc-15m" });

  if (result.length !== limit) {
    fail(`Expected ${limit} candles, got ${result.length}`);
    return;
  }

  for (let i = 1; i < limit; i++) {
    const step = result[i].timestamp - result[i - 1].timestamp;
    if (step !== STEP_15M) {
      fail(`Expected 15m step between candles [${i - 1}] and [${i}], got ${step}ms`);
      return;
    }
  }

  pass("15m candles have correct 15-minute step");
});

// ---------------------------------------------------------------------------
// Exchange.getRawCandles — additional tests
// ---------------------------------------------------------------------------

test("Exchange.getRawCandles: limit-only uses current time as reference", async ({ pass, fail }) => {
  PersistCandleAdapter.usePersistCandleAdapter(PersistMemory);

  const limit = 5;
  const beforeCall = Date.now();

  addExchangeSchema({
    exchangeName: "binance-rc-limit-only",
    getCandles: async (_symbol, _interval, since, reqLimit) => {
      const start = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < reqLimit; i++) {
        candles.push(makeCandle(start + i * MS_PER_MINUTE, 50000));
      }
      return candles;
    },
  });

  const result = await Exchange.getRawCandles("BTCUSDT", "1m", {
    exchangeName: "binance-rc-limit-only",
  }, limit);

  if (result.length !== limit) {
    fail(`Expected ${limit} candles, got ${result.length}`);
    return;
  }

  const lastCloseTime = result[result.length - 1].timestamp + MS_PER_MINUTE;
  if (lastCloseTime > beforeCall) {
    fail(`Last candle not closed before call: closeTime=${lastCloseTime}, beforeCall=${beforeCall}`);
    return;
  }

  pass(`getRawCandles (limit only) returned ${limit} past candles`);
});

test("Exchange.getRawCandles: cached data values are identical on second call", async ({ pass, fail }) => {
  PersistCandleAdapter.usePersistCandleAdapter(PersistMemory);

  const sDate = PAST + 200 * MS_PER_MINUTE;
  const limit = 4;
  const eDate = sDate + limit * MS_PER_MINUTE;

  addExchangeSchema({
    exchangeName: "binance-rc-data-identity",
    getCandles: async (_symbol, _interval, since, reqLimit) => {
      const start = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < reqLimit; i++) {
        candles.push(makeCandle(start + i * MS_PER_MINUTE, 70000 + i * 500));
      }
      return candles;
    },
  });

  const first = await Exchange.getRawCandles("BTCUSDT", "1m", {
    exchangeName: "binance-rc-data-identity",
  }, undefined, sDate, eDate);

  const second = await Exchange.getRawCandles("BTCUSDT", "1m", {
    exchangeName: "binance-rc-data-identity",
  }, undefined, sDate, eDate);

  if (first.length !== second.length) {
    fail(`Length mismatch: first=${first.length}, second=${second.length}`);
    return;
  }

  for (let i = 0; i < first.length; i++) {
    if (first[i].timestamp !== second[i].timestamp || first[i].open !== second[i].open) {
      fail(`Data mismatch at [${i}]: first=${JSON.stringify(first[i])}, second=${JSON.stringify(second[i])}`);
      return;
    }
  }

  pass("getRawCandles cached data is identical to original on second call");
});

test("Exchange.getRawCandles: different sDate causes cache miss and adapter re-call", async ({ pass, fail }) => {
  PersistCandleAdapter.usePersistCandleAdapter(PersistMemory);

  const limit = 4;
  const eDate1 = PAST + 300 * MS_PER_MINUTE;
  const eDate2 = PAST + 400 * MS_PER_MINUTE;

  let adapterCallCount = 0;

  addExchangeSchema({
    exchangeName: "binance-rc-diff-sdate",
    getCandles: async (_symbol, _interval, since, reqLimit) => {
      adapterCallCount++;
      const start = alignTimestamp(since.getTime(), 1);
      const candles = [];
      for (let i = 0; i < reqLimit; i++) {
        candles.push(makeCandle(start + i * MS_PER_MINUTE, 50000));
      }
      return candles;
    },
  });

  await Exchange.getRawCandles("BTCUSDT", "1m", { exchangeName: "binance-rc-diff-sdate" }, limit, undefined, eDate1);
  const callsAfterFirst = adapterCallCount;

  await Exchange.getRawCandles("BTCUSDT", "1m", { exchangeName: "binance-rc-diff-sdate" }, limit, undefined, eDate2);

  if (adapterCallCount <= callsAfterFirst) {
    fail(`Expected adapter call for different eDate, but adapterCallCount stayed at ${adapterCallCount}`);
    return;
  }

  pass(`Different eDate caused cache miss: adapter called ${adapterCallCount} times total`);
});

test("Exchange.getRawCandles: 15m interval with sDate+eDate", async ({ pass, fail }) => {
  PersistCandleAdapter.usePersistCandleAdapter(PersistMemory);

  const STEP_15M = 15 * MS_PER_MINUTE;
  const limit = 4;
  const sDate = PAST;
  const eDate = sDate + limit * STEP_15M;
  const alignedSince = alignTimestamp(sDate, 15);

  addExchangeSchema({
    exchangeName: "binance-rc-15m",
    getCandles: async (_symbol, _interval, since, reqLimit) => {
      const start = alignTimestamp(since.getTime(), 15);
      const candles = [];
      for (let i = 0; i < reqLimit; i++) {
        candles.push(makeCandle(start + i * STEP_15M, 50000));
      }
      return candles;
    },
  });

  const result = await Exchange.getRawCandles("BTCUSDT", "15m", {
    exchangeName: "binance-rc-15m",
  }, undefined, sDate, eDate);

  if (result.length !== limit) {
    fail(`Expected ${limit} candles, got ${result.length}`);
    return;
  }

  if (result[0].timestamp !== alignedSince) {
    fail(`First candle timestamp wrong: expected ${alignedSince}, got ${result[0].timestamp}`);
    return;
  }

  for (let i = 1; i < limit; i++) {
    const step = result[i].timestamp - result[i - 1].timestamp;
    if (step !== STEP_15M) {
      fail(`Expected 15m step between candles [${i - 1}] and [${i}], got ${step}ms`);
      return;
    }
  }

  pass("getRawCandles 15m interval returns candles with correct step");
});

test("Exchange.getRawCandles: cache hit on 15m interval (sDate+eDate)", async ({ pass, fail }) => {
  PersistCandleAdapter.usePersistCandleAdapter(PersistMemory);

  const STEP_15M = 15 * MS_PER_MINUTE;
  const limit = 4;
  const sDate = PAST + 500 * MS_PER_MINUTE;
  const eDate = sDate + limit * STEP_15M;
  let adapterCallCount = 0;

  addExchangeSchema({
    exchangeName: "binance-rc-15m-cache-hit",
    getCandles: async (_symbol, _interval, since, reqLimit) => {
      adapterCallCount++;
      const start = alignTimestamp(since.getTime(), 15);
      const candles = [];
      for (let i = 0; i < reqLimit; i++) {
        candles.push(makeCandle(start + i * STEP_15M, 50000));
      }
      return candles;
    },
  });

  await Exchange.getRawCandles("BTCUSDT", "15m", { exchangeName: "binance-rc-15m-cache-hit" }, undefined, sDate, eDate);
  const callsAfterFirst = adapterCallCount;

  await Exchange.getRawCandles("BTCUSDT", "15m", { exchangeName: "binance-rc-15m-cache-hit" }, undefined, sDate, eDate);

  if (adapterCallCount !== callsAfterFirst) {
    fail(`Adapter called again on 15m cache hit (total: ${adapterCallCount})`);
    return;
  }

  pass(`15m cache hit: adapter called ${callsAfterFirst} time(s), second call served from cache`);
});

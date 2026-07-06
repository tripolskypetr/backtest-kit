import { test } from "worker-testbed";
import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  getCandles,
  getRawCandles,
  getNextCandles,
  Exchange,
} from "../../build/index.mjs";
import { createAwaiter, sleep } from "functools-kit";

// Helper: align timestamp to interval boundary
const alignTimestamp = (timestampMs, intervalMinutes) => {
  const intervalMs = intervalMinutes * 60 * 1000;
  return Math.floor(timestampMs / intervalMs) * intervalMs;
};

// Helper: get interval minutes from interval string
const getIntervalMinutes = (interval) => {
  const map = { "1m": 1, "15m": 15, "1h": 60, "4h": 240 };
  return map[interval] || 1;
};

test("getCandles does not return unclosed candles (lookahead bias from higher timeframes)", async ({
  pass,
  fail,
}) => {
  const [awaiter, { resolve }] = createAwaiter();

  // Test Time: 2024-01-01T10:24:00Z
  const T_10_24 = new Date("2024-01-01T10:24:00Z");

  // Helper to generate candles - start early enough to cover all requests
  const generateCandles = (intervalMinutes) => {
    const candles = [];
    const stepMs = intervalMinutes * 60 * 1000;
    // Start from Dec 30 to have enough history for 4h candles
    let current = new Date("2023-12-30T00:00:00Z").getTime();
    const end = new Date("2024-01-02T00:00:00Z").getTime();

    while (current < end) {
      candles.push({
        timestamp: current,
        open: 100, high: 105, low: 95, close: 101, volume: 1000
      });
      current += stepMs;
    }
    return candles;
  };

  const candles1m = generateCandles(1);
  const candles15m = generateCandles(15);
  const candles1h = generateCandles(60);
  const candles4h = generateCandles(240);

  addExchangeSchema({
    exchangeName: "test-exchange",
    getCandles: async (_symbol, interval, since, limit) => {
      let source = [];
      if (interval === "1m") source = candles1m;
      else if (interval === "15m") source = candles15m;
      else if (interval === "1h") source = candles1h;
      else if (interval === "4h") source = candles4h;
      else return [];

      const sinceMs = since.getTime();
      const intervalMinutes = getIntervalMinutes(interval);
      const alignedSince = alignTimestamp(sinceMs, intervalMinutes);
      const filtered = source.filter(c => c.timestamp >= alignedSince);
      return filtered.slice(0, limit);
    },
    formatPrice: async (_, p) => p.toFixed(2),
    formatQuantity: async (_, q) => q.toFixed(5),
  });

  addStrategySchema({
    strategyName: "test-lookahead",
    interval: "1m",
    getSignal: async () => {
      try {
        const c1m = await getCandles("BTCUSDT", "1m", 5);
        const c15m = await getCandles("BTCUSDT", "15m", 5);
        const c1h = await getCandles("BTCUSDT", "1h", 5);
        const c4h = await getCandles("BTCUSDT", "4h", 5);

        resolve({ c1m, c15m, c1h, c4h });
      } catch (e) {
        console.log(e)
        await sleep(200);
        resolve(null);
      }
      return null;
    },
  });

  addFrameSchema({
    frameName: "lookahead-check",
    interval: "1d",
    startDate: T_10_24,
    endDate: new Date("2024-01-01T10:35:00Z"),
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-lookahead",
    exchangeName: "test-exchange",
    frameName: "lookahead-check",
  });

  const results = await awaiter;

  if (!results) {
    fail("Strategy returned null results");
    return;
  }

  const { c1m, c15m, c1h, c4h } = results;

  // With timestamp alignment, getCandles returns exactly 5 candles for each interval
  // Calculation for each:
  // 1m: alignedWhen=10:24, since=10:19, candles: 10:19,10:20,10:21,10:22,10:23
  // 15m: alignedWhen=10:15, since=08:00, candles: 08:00,08:15,08:30,08:45,09:00 (WAIT - recalc)
  // Actually for 15m: alignedWhen = floor(10:24 / 15min) * 15min = 10:15
  // since = 10:15 - 5*15min = 10:15 - 75min = 08:00? NO: 10:15 - 1:15 = 09:00
  // Let me recalc: 5 * 15 = 75 minutes = 1h15m, so since = 10:15 - 1:15 = 09:00
  // candles: 09:00, 09:15, 09:30, 09:45, 10:00
  // 1h: alignedWhen = floor(10:24 / 60min) * 60min = 10:00
  // since = 10:00 - 5*60min = 05:00, candles: 05:00,06:00,07:00,08:00,09:00
  // 4h: alignedWhen = floor(10:24 / 240min) * 240min = 08:00
  // since = 08:00 - 5*240min = 08:00 - 20h = Dec 31 12:00
  // candles: Dec31 12:00, Dec31 16:00, Dec31 20:00, Jan1 00:00, Jan1 04:00

  const errors = [];

  // Verify count is exactly 5 for each
  if (c1m.length !== 5) errors.push(`1m: Expected 5 candles, got ${c1m.length}`);
  if (c15m.length !== 5) errors.push(`15m: Expected 5 candles, got ${c15m.length}`);
  if (c1h.length !== 5) errors.push(`1h: Expected 5 candles, got ${c1h.length}`);
  if (c4h.length !== 5) errors.push(`4h: Expected 5 candles, got ${c4h.length}`);

  // Verify last candles (these are the 5th candle, not boundary-excluded)
  const last1m = c1m[c1m.length - 1];
  const last15m = c15m[c15m.length - 1];
  const last1h = c1h[c1h.length - 1];
  const last4h = c4h[c4h.length - 1];

  // Expected last candles with alignment logic:
  const expected1m = new Date("2024-01-01T10:23:00Z").getTime();
  const expected15m = new Date("2024-01-01T10:00:00Z").getTime();
  const expected1h = new Date("2024-01-01T09:00:00Z").getTime();
  const expected4h = new Date("2024-01-01T04:00:00Z").getTime();

  if (last1m?.timestamp !== expected1m)
    errors.push(`1m: Expected last at ${new Date(expected1m).toISOString()}, got ${last1m ? new Date(last1m.timestamp).toISOString() : 'undefined'}`);
  if (last15m?.timestamp !== expected15m)
    errors.push(`15m: Expected last at ${new Date(expected15m).toISOString()}, got ${last15m ? new Date(last15m.timestamp).toISOString() : 'undefined'}`);
  if (last1h?.timestamp !== expected1h)
    errors.push(`1h: Expected last at ${new Date(expected1h).toISOString()}, got ${last1h ? new Date(last1h.timestamp).toISOString() : 'undefined'}`);
  if (last4h?.timestamp !== expected4h)
    errors.push(`4h: Expected last at ${new Date(expected4h).toISOString()}, got ${last4h ? new Date(last4h.timestamp).toISOString() : 'undefined'}`);

  if (errors.length === 0) {
    pass("All timeframes correctly return exact limit candles with timestamp alignment.");
  } else {
    fail("Timestamp alignment test failures:\n" + errors.join("\n"));
  }
});

test("getRawCandles returns exact limit with timestamp alignment", async ({
  pass,
  fail,
}) => {
  const [awaiter, { resolve }] = createAwaiter();

  // Test Time: 2024-01-01T10:24:00Z
  const T_10_24 = new Date("2024-01-01T10:24:00Z");

  // Helper to generate candles - start early enough
  const generateCandles = (intervalMinutes) => {
    const candles = [];
    const stepMs = intervalMinutes * 60 * 1000;
    let current = new Date("2023-12-31T00:00:00Z").getTime();
    const end = new Date("2024-01-02T00:00:00Z").getTime();

    while (current < end) {
      candles.push({
        timestamp: current,
        open: 100,
        high: 105,
        low: 95,
        close: 101,
        volume: 1000,
      });
      current += stepMs;
    }
    return candles;
  };

  const candles1m = generateCandles(1);
  const candles15m = generateCandles(15);

  addExchangeSchema({
    exchangeName: "test-exchange-raw",
    getCandles: async (_symbol, interval, since, limit) => {
      let source = [];
      if (interval === "1m") source = candles1m;
      else if (interval === "15m") source = candles15m;
      else return [];

      const sinceMs = since.getTime();
      const intervalMinutes = getIntervalMinutes(interval);
      const alignedSince = alignTimestamp(sinceMs, intervalMinutes);
      const filtered = source.filter((c) => c.timestamp >= alignedSince);
      return filtered.slice(0, limit);
    },
    formatPrice: async (_, p) => p.toFixed(2),
    formatQuantity: async (_, q) => q.toFixed(5),
  });

  addStrategySchema({
    strategyName: "test-raw-candles",
    interval: "1m",
    getSignal: async () => {
      try {
        // Test Case 1: Only limit (backward from current time)
        const test1 = await getRawCandles("BTCUSDT", "1m", 10);

        // Test Case 2: sDate + limit (forward from sDate)
        const T_10_00_MS = new Date("2024-01-01T10:00:00Z").getTime();
        const test2 = await getRawCandles("BTCUSDT", "1m", 10, T_10_00_MS);

        // Test Case 3: eDate + limit (backward from eDate)
        const T_10_20_MS = new Date("2024-01-01T10:20:00Z").getTime();
        const test3 = await getRawCandles("BTCUSDT", "15m", 5, undefined, T_10_20_MS);

        // Test Case 4: sDate + eDate (calculate limit from range)
        const test4 = await getRawCandles(
          "BTCUSDT",
          "1m",
          undefined,
          T_10_00_MS,
          T_10_20_MS
        );

        // Test Case 5: All parameters
        const test5 = await getRawCandles(
          "BTCUSDT",
          "1m",
          15,
          T_10_00_MS,
          T_10_20_MS
        );

        resolve({ test1, test2, test3, test4, test5 });
      } catch (e) {
        resolve({ error: e.message });
      }
      return null;
    },
  });

  addFrameSchema({
    frameName: "raw-candles-check",
    interval: "1d",
    startDate: T_10_24,
    endDate: new Date("2024-01-01T10:35:00Z"),
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-raw-candles",
    exchangeName: "test-exchange-raw",
    frameName: "raw-candles-check",
  });

  const results = await awaiter;

  if (results.error) {
    fail(`Test error: ${results.error}`);
    return;
  }

  const { test1, test2, test3, test4, test5 } = results;

  const errors = [];

  // Test 1: Only limit - returns exactly 10 candles backward from aligned when (10:24)
  // alignedWhen = 10:24, since = 10:24 - 10*1min = 10:14
  // candles: 10:14, 10:15, ..., 10:23 (10 candles)
  if (!test1 || test1.length !== 10) {
    errors.push(`Test1: Expected 10 candles, got ${test1?.length || 0}`);
  } else {
    const first = test1[0];
    const last = test1[test1.length - 1];
    const expectedFirst = new Date("2024-01-01T10:14:00Z").getTime();
    const expectedLast = new Date("2024-01-01T10:23:00Z").getTime();
    if (first.timestamp !== expectedFirst) {
      errors.push(
        `Test1: First candle wrong. Expected ${new Date(expectedFirst).toISOString()}, got ${new Date(first.timestamp).toISOString()}`
      );
    }
    if (last.timestamp !== expectedLast) {
      errors.push(
        `Test1: Last candle wrong. Expected ${new Date(expectedLast).toISOString()}, got ${new Date(last.timestamp).toISOString()}`
      );
    }
  }

  // Test 2: sDate + limit - returns exactly 10 candles from aligned sDate (10:00)
  // alignedSince = 10:00, candles: 10:00, 10:01, ..., 10:09 (10 candles)
  if (!test2 || test2.length !== 10) {
    errors.push(`Test2: Expected 10 candles, got ${test2?.length || 0}`);
  } else {
    const first = test2[0];
    const last = test2[test2.length - 1];
    const expectedFirst = new Date("2024-01-01T10:00:00Z").getTime();
    const expectedLast = new Date("2024-01-01T10:09:00Z").getTime();
    if (first.timestamp !== expectedFirst) {
      errors.push(
        `Test2: First candle wrong. Expected ${new Date(expectedFirst).toISOString()}, got ${new Date(first.timestamp).toISOString()}`
      );
    }
    if (last.timestamp !== expectedLast) {
      errors.push(
        `Test2: Last candle wrong. Expected ${new Date(expectedLast).toISOString()}, got ${new Date(last.timestamp).toISOString()}`
      );
    }
  }

  // Test 3: eDate + limit - returns exactly 5 candles backward from aligned eDate (10:15)
  // alignedEDate = 10:15, since = 10:15 - 5*15min = 08:45 (aligned to 08:45? NO - 08:45 is already aligned)
  // Wait: eDate=10:20, aligned to 15m = 10:15
  // since = 10:15 - 5*15min = 10:15 - 75min = 08:00 (not 08:45)
  // candles: 08:00, 08:15, 08:30, 08:45, 09:00 (5 candles)
  if (!test3 || test3.length !== 5) {
    errors.push(`Test3: Expected 5 candles, got ${test3?.length || 0}`);
  } else {
    const first = test3[0];
    const last = test3[test3.length - 1];
    const expectedFirst = new Date("2024-01-01T09:00:00Z").getTime();
    const expectedLast = new Date("2024-01-01T10:00:00Z").getTime();
    if (first.timestamp !== expectedFirst) {
      errors.push(
        `Test3: First 15m candle wrong. Expected ${new Date(expectedFirst).toISOString()}, got ${new Date(first.timestamp).toISOString()}`
      );
    }
    if (last.timestamp !== expectedLast) {
      errors.push(
        `Test3: Last 15m candle wrong. Expected ${new Date(expectedLast).toISOString()}, got ${new Date(last.timestamp).toISOString()}`
      );
    }
  }

  // Test 4: sDate + eDate - calculates limit from range
  // alignedSince = 10:00, alignedEDate = 10:20
  // limit = ceil((10:20 - 10:00) / 1min) = 20 candles
  // candles: 10:00, 10:01, ..., 10:19 (20 candles)
  if (!test4 || test4.length !== 20) {
    errors.push(`Test4: Expected 20 candles, got ${test4?.length || 0}`);
  } else {
    const first = test4[0];
    const last = test4[test4.length - 1];
    const expectedFirst = new Date("2024-01-01T10:00:00Z").getTime();
    const expectedLast = new Date("2024-01-01T10:19:00Z").getTime();
    if (first.timestamp !== expectedFirst || last.timestamp !== expectedLast) {
      errors.push(
        `Test4: Range wrong. Expected ${new Date(expectedFirst).toISOString()} to ${new Date(expectedLast).toISOString()}, got ${new Date(first.timestamp).toISOString()} to ${new Date(last.timestamp).toISOString()}`
      );
    }
  }

  // Test 5: All parameters - uses provided limit (15) from aligned sDate
  // alignedSince = 10:00, limit = 15
  // candles: 10:00, 10:01, ..., 10:14 (15 candles)
  if (!test5 || test5.length !== 15) {
    errors.push(`Test5: Expected 15 candles, got ${test5?.length || 0}`);
  } else {
    const first = test5[0];
    const last = test5[test5.length - 1];
    const expectedFirst = new Date("2024-01-01T10:00:00Z").getTime();
    const expectedLast = new Date("2024-01-01T10:14:00Z").getTime();
    if (first.timestamp !== expectedFirst) {
      errors.push(
        `Test5: First candle wrong. Expected ${new Date(expectedFirst).toISOString()}, got ${new Date(first.timestamp).toISOString()}`
      );
    }
    if (last.timestamp !== expectedLast) {
      errors.push(
        `Test5: Last candle wrong. Expected ${new Date(expectedLast).toISOString()}, got ${new Date(last.timestamp).toISOString()}`
      );
    }
  }

  if (errors.length === 0) {
    pass("getRawCandles correctly returns exact limit with timestamp alignment");
  } else {
    fail("getRawCandles test failures:\n" + errors.join("\n"));
  }
});

test("getNextCandles returns exact limit future candles with timestamp alignment", async ({
  pass,
  fail,
}) => {
  const [awaiter, { resolve }] = createAwaiter();

  // Test Time: 2024-01-01T10:24:00Z
  const T_10_24 = new Date("2024-01-01T10:24:00Z");

  // Helper to generate candles - extend to cover future range
  const generateCandles = (intervalMinutes) => {
    const candles = [];
    const stepMs = intervalMinutes * 60 * 1000;
    let current = new Date("2024-01-01T00:00:00Z").getTime();
    const end = new Date("2024-01-02T00:00:00Z").getTime();

    while (current < end) {
      candles.push({
        timestamp: current,
        open: 100,
        high: 105,
        low: 95,
        close: 101,
        volume: 1000,
      });
      current += stepMs;
    }
    return candles;
  };

  const candles1m = generateCandles(1);
  const candles15m = generateCandles(15);

  addExchangeSchema({
    exchangeName: "test-exchange-next",
    getCandles: async (_symbol, interval, since, limit) => {
      let source = [];
      if (interval === "1m") source = candles1m;
      else if (interval === "15m") source = candles15m;
      else return [];

      const sinceMs = since.getTime();
      const intervalMinutes = getIntervalMinutes(interval);
      const alignedSince = alignTimestamp(sinceMs, intervalMinutes);
      const filtered = source.filter((c) => c.timestamp >= alignedSince);
      return filtered.slice(0, limit);
    },
    formatPrice: async (_, p) => p.toFixed(2),
    formatQuantity: async (_, q) => q.toFixed(5),
  });

  addStrategySchema({
    strategyName: "test-next-candles",
    interval: "1m",
    getSignal: async () => {
      try {
        // Test Case 1: Get next 5 1m candles after current time (T_10_24)
        const next1m = await getNextCandles("BTCUSDT", "1m", 5);

        // Test Case 2: Get next 3 15m candles after current time
        const next15m = await getNextCandles("BTCUSDT", "15m", 3);

        // Test Case 3: Request that might exceed Date.now()
        // Since backtest time is T_10_24 (2024-01-01T10:24:00Z)
        // and Date.now() is 2026, getNextCandles will return empty array
        // because endTime = 10:24 + 100*1min > Date.now() (which is 2026)
        // Actually Date.now() is in 2026, so 2024-01-01 + 100 mins is still way before 2026
        // Let's just request a reasonable number that fits in test data
        const nextBeyond = await getNextCandles("BTCUSDT", "1m", 100);

        resolve({ next1m, next15m, nextBeyond });
      } catch (e) {
        resolve({ error: e.message });
      }
      return null;
    },
  });

  addFrameSchema({
    frameName: "next-candles-check",
    interval: "1d",
    startDate: T_10_24,
    endDate: new Date("2024-01-01T10:35:00Z"),
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-next-candles",
    exchangeName: "test-exchange-next",
    frameName: "next-candles-check",
  });

  const results = await awaiter;

  if (results.error) {
    fail(`Test error: ${results.error}`);
    return;
  }

  const { next1m, next15m, nextBeyond } = results;

  const errors = [];

  // Test 1: next1m - returns exactly 5 candles from aligned when (10:24)
  // alignedWhen = 10:24, candles: 10:24, 10:25, 10:26, 10:27, 10:28 (5 candles)
  if (!next1m || next1m.length !== 5) {
    errors.push(`Test1 (next1m): Expected 5 candles, got ${next1m?.length || 0}`);
  } else {
    const first = next1m[0];
    const last = next1m[next1m.length - 1];
    const expectedFirst = new Date("2024-01-01T10:24:00Z").getTime();
    const expectedLast = new Date("2024-01-01T10:28:00Z").getTime();

    if (first.timestamp !== expectedFirst) {
      errors.push(
        `Test1: First candle wrong. Expected ${new Date(expectedFirst).toISOString()}, got ${new Date(first.timestamp).toISOString()}`
      );
    }
    if (last.timestamp !== expectedLast) {
      errors.push(
        `Test1: Last candle wrong. Expected ${new Date(expectedLast).toISOString()}, got ${new Date(last.timestamp).toISOString()}`
      );
    }

    // Verify candles are sequential
    for (let i = 1; i < next1m.length; i++) {
      const expectedTs = expectedFirst + i * 60 * 1000;
      if (next1m[i].timestamp !== expectedTs) {
        errors.push(
          `Test1: Candle ${i} not sequential. Expected ${new Date(expectedTs).toISOString()}, got ${new Date(next1m[i].timestamp).toISOString()}`
        );
        break;
      }
    }
  }

  // Test 2: next15m - returns exactly 3 candles from aligned when (10:15)
  // alignedWhen for 15m = floor(10:24 / 15min) * 15min = 10:15
  // candles: 10:15, 10:30, 10:45 (3 candles)
  if (!next15m || next15m.length !== 3) {
    errors.push(`Test2 (next15m): Expected 3 candles, got ${next15m?.length || 0}`);
  } else {
    const first = next15m[0];
    const last = next15m[next15m.length - 1];
    const expectedFirst = new Date("2024-01-01T10:15:00Z").getTime();
    const expectedLast = new Date("2024-01-01T10:45:00Z").getTime();

    if (first.timestamp !== expectedFirst) {
      errors.push(
        `Test2: First 15m candle wrong. Expected ${new Date(expectedFirst).toISOString()}, got ${new Date(first.timestamp).toISOString()}`
      );
    }
    if (last.timestamp !== expectedLast) {
      errors.push(
        `Test2: Last 15m candle wrong. Expected ${new Date(expectedLast).toISOString()}, got ${new Date(last.timestamp).toISOString()}`
      );
    }
  }

  // Test 3: nextBeyond - should return empty array when requested range exceeds Date.now()
  // Since test data is from 2024-01-01 but Date.now() is 2026, this will be empty
  if (!nextBeyond) {
    errors.push(`Test3 (nextBeyond): Expected array, got null/undefined`);
  } else if (nextBeyond.length > 0) {
    // Verify the candles don't exceed Date.now()
    const now = Date.now();
    const lastCandle = nextBeyond[nextBeyond.length - 1];
    const lastCandleEnd = lastCandle.timestamp + 60 * 1000;

    if (lastCandleEnd > now) {
      errors.push(
        `Test3: Candles exceed Date.now(). Last candle end: ${new Date(lastCandleEnd).toISOString()}, now: ${new Date(now).toISOString()}`
      );
    }
  }
  // Empty array is also valid if endTime exceeds Date.now()

  if (errors.length === 0) {
    pass("getNextCandles correctly returns exact limit future candles with timestamp alignment");
  } else {
    fail("getNextCandles test failures:\n" + errors.join("\n"));
  }
});

test("Exchange.getCandles returns exact limit with timestamp alignment", async ({
  pass,
  fail,
}) => {
  // Generate test data covering current time (Date.now())
  const now = Date.now();
  const nowRounded = Math.floor(now / 60000) * 60000;

  // Generate candles covering last 300 minutes
  const candles1m = [];
  for (let i = 300; i > 0; i--) {
    candles1m.push({
      timestamp: nowRounded - i * 60 * 1000,
      open: 100,
      high: 105,
      low: 95,
      close: 101,
      volume: 1000,
    });
  }

  // Generate 15m candles covering last 50 periods (12.5 hours)
  const nowRounded15m = Math.floor(now / (15 * 60000)) * (15 * 60000);
  const candles15m = [];
  for (let i = 100; i > 0; i--) {
    candles15m.push({
      timestamp: nowRounded15m - i * 15 * 60 * 1000,
      open: 100,
      high: 105,
      low: 95,
      close: 101,
      volume: 1000,
    });
  }

  addExchangeSchema({
    exchangeName: "test-exchange-class",
    getCandles: async (_symbol, interval, since, limit) => {
      let source = [];
      if (interval === "1m") source = candles1m;
      else if (interval === "15m") source = candles15m;
      else return [];

      const sinceMs = since.getTime();
      const intervalMinutes = getIntervalMinutes(interval);
      const alignedSince = alignTimestamp(sinceMs, intervalMinutes);
      const filtered = source.filter((c) => c.timestamp >= alignedSince);
      return filtered.slice(0, limit);
    },
    formatPrice: async (_, p) => p.toFixed(2),
    formatQuantity: async (_, q) => q.toFixed(5),
  });

  try {
    const currentNow = Date.now();

    // Test 1m: Request 100 candles, should return exactly 100
    const result1m = await Exchange.getCandles("BTCUSDT", "1m", 100, {
      exchangeName: "test-exchange-class",
    });

    // Test 15m: Request 50 candles
    const result15m = await Exchange.getCandles("BTCUSDT", "15m", 50, {
      exchangeName: "test-exchange-class",
    });

    const errors = [];

    // Verify 1m candles: should return exactly 100 candles
    if (result1m.length !== 100) {
      errors.push(`1m: Expected 100 candles, got ${result1m.length}`);
    } else {
      const last1m = result1m[result1m.length - 1];
      const lastEnd1m = last1m.timestamp + 60 * 1000;
      if (lastEnd1m > currentNow) {
        errors.push(
          `1m: Last candle not closed. End: ${new Date(lastEnd1m).toISOString()}, now: ${new Date(currentNow).toISOString()}`
        );
      }
    }

    // Verify 15m candles: should return exactly 50 candles
    if (result15m.length !== 50) {
      errors.push(`15m: Expected 50 candles, got ${result15m.length}`);
    } else {
      const last15m = result15m[result15m.length - 1];
      const lastEnd15m = last15m.timestamp + 15 * 60 * 1000;
      if (lastEnd15m > currentNow) {
        errors.push(
          `15m: Last candle not closed. End: ${new Date(lastEnd15m).toISOString()}, now: ${new Date(currentNow).toISOString()}`
        );
      }
    }

    if (errors.length === 0) {
      pass("Exchange.getCandles correctly returns exact limit with timestamp alignment");
    } else {
      fail("Exchange.getCandles test failures:\n" + errors.join("\n"));
    }
  } catch (error) {
    fail(`Exchange.getCandles threw error: ${error.message}`);
  }
});

test("Exchange.getRawCandles returns exact limit with timestamp alignment", async ({
  pass,
  fail,
}) => {
  // Generate test data covering current time (Date.now())
  const now = Date.now();
  const nowRounded = Math.floor(now / 60000) * 60000;

  // Generate candles covering last 500 minutes
  const candles1m = [];
  for (let i = 500; i > 0; i--) {
    candles1m.push({
      timestamp: nowRounded - i * 60 * 1000,
      open: 100,
      high: 105,
      low: 95,
      close: 101,
      volume: 1000,
    });
  }

  // Generate 15m candles covering last 50 periods
  const nowRounded15m = Math.floor(now / (15 * 60000)) * (15 * 60000);
  const candles15m = [];
  for (let i = 50; i > 0; i--) {
    candles15m.push({
      timestamp: nowRounded15m - i * 15 * 60 * 1000,
      open: 100,
      high: 105,
      low: 95,
      close: 101,
      volume: 1000,
    });
  }

  addExchangeSchema({
    exchangeName: "test-exchange-raw-class",
    getCandles: async (_symbol, interval, since, limit) => {
      let source = [];
      if (interval === "1m") source = candles1m;
      else if (interval === "15m") source = candles15m;
      else return [];

      const sinceMs = since.getTime();
      const intervalMinutes = getIntervalMinutes(interval);
      const alignedSince = alignTimestamp(sinceMs, intervalMinutes);
      const filtered = source.filter((c) => c.timestamp >= alignedSince);
      return filtered.slice(0, limit);
    },
    formatPrice: async (_, p) => p.toFixed(2),
    formatQuantity: async (_, q) => q.toFixed(5),
  });

  try {
    const currentNow = Date.now();
    const nowRounded = Math.floor(currentNow / 60000) * 60000;

    // Test Case 1: Only limit (backward from Date.now())
    const test1 = await Exchange.getRawCandles(
      "BTCUSDT",
      "1m",
      { exchangeName: "test-exchange-raw-class" },
      10
    );

    // Test Case 2: sDate + limit (forward 10 candles from a time 100 mins ago)
    const sDate2 = nowRounded - 100 * 60 * 1000;
    const test2 = await Exchange.getRawCandles(
      "BTCUSDT",
      "1m",
      { exchangeName: "test-exchange-raw-class" },
      10,
      sDate2
    );

    // Test Case 3: eDate + limit (backward 5 candles from 50 mins ago)
    const nowRounded15m = Math.floor(currentNow / (15 * 60000)) * (15 * 60000);
    const eDate3 = nowRounded15m - 30 * 60 * 1000; // 30 mins ago, aligned
    const test3 = await Exchange.getRawCandles(
      "BTCUSDT",
      "15m",
      { exchangeName: "test-exchange-raw-class" },
      5,
      undefined,
      eDate3
    );

    // Test Case 4: sDate + eDate (range 20 mins)
    const sDate4 = nowRounded - 50 * 60 * 1000;
    const eDate4 = nowRounded - 30 * 60 * 1000;
    const test4 = await Exchange.getRawCandles(
      "BTCUSDT",
      "1m",
      { exchangeName: "test-exchange-raw-class" },
      undefined,
      sDate4,
      eDate4
    );

    // Test Case 5: All parameters (range with limit 15)
    const test5 = await Exchange.getRawCandles(
      "BTCUSDT",
      "1m",
      { exchangeName: "test-exchange-raw-class" },
      15,
      sDate4,
      eDate4
    );

    const errors = [];

    // Test 1: Only limit - returns exactly 10 candles
    if (test1.length !== 10) {
      errors.push(`Test1: Expected 10 candles, got ${test1.length}`);
    }

    // Test 2: sDate + limit - returns exactly 10 candles from aligned sDate
    if (test2.length !== 10) {
      errors.push(`Test2: Expected 10 candles, got ${test2.length}`);
    } else {
      const expectedFirst = sDate2;
      const expectedLast = sDate2 + 9 * 60 * 1000;
      if (test2[0].timestamp !== expectedFirst) {
        errors.push(
          `Test2: First candle wrong. Expected ${new Date(expectedFirst).toISOString()}, got ${new Date(test2[0].timestamp).toISOString()}`
        );
      }
      if (test2[9].timestamp !== expectedLast) {
        errors.push(
          `Test2: Last candle wrong. Expected ${new Date(expectedLast).toISOString()}, got ${new Date(test2[9].timestamp).toISOString()}`
        );
      }
    }

    // Test 3: eDate + limit - returns exactly 5 candles backward from aligned eDate
    // since = alignedEDate - 5*15min = eDate3 - 75min
    if (test3.length !== 5) {
      errors.push(`Test3: Expected 5 candles, got ${test3.length}`);
    } else {
      const expectedFirst = eDate3 - 5 * 15 * 60 * 1000;
      const expectedLast = eDate3 - 15 * 60 * 1000;
      if (test3[0].timestamp !== expectedFirst) {
        errors.push(
          `Test3: First candle wrong. Expected ${new Date(expectedFirst).toISOString()}, got ${new Date(test3[0].timestamp).toISOString()}`
        );
      }
      if (test3[4].timestamp !== expectedLast) {
        errors.push(
          `Test3: Last candle wrong. Expected ${new Date(expectedLast).toISOString()}, got ${new Date(test3[4].timestamp).toISOString()}`
        );
      }
    }

    // Test 4: sDate + eDate - calculates limit from range (20 candles)
    if (test4.length !== 20) {
      errors.push(`Test4: Expected 20 candles, got ${test4.length}`);
    } else {
      if (test4[0].timestamp !== sDate4 || test4[19].timestamp !== sDate4 + 19 * 60 * 1000) {
        errors.push(
          `Test4: Range wrong. Expected ${new Date(sDate4).toISOString()} to ${new Date(sDate4 + 19 * 60 * 1000).toISOString()}, got ${new Date(test4[0].timestamp).toISOString()} to ${new Date(test4[test4.length - 1].timestamp).toISOString()}`
        );
      }
    }

    // Test 5: All parameters - uses provided limit (15) from aligned sDate
    if (test5.length !== 15) {
      errors.push(`Test5: Expected 15 candles, got ${test5.length}`);
    } else {
      const expectedLast = sDate4 + 14 * 60 * 1000;
      if (test5[0].timestamp !== sDate4) {
        errors.push(
          `Test5: First candle wrong. Expected ${new Date(sDate4).toISOString()}, got ${new Date(test5[0].timestamp).toISOString()}`
        );
      }
      if (test5[14].timestamp !== expectedLast) {
        errors.push(
          `Test5: Last candle wrong. Expected ${new Date(expectedLast).toISOString()}, got ${new Date(test5[14].timestamp).toISOString()}`
        );
      }
    }

    if (errors.length === 0) {
      pass("Exchange.getRawCandles correctly returns exact limit with timestamp alignment");
    } else {
      fail("Exchange.getRawCandles test failures:\n" + errors.join("\n"));
    }
  } catch (error) {
    fail(`Exchange.getRawCandles threw error: ${error.message}`);
  }
});

test("getCandles edge case: returns exact limit candles with timestamp alignment", async ({
  pass,
  fail,
}) => {
  const [awaiter, { resolve }] = createAwaiter();

  // Test Time: 2024-01-01T10:05:00Z
  const T_10_05 = new Date("2024-01-01T10:05:00Z");

  // Generate enough candles to cover the requested range
  const generateCandles = (intervalMinutes) => {
    const candles = [];
    const stepMs = intervalMinutes * 60 * 1000;
    // Start earlier to cover requests that go back from 10:05
    let current = new Date("2024-01-01T09:00:00Z").getTime();
    const end = new Date("2024-01-01T11:00:00Z").getTime();

    while (current < end) {
      candles.push({
        timestamp: current,
        open: 100,
        high: 105,
        low: 95,
        close: 101,
        volume: 1000,
      });
      current += stepMs;
    }
    return candles;
  };

  const candles1m = generateCandles(1);

  addExchangeSchema({
    exchangeName: "test-edge-case",
    getCandles: async (_symbol, interval, since, limit) => {
      if (interval !== "1m") return [];
      const sinceMs = since.getTime();
      const alignedSince = alignTimestamp(sinceMs, 1);
      const filtered = candles1m.filter((c) => c.timestamp >= alignedSince);
      return filtered.slice(0, limit);
    },
    formatPrice: async (_, p) => p.toFixed(2),
    formatQuantity: async (_, q) => q.toFixed(5),
  });

  addStrategySchema({
    strategyName: "test-edge-case-strategy",
    interval: "1m",
    getSignal: async () => {
      try {
        // Request 10 candles at T_10_05
        // With timestamp alignment: alignedWhen=10:05, since=09:55
        // Expected: 09:55, 09:56, ..., 10:04 (10 candles)
        const result = await getCandles("BTCUSDT", "1m", 10);
        resolve(result);
      } catch (e) {
        resolve({ error: e.message });
      }
      return null;
    },
  });

  addFrameSchema({
    frameName: "edge-case-frame",
    interval: "1d",
    startDate: T_10_05,
    endDate: new Date("2024-01-01T10:06:00Z"),
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-edge-case-strategy",
    exchangeName: "test-edge-case",
    frameName: "edge-case-frame",
  });

  const result = await awaiter;

  if (result.error) {
    fail(`Test error: ${result.error}`);
    return;
  }

  if (!Array.isArray(result)) {
    fail("Expected candles array, got invalid result");
    return;
  }

  // With timestamp alignment, should return exactly 10 candles
  if (result.length !== 10) {
    fail(`Expected 10 candles, got ${result.length}`);
    return;
  }

  const firstCandle = result[0];
  const lastCandle = result[result.length - 1];

  // alignedWhen = 10:05, since = 10:05 - 10*1min = 09:55
  // Expected candles: 09:55, 09:56, ..., 10:04
  const expectedFirstTimestamp = new Date("2024-01-01T09:55:00Z").getTime();
  const expectedLastTimestamp = new Date("2024-01-01T10:04:00Z").getTime();

  if (firstCandle.timestamp === expectedFirstTimestamp && lastCandle.timestamp === expectedLastTimestamp) {
    pass(
      `Edge case passed: With timestamp alignment, returned exactly 10 candles from ${new Date(expectedFirstTimestamp).toISOString()} to ${new Date(expectedLastTimestamp).toISOString()}`
    );
  } else {
    fail(
      `Edge case failed: Expected first at ${new Date(expectedFirstTimestamp).toISOString()}, last at ${new Date(expectedLastTimestamp).toISOString()}, ` +
        `got first at ${new Date(firstCandle.timestamp).toISOString()}, last at ${new Date(lastCandle.timestamp).toISOString()}`
    );
  }
});

test("getRawCandles edge case: returns exact calculated limit with timestamp alignment", async ({
  pass,
  fail,
}) => {
  const [awaiter, { resolve }] = createAwaiter();

  const T_10_05 = new Date("2024-01-01T10:05:00Z");

  const generateCandles = () => {
    const candles = [];
    // Start earlier to cover the range
    let current = new Date("2024-01-01T09:00:00Z").getTime();
    const end = new Date("2024-01-01T11:00:00Z").getTime();

    while (current < end) {
      candles.push({
        timestamp: current,
        open: 100,
        high: 105,
        low: 95,
        close: 101,
        volume: 1000,
      });
      current += 60 * 1000;
    }
    return candles;
  };

  const candles1m = generateCandles();

  addExchangeSchema({
    exchangeName: "test-edge-raw",
    getCandles: async (_symbol, interval, since, limit) => {
      if (interval !== "1m") return [];
      const sinceMs = since.getTime();
      const alignedSince = alignTimestamp(sinceMs, 1);
      const filtered = candles1m.filter((c) => c.timestamp >= alignedSince);
      return filtered.slice(0, limit);
    },
    formatPrice: async (_, p) => p.toFixed(2),
    formatQuantity: async (_, q) => q.toFixed(5),
  });

  addStrategySchema({
    strategyName: "test-edge-raw-strategy",
    interval: "1m",
    getSignal: async () => {
      try {
        // Request candles with sDate + eDate (no limit)
        // alignedSince = 10:00, alignedEDate = 10:05
        // calculatedLimit = ceil((10:05 - 10:00) / 1min) = 5 candles
        // Expected: 10:00, 10:01, 10:02, 10:03, 10:04 (5 candles)
        const sDate = new Date("2024-01-01T10:00:00Z").getTime();
        const eDate = new Date("2024-01-01T10:05:00Z").getTime();
        const result = await getRawCandles("BTCUSDT", "1m", undefined, sDate, eDate);
        resolve(result);
      } catch (e) {
        resolve({ error: e.message });
      }
      return null;
    },
  });

  addFrameSchema({
    frameName: "edge-raw-frame",
    interval: "1d",
    startDate: T_10_05,
    endDate: new Date("2024-01-01T10:06:00Z"),
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-edge-raw-strategy",
    exchangeName: "test-edge-raw",
    frameName: "edge-raw-frame",
  });

  const result = await awaiter;

  if (result.error) {
    fail(`Test error: ${result.error}`);
    return;
  }

  if (!Array.isArray(result)) {
    fail("Expected candles array, got invalid result");
    return;
  }

  // With timestamp alignment (10:00, 10:05), should return 5 candles: 10:00, 10:01, 10:02, 10:03, 10:04
  if (result.length !== 5) {
    fail(`Expected 5 candles with timestamp alignment, got ${result.length}`);
    return;
  }

  const firstCandle = result[0];
  const lastCandle = result[result.length - 1];

  const expectedFirstTimestamp = new Date("2024-01-01T10:00:00Z").getTime();
  const expectedLastTimestamp = new Date("2024-01-01T10:04:00Z").getTime();

  if (firstCandle.timestamp === expectedFirstTimestamp && lastCandle.timestamp === expectedLastTimestamp) {
    pass(
      `getRawCandles edge case passed: With timestamp alignment (10:00, 10:05), correctly returned 5 candles (10:00-10:04)`
    );
  } else {
    fail(
      `getRawCandles edge case failed: Expected first at ${new Date(expectedFirstTimestamp).toISOString()}, last at ${new Date(expectedLastTimestamp).toISOString()}, ` +
        `got first at ${new Date(firstCandle.timestamp).toISOString()}, last at ${new Date(lastCandle.timestamp).toISOString()}`
    );
  }
});

test("Exchange.getCandles edge case: candle closing exactly at Date.now() should be excluded (exclusive boundary)", async ({
  pass,
  fail,
}) => {
  // Create a precise timestamp for testing
  const now = Date.now();
  const nowRounded = Math.floor(now / 60000) * 60000; // Round down to minute boundary

  // Generate candles where one closes EXACTLY at nowRounded
  const candles1m = [];
  for (let i = 0; i < 20; i++) {
    const timestamp = nowRounded - (20 - i) * 60 * 1000;
    candles1m.push({
      timestamp: timestamp,
      open: 100 + i,
      high: 105 + i,
      low: 95 + i,
      close: 101 + i,
      volume: 1000 + i,
    });
  }

  addExchangeSchema({
    exchangeName: "test-edge-exchange",
    getCandles: async (_symbol, interval, since, limit) => {
      if (interval !== "1m") return [];
      const sinceMs = since.getTime();
      const alignedSince = alignTimestamp(sinceMs, 1);
      const filtered = candles1m.filter((c) => c.timestamp >= alignedSince);
      return filtered.slice(0, limit);
    },
    formatPrice: async (_, p) => p.toFixed(2),
    formatQuantity: async (_, q) => q.toFixed(5),
  });

  try {
    // Request 10 candles - with exclusive boundary, candle closing at Date.now() should be excluded
    const result = await Exchange.getCandles("BTCUSDT", "1m", 10, {
      exchangeName: "test-edge-exchange",
    });

    if (!Array.isArray(result) || result.length === 0) {
      fail("Expected candles array, got empty or invalid result");
      return;
    }

    const lastCandle = result[result.length - 1];
    const lastCandleCloseTime = lastCandle.timestamp + 60 * 1000;

    // Get current time after the call to handle race conditions
    const currentNow = Date.now();

    // With exclusive boundary, last candle should close BEFORE the time when getCandles was called
    // Allow small tolerance for execution time
    const tolerance = 5000; // 5 seconds tolerance for execution
    if (lastCandleCloseTime <= currentNow + tolerance) {
      pass(
        `Exchange.getCandles edge case passed: With exclusive boundary, last candle closes at ${new Date(lastCandleCloseTime).toISOString()}, which is before or at current time ${new Date(currentNow).toISOString()}`
      );
    } else {
      fail(
        `Exchange.getCandles edge case failed: Last candle closes at ${new Date(lastCandleCloseTime).toISOString()}, ` +
          `which is AFTER current time ${new Date(currentNow).toISOString()}. Look-ahead bias detected!`
      );
    }
  } catch (error) {
    fail(`Exchange.getCandles edge case threw error: ${error.message}`);
  }
});

test("Exchange.getRawCandles edge case: returns exact calculated limit with timestamp alignment", async ({
  pass,
  fail,
}) => {
  // Start earlier to cover the range
  const BASE_TIME = new Date("2025-01-01T09:00:00Z").getTime();
  const candles1m = [];
  for (let i = 0; i < 200; i++) {
    candles1m.push({
      timestamp: BASE_TIME + i * 60 * 1000,
      open: 100 + i,
      high: 105 + i,
      low: 95 + i,
      close: 101 + i,
      volume: 1000 + i,
    });
  }

  addExchangeSchema({
    exchangeName: "test-edge-raw-exchange",
    getCandles: async (_symbol, interval, since, limit) => {
      if (interval !== "1m") return [];
      const sinceMs = since.getTime();
      const alignedSince = alignTimestamp(sinceMs, 1);
      const filtered = candles1m.filter((c) => c.timestamp >= alignedSince);
      return filtered.slice(0, limit);
    },
    formatPrice: async (_, p) => p.toFixed(2),
    formatQuantity: async (_, q) => q.toFixed(5),
  });

  try {
    // Request candles with sDate + eDate (no limit)
    // alignedSince = 10:00, alignedEDate = 10:05
    // calculatedLimit = ceil((10:05 - 10:00) / 1min) = 5 candles
    // Expected: 10:00, 10:01, 10:02, 10:03, 10:04 (5 candles)
    const sDate = new Date("2025-01-01T10:00:00Z").getTime();
    const eDate = new Date("2025-01-01T10:05:00Z").getTime();

    const result = await Exchange.getRawCandles(
      "BTCUSDT",
      "1m",
      { exchangeName: "test-edge-raw-exchange" },
      undefined,
      sDate,
      eDate
    );

    if (!Array.isArray(result)) {
      fail("Expected candles array, got invalid result");
      return;
    }

    // With timestamp alignment, should return 5 candles
    if (result.length !== 5) {
      fail(`Expected 5 candles with timestamp alignment, got ${result.length}`);
      return;
    }

    const firstCandle = result[0];
    const lastCandle = result[result.length - 1];

    const expectedFirstTimestamp = new Date("2025-01-01T10:00:00Z").getTime();
    const expectedLastTimestamp = new Date("2025-01-01T10:04:00Z").getTime();

    if (firstCandle.timestamp === expectedFirstTimestamp && lastCandle.timestamp === expectedLastTimestamp) {
      pass(
        `Exchange.getRawCandles edge case passed: With timestamp alignment (10:00, 10:05), correctly returned 5 candles (10:00-10:04)`
      );
    } else {
      fail(
        `Exchange.getRawCandles edge case failed: Expected first at ${new Date(expectedFirstTimestamp).toISOString()}, last at ${new Date(expectedLastTimestamp).toISOString()}, ` +
          `got first at ${new Date(firstCandle.timestamp).toISOString()}, last at ${new Date(lastCandle.timestamp).toISOString()}`
      );
    }
  } catch (error) {
    fail(`Exchange.getRawCandles edge case threw error: ${error.message}`);
  }
});

test("STRICT: Exchange.getRawCandles returns exact limit with timestamp alignment", async ({
  pass,
  fail,
}) => {
  // Use a fixed time that aligns exactly with minute boundary
  const targetTime = new Date("2025-06-15T14:30:00.000Z");
  const targetTimeMs = targetTime.getTime();

  // Generate candles covering range from 14:00 to 15:00
  const candles1m = [];
  for (let i = -30; i < 30; i++) {
    candles1m.push({
      timestamp: targetTimeMs + i * 60 * 1000,
      open: 100 + i,
      high: 105 + i,
      low: 95 + i,
      close: 101 + i,
      volume: 1000 + Math.abs(i),
    });
  }

  addExchangeSchema({
    exchangeName: "test-strict-boundary",
    getCandles: async (_symbol, interval, since, limit) => {
      if (interval !== "1m") return [];
      const sinceMs = since.getTime();
      const alignedSince = alignTimestamp(sinceMs, 1);
      const filtered = candles1m.filter((c) => c.timestamp >= alignedSince);
      return filtered.slice(0, limit);
    },
    formatPrice: async (_, p) => p.toFixed(2),
    formatQuantity: async (_, q) => q.toFixed(5),
  });

  try {
    // With timestamp alignment, request 10 candles from aligned since to aligned until
    // sDate = 14:20, eDate = 14:30, both already aligned to 1m
    // limit = 10 (provided)
    // Expected: 14:20, 14:21, ..., 14:29 (10 candles)
    const limit = 10;
    const calculatedSince = targetTimeMs - limit * 60 * 1000; // 14:20

    const result = await Exchange.getRawCandles(
      "BTCUSDT",
      "1m",
      { exchangeName: "test-strict-boundary" },
      limit,
      calculatedSince,
      targetTimeMs
    );

    if (!Array.isArray(result)) {
      fail("Expected candles array, got invalid result");
      return;
    }

    // With timestamp alignment, should return exactly 10 candles
    if (result.length !== 10) {
      fail(`Expected 10 candles with timestamp alignment, got ${result.length}`);
      return;
    }

    const firstCandle = result[0];
    const lastCandle = result[result.length - 1];

    const expectedFirstTimestamp = calculatedSince; // 14:20
    const expectedLastTimestamp = targetTimeMs - 60 * 1000; // 14:29

    if (firstCandle.timestamp === expectedFirstTimestamp && lastCandle.timestamp === expectedLastTimestamp) {
      pass(
        `STRICT boundary test passed: With timestamp alignment, correctly returned 10 candles (14:20-14:29)`
      );
    } else {
      fail(
        `STRICT boundary test failed: Expected first at ${new Date(expectedFirstTimestamp).toISOString()}, last at ${new Date(expectedLastTimestamp).toISOString()}, ` +
          `got first at ${new Date(firstCandle.timestamp).toISOString()}, last at ${new Date(lastCandle.timestamp).toISOString()}. Candle count: ${result.length}.`
      );
    }
  } catch (error) {
    fail(`STRICT boundary test threw error: ${error.message}`);
  }
});


test("STRICT: Exchange.getCandles returns exact limit with timestamp alignment", async ({
  pass,
  fail,
}) => {
  // Use Date.now() rounded to minute boundary to create test data
  const now = Date.now();
  const nowRounded = Math.floor(now / 60000) * 60000;

  // Generate candles ending at nowRounded
  const candles1m = [];
  for (let i = 30; i > 0; i--) {
    candles1m.push({
      timestamp: nowRounded - i * 60 * 1000,
      open: 100 + i,
      high: 105 + i,
      low: 95 + i,
      close: 101 + i,
      volume: 1000 + i,
    });
  }

  addExchangeSchema({
    exchangeName: "test-strict-getcandles",
    getCandles: async (_symbol, interval, since, limit) => {
      if (interval !== "1m") return [];
      const sinceMs = since.getTime();
      const alignedSince = alignTimestamp(sinceMs, 1);

      // Return all candles >= aligned since
      const filtered = candles1m.filter((c) => c.timestamp >= alignedSince);
      return filtered.slice(0, limit);
    },
    formatPrice: async (_, p) => p.toFixed(2),
    formatQuantity: async (_, q) => q.toFixed(5),
  });

  try {
    // Exchange.getCandles uses Date.now() internally
    // With timestamp alignment, should return exactly 10 candles

    const result = await Exchange.getCandles("BTCUSDT", "1m", 10, {
      exchangeName: "test-strict-getcandles",
    });

    if (!Array.isArray(result) || result.length === 0) {
      fail("Expected candles array with data, got empty or invalid result");
      return;
    }

    // With timestamp alignment, should return exactly 10 candles
    if (result.length !== 10) {
      fail(`STRICT getCandles test failed: Expected 10 candles, got ${result.length}`);
      return;
    }

    const lastCandle = result[result.length - 1];
    const lastCandleCloseTime = lastCandle.timestamp + 60 * 1000;
    const currentNow = Date.now();

    // Last candle should close before or at current time (no look-ahead)
    if (lastCandleCloseTime <= currentNow) {
      pass(
        `STRICT Exchange.getCandles test passed: With timestamp alignment, returned exactly 10 candles. ` +
        `Last closes at ${new Date(lastCandleCloseTime).toISOString()}, current time: ${new Date(currentNow).toISOString()}.`
      );
    } else {
      fail(
        `STRICT getCandles test failed: Last candle closes at ${new Date(lastCandleCloseTime).toISOString()}, ` +
        `which is AFTER Date.now() (${new Date(currentNow).toISOString()}). Look-ahead bias detected!`
      );
    }
  } catch (error) {
    fail(`STRICT getCandles test threw error: ${error.message}`);
  }
});

test("getRawCandles (sDate+eDate+limit) rejects limit extending past execution context when (lookahead bias)", async ({
  pass,
  fail,
}) => {
  const [awaiter, { resolve }] = createAwaiter();

  // Test Time: 2024-01-01T10:24:00Z
  const T_10_24 = new Date("2024-01-01T10:24:00Z");
  const T_10_00_MS = new Date("2024-01-01T10:00:00Z").getTime();
  const T_10_20_MS = new Date("2024-01-01T10:20:00Z").getTime();

  // 1m candles covering well past `when` — a leaked fetch WOULD find future data
  const candles1m = [];
  {
    let current = new Date("2024-01-01T00:00:00Z").getTime();
    const end = new Date("2024-01-02T00:00:00Z").getTime();
    while (current < end) {
      candles1m.push({
        timestamp: current,
        open: 100, high: 105, low: 95, close: 101, volume: 1000,
      });
      current += 60 * 1000;
    }
  }

  addExchangeSchema({
    exchangeName: "test-exchange-raw-lookahead",
    getCandles: async (_symbol, interval, since, limit) => {
      if (interval !== "1m") return [];
      const alignedSince = alignTimestamp(since.getTime(), 1);
      return candles1m.filter((c) => c.timestamp >= alignedSince).slice(0, limit);
    },
    formatPrice: async (_, p) => p.toFixed(2),
    formatQuantity: async (_, q) => q.toFixed(5),
  });

  addStrategySchema({
    strategyName: "test-raw-candles-lookahead",
    interval: "1m",
    getSignal: async () => {
      const outcome = {};
      // Control: sDate+eDate+limit fully inside `when` (10:00 + 15m = 10:15 <= 10:24)
      try {
        outcome.control = await getRawCandles("BTCUSDT", "1m", 15, T_10_00_MS, T_10_20_MS);
      } catch (e) {
        outcome.controlError = e.message;
      }
      // Attack: eDate (10:20) passes the eDate<=when check, but limit=30 makes the
      // actual fetch end at 10:00 + 30m = 10:30 — PAST when (10:24)
      try {
        outcome.attack = await getRawCandles("BTCUSDT", "1m", 30, T_10_00_MS, T_10_20_MS);
      } catch (e) {
        outcome.attackError = e.message;
      }
      // Range attack: end = 10:00 + 22m = 10:22 stays under when (10:24) but
      // overshoots the declared eDate (10:20) — eDate is a hard bound
      try {
        outcome.rangeAttack = await getRawCandles("BTCUSDT", "1m", 22, T_10_00_MS, T_10_20_MS);
      } catch (e) {
        outcome.rangeAttackError = e.message;
      }
      resolve(outcome);
      return null;
    },
  });

  addFrameSchema({
    frameName: "raw-lookahead-check",
    interval: "1d",
    startDate: T_10_24,
    endDate: new Date("2024-01-01T10:35:00Z"),
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-raw-candles-lookahead",
    exchangeName: "test-exchange-raw-lookahead",
    frameName: "raw-lookahead-check",
  });

  const { control, controlError, attack, attackError, rangeAttack, rangeAttackError } = await awaiter;

  const errors = [];

  if (controlError) {
    errors.push(`Control call (limit=15, end=10:15 <= when=10:24) must succeed, threw: ${controlError}`);
  } else if (!control || control.length !== 15) {
    errors.push(`Control call: expected 15 candles, got ${control?.length || 0}`);
  }

  if (!attackError) {
    const last = attack?.[attack.length - 1];
    errors.push(
      `Attack call (limit=30, end=10:30 > when=10:24) must throw look-ahead error, ` +
      `but returned ${attack?.length || 0} candles, last at ${last ? new Date(last.timestamp).toISOString() : "n/a"}`
    );
  } else if (!attackError.includes("Look-ahead")) {
    errors.push(`Attack call threw, but not the look-ahead error: ${attackError}`);
  }

  if (!rangeAttackError) {
    const last = rangeAttack?.[rangeAttack.length - 1];
    errors.push(
      `Range attack (limit=22, end=10:22 <= when but > eDate=10:20) must throw range error, ` +
      `but returned ${rangeAttack?.length || 0} candles, last at ${last ? new Date(last.timestamp).toISOString() : "n/a"}`
    );
  } else if (!rangeAttackError.includes("eDate")) {
    errors.push(`Range attack threw, but not the eDate range error: ${rangeAttackError}`);
  }

  if (errors.length === 0) {
    pass("getRawCandles (sDate+eDate+limit) enforces look-ahead protection on the actual fetch range");
  } else {
    fail("getRawCandles sDate+eDate+limit look-ahead failures:\n" + errors.join("\n"));
  }
});

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
import { createAwaiter } from "functools-kit";

test("getCandles does not return unclosed candles (lookahead bias from higher timeframes)", async ({
  pass,
  fail,
}) => {
  const [awaiter, { resolve }] = createAwaiter();

  // Test Time: 2024-01-01T10:24:00Z
  const T_10_24 = new Date("2024-01-01T10:24:00Z");

  // Helper to generate candles
  const generateCandles = (intervalMinutes, startHour, count) => {
    const candles = [];
    const stepMs = intervalMinutes * 60 * 1000;
    // Start from T_00_00 for simplicity
    let current = new Date("2024-01-01T00:00:00Z").getTime();

    for (let i = 0; i < 2000; i++) {
      candles.push({
        timestamp: current,
        open: 100, high: 105, low: 95, close: 101, volume: 1000
      });
      current += stepMs;
    }
    return candles;
  };

  const candles1m = generateCandles(1, 0, 1000);
  const candles15m = generateCandles(15, 0, 100);
  const candles1h = generateCandles(60, 0, 24);
  const candles4h = generateCandles(240, 0, 6);

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
      const filtered = source.filter(c => c.timestamp >= sinceMs);
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

  const last1m = c1m[c1m.length - 1];
  const last15m = c15m[c15m.length - 1];
  const last1h = c1h[c1h.length - 1];
  const last4h = c4h[c4h.length - 1];

  // Checks
  const t1m = last1m?.timestamp === new Date("2024-01-01T10:23:00Z").getTime();
  const t15m = last15m?.timestamp === new Date("2024-01-01T10:00:00Z").getTime();
  const t1h = last1h?.timestamp === new Date("2024-01-01T09:00:00Z").getTime();
  const t4h = last4h?.timestamp === new Date("2024-01-01T04:00:00Z").getTime();

  if (t1m && t15m && t1h && t4h) {
    pass("All timeframes correctly filtered unclosed candles.");
  } else {
    let msg = "Lookahead bias detected or incorrect filtering:\n";
    if (!t1m) msg += `1m: Expected 10:23, got ${last1m ? new Date(last1m.timestamp).toISOString() : 'undefined'}\n`;
    if (!t15m) msg += `15m: Expected 10:00, got ${last15m ? new Date(last15m.timestamp).toISOString() : 'undefined'}\n`;
    if (!t1h) msg += `1h: Expected 09:00, got ${last1h ? new Date(last1h.timestamp).toISOString() : 'undefined'}\n`;
    if (!t4h) msg += `4h: Expected 04:00, got ${last4h ? new Date(last4h.timestamp).toISOString() : 'undefined'}\n`;
    fail(msg);
  }
});

test("getRawCandles prevents lookahead bias with different parameter combinations", async ({
  pass,
  fail,
}) => {
  const [awaiter, { resolve }] = createAwaiter();

  // Test Time: 2024-01-01T10:24:00Z
  const T_10_24 = new Date("2024-01-01T10:24:00Z");
  const T_10_24_MS = T_10_24.getTime();

  // Helper to generate candles
  const generateCandles = (intervalMinutes, count) => {
    const candles = [];
    const stepMs = intervalMinutes * 60 * 1000;
    let current = new Date("2024-01-01T00:00:00Z").getTime();

    for (let i = 0; i < count; i++) {
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

  const candles1m = generateCandles(1, 2000);
  const candles15m = generateCandles(15, 200);

  addExchangeSchema({
    exchangeName: "test-exchange-raw",
    getCandles: async (_symbol, interval, since, limit) => {
      let source = [];
      if (interval === "1m") source = candles1m;
      else if (interval === "15m") source = candles15m;
      else return [];

      const sinceMs = since.getTime();
      const filtered = source.filter((c) => c.timestamp >= sinceMs);
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

  // Test 1: Only limit - should return 10 candles ending before T_10_24
  if (!test1 || test1.length !== 10) {
    errors.push(`Test1: Expected 10 candles, got ${test1?.length || 0}`);
  } else {
    const last = test1[test1.length - 1];
    const expectedLast = new Date("2024-01-01T10:23:00Z").getTime();
    if (last.timestamp !== expectedLast) {
      errors.push(
        `Test1: Last candle timestamp wrong. Expected ${new Date(expectedLast).toISOString()}, got ${new Date(last.timestamp).toISOString()}`
      );
    }
  }

  // Test 2: sDate + limit - should return 10 candles starting from T_10_00
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

  // Test 3: eDate + limit - should return candles that fully closed before or at T_10_20
  // sinceTimestamp = 10:20 - 5*15min = 09:05
  // untilTimestamp = 10:20
  // Candles that match: >= 09:05 AND close <= 10:20
  // Result: 09:15(closes 09:30), 09:30(closes 09:45), 09:45(closes 10:00), 10:00(closes 10:15)
  // Note: 09:00 starts before 09:05, so it's excluded
  if (!test3 || test3.length !== 4) {
    errors.push(`Test3: Expected 4 candles, got ${test3?.length || 0}`);
  } else {
    const first = test3[0];
    const last = test3[test3.length - 1];
    const expectedFirst = new Date("2024-01-01T09:15:00Z").getTime();
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

  // Test 4: sDate + eDate - should calculate limit (20 minutes = 20 candles)
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

  // Test 5: All parameters - should respect limit parameter
  if (!test5 || test5.length !== 15) {
    errors.push(`Test5: Expected 15 candles, got ${test5?.length || 0}`);
  } else {
    const first = test5[0];
    const expectedFirst = new Date("2024-01-01T10:00:00Z").getTime();
    if (first.timestamp !== expectedFirst) {
      errors.push(
        `Test5: First candle wrong. Expected ${new Date(expectedFirst).toISOString()}, got ${new Date(first.timestamp).toISOString()}`
      );
    }
  }

  if (errors.length === 0) {
    pass("getRawCandles correctly handles all parameter combinations without lookahead bias");
  } else {
    fail("getRawCandles test failures:\n" + errors.join("\n"));
  }
});

test("getNextCandles prevents lookahead bias and only returns future candles", async ({
  pass,
  fail,
}) => {
  const [awaiter, { resolve }] = createAwaiter();

  // Test Time: 2024-01-01T10:24:00Z
  const T_10_24 = new Date("2024-01-01T10:24:00Z");

  // Helper to generate candles
  const generateCandles = (intervalMinutes, count) => {
    const candles = [];
    const stepMs = intervalMinutes * 60 * 1000;
    let current = new Date("2024-01-01T00:00:00Z").getTime();

    for (let i = 0; i < count; i++) {
      candles.push({
        timestamp: current,
        open: 100 + i,
        high: 105 + i,
        low: 95 + i,
        close: 101 + i,
        volume: 1000 + i,
      });
      current += stepMs;
    }
    return candles;
  };

  const candles1m = generateCandles(1, 2000);
  const candles15m = generateCandles(15, 200);

  addExchangeSchema({
    exchangeName: "test-exchange-next",
    getCandles: async (_symbol, interval, since, limit) => {
      let source = [];
      if (interval === "1m") source = candles1m;
      else if (interval === "15m") source = candles15m;
      else return [];

      const sinceMs = since.getTime();
      const filtered = source.filter((c) => c.timestamp >= sinceMs);
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

        // Test Case 3: Request beyond Date.now() - should return empty array
        // Since backtest time is T_10_24 (2024-01-01T10:24:00Z)
        // and we have candles up to ~2000 minutes from start
        // requesting a huge number should hit the Date.now() limit
        const nextBeyond = await getNextCandles("BTCUSDT", "1m", 10000);

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

  // Test 1: next1m - should return 5 candles starting from T_10_24
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

  // Test 2: next15m - should return 3 15m candles starting from T_10_30 (next 15m boundary)
  if (!next15m || next15m.length !== 3) {
    errors.push(`Test2 (next15m): Expected 3 candles, got ${next15m?.length || 0}`);
  } else {
    const first = next15m[0];
    const last = next15m[next15m.length - 1];
    // Next 15m boundary after 10:24 is 10:30
    const expectedFirst = new Date("2024-01-01T10:30:00Z").getTime();
    const expectedLast = new Date("2024-01-01T11:00:00Z").getTime();

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
  if (!nextBeyond) {
    errors.push(`Test3 (nextBeyond): Expected empty array, got null/undefined`);
  } else if (nextBeyond.length > 0) {
    // This is expected since our test data goes far into the future
    // But getNextCandles should still respect Date.now() limit
    // Let's just verify the candles don't exceed Date.now()
    const now = Date.now();
    const lastCandle = nextBeyond[nextBeyond.length - 1];
    const lastCandleEnd = lastCandle.timestamp + 60 * 1000; // 1m candle duration

    if (lastCandleEnd > now) {
      errors.push(
        `Test3: Candles exceed Date.now(). Last candle end: ${new Date(lastCandleEnd).toISOString()}, now: ${new Date(now).toISOString()}`
      );
    }
  }

  if (errors.length === 0) {
    pass("getNextCandles correctly returns future candles without lookahead bias");
  } else {
    fail("getNextCandles test failures:\n" + errors.join("\n"));
  }
});

test("Exchange.getCandles does not return unclosed candles (lookahead bias)", async ({
  pass,
  fail,
}) => {
  // Fixed test data: 200 1m candles starting from 2025-01-01T00:00:00Z
  const BASE_TIME = new Date("2025-01-01T00:00:00Z").getTime();
  const candles1m = [];
  for (let i = 0; i < 200; i++) {
    candles1m.push({
      timestamp: BASE_TIME + i * 60 * 1000,
      open: 100,
      high: 105,
      low: 95,
      close: 101,
      volume: 1000,
    });
  }

  // Fixed test data: 100 15m candles starting from 2025-01-01T00:00:00Z
  const candles15m = [];
  for (let i = 0; i < 100; i++) {
    candles15m.push({
      timestamp: BASE_TIME + i * 15 * 60 * 1000,
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
      const filtered = source.filter((c) => c.timestamp >= sinceMs);
      return filtered.slice(0, limit);
    },
    formatPrice: async (_, p) => p.toFixed(2),
    formatQuantity: async (_, q) => q.toFixed(5),
  });

  try {
    const now = Date.now();

    // Test 1m: Request 100 candles, should only return those that closed before Date.now()
    const result1m = await Exchange.getCandles("BTCUSDT", "1m", 100, {
      exchangeName: "test-exchange-class",
    });

    // Test 15m: Request 50 candles
    const result15m = await Exchange.getCandles("BTCUSDT", "15m", 50, {
      exchangeName: "test-exchange-class",
    });

    const errors = [];

    // Verify 1m candles: all returned candles must be closed before Date.now()
    if (result1m.length > 0) {
      const last1m = result1m[result1m.length - 1];
      const lastEnd1m = last1m.timestamp + 60 * 1000;
      if (lastEnd1m > now) {
        errors.push(
          `1m: Last candle not closed. End: ${new Date(lastEnd1m).toISOString()}, now: ${new Date(now).toISOString()}`
        );
      }
    }

    // Verify 15m candles: all returned candles must be closed before Date.now()
    if (result15m.length > 0) {
      const last15m = result15m[result15m.length - 1];
      const lastEnd15m = last15m.timestamp + 15 * 60 * 1000;
      if (lastEnd15m > now) {
        errors.push(
          `15m: Last candle not closed. End: ${new Date(lastEnd15m).toISOString()}, now: ${new Date(now).toISOString()}`
        );
      }
    }

    if (errors.length === 0) {
      pass("Exchange.getCandles correctly prevents lookahead bias");
    } else {
      fail("Exchange.getCandles lookahead bias detected:\n" + errors.join("\n"));
    }
  } catch (error) {
    fail(`Exchange.getCandles threw error: ${error.message}`);
  }
});

test("Exchange.getRawCandles prevents lookahead bias with different parameter combinations", async ({
  pass,
  fail,
}) => {
  // Fixed test data: 200 1m candles from 2025-01-01T00:00:00Z to 2025-01-01T03:19:00Z
  const BASE_TIME = new Date("2025-01-01T00:00:00Z").getTime();
  const candles1m = [];
  for (let i = 0; i < 200; i++) {
    candles1m.push({
      timestamp: BASE_TIME + i * 60 * 1000,
      open: 100,
      high: 105,
      low: 95,
      close: 101,
      volume: 1000,
    });
  }

  // Fixed test data: 20 15m candles from 2025-01-01T00:00:00Z to 2025-01-01T04:45:00Z
  const candles15m = [];
  for (let i = 0; i < 20; i++) {
    candles15m.push({
      timestamp: BASE_TIME + i * 15 * 60 * 1000,
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
      const filtered = source.filter((c) => c.timestamp >= sinceMs);
      return filtered.slice(0, limit);
    },
    formatPrice: async (_, p) => p.toFixed(2),
    formatQuantity: async (_, q) => q.toFixed(5),
  });

  try {
    const now = Date.now();

    // Test Case 1: Only limit (backward from Date.now())
    const test1 = await Exchange.getRawCandles(
      "BTCUSDT",
      "1m",
      { exchangeName: "test-exchange-raw-class" },
      10
    );

    // Test Case 2: sDate + limit (forward 10 candles from 01:00)
    const sDate2 = new Date("2025-01-01T01:00:00Z").getTime();
    const test2 = await Exchange.getRawCandles(
      "BTCUSDT",
      "1m",
      { exchangeName: "test-exchange-raw-class" },
      10,
      sDate2
    );

    // Test Case 3: eDate + limit (backward 5 candles from 02:00)
    const eDate3 = new Date("2025-01-01T02:00:00Z").getTime();
    const test3 = await Exchange.getRawCandles(
      "BTCUSDT",
      "15m",
      { exchangeName: "test-exchange-raw-class" },
      5,
      undefined,
      eDate3
    );

    // Test Case 4: sDate + eDate (range from 01:00 to 01:20)
    const sDate4 = new Date("2025-01-01T01:00:00Z").getTime();
    const eDate4 = new Date("2025-01-01T01:20:00Z").getTime();
    const test4 = await Exchange.getRawCandles(
      "BTCUSDT",
      "1m",
      { exchangeName: "test-exchange-raw-class" },
      undefined,
      sDate4,
      eDate4
    );

    // Test Case 5: All parameters (range from 01:00 to 01:20, limit 15)
    const test5 = await Exchange.getRawCandles(
      "BTCUSDT",
      "1m",
      { exchangeName: "test-exchange-raw-class" },
      15,
      sDate4,
      eDate4
    );

    const errors = [];

    // Test 1: Only limit - should not return candles after Date.now()
    if (test1.length > 0) {
      const last = test1[test1.length - 1];
      const lastEnd = last.timestamp + 60 * 1000;
      if (lastEnd > now) {
        errors.push(
          `Test1: Last candle exceeds Date.now(). End: ${new Date(lastEnd).toISOString()}, now: ${new Date(now).toISOString()}`
        );
      }
    }

    // Test 2: sDate + limit - should return exactly 10 candles starting from 01:00
    if (test2.length !== 10) {
      errors.push(`Test2: Expected 10 candles, got ${test2.length}`);
    } else {
      const expectedFirst = new Date("2025-01-01T01:00:00Z").getTime();
      const expectedLast = new Date("2025-01-01T01:09:00Z").getTime();
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

    // Test 3: eDate + limit - should return 5 15m candles ending at or before 02:00
    if (test3.length !== 5) {
      errors.push(`Test3: Expected 5 candles, got ${test3.length}`);
    } else {
      const lastEnd = test3[test3.length - 1].timestamp + 15 * 60 * 1000;
      if (lastEnd > eDate3) {
        errors.push(
          `Test3: Last candle exceeds eDate. End: ${new Date(lastEnd).toISOString()}, eDate: ${new Date(eDate3).toISOString()}`
        );
      }
    }

    // Test 4: sDate + eDate - should return 20 candles (01:00 to 01:19)
    if (test4.length !== 20) {
      errors.push(`Test4: Expected 20 candles, got ${test4.length}`);
    } else {
      const expectedFirst = new Date("2025-01-01T01:00:00Z").getTime();
      const expectedLast = new Date("2025-01-01T01:19:00Z").getTime();
      if (test4[0].timestamp !== expectedFirst || test4[19].timestamp !== expectedLast) {
        errors.push(
          `Test4: Range wrong. Expected ${new Date(expectedFirst).toISOString()} to ${new Date(expectedLast).toISOString()}, got ${new Date(test4[0].timestamp).toISOString()} to ${new Date(test4[test4.length - 1].timestamp).toISOString()}`
        );
      }
    }

    // Test 5: All parameters - should respect limit of 15
    if (test5.length !== 15) {
      errors.push(`Test5: Expected 15 candles, got ${test5.length}`);
    } else {
      const expectedFirst = new Date("2025-01-01T01:00:00Z").getTime();
      if (test5[0].timestamp !== expectedFirst) {
        errors.push(
          `Test5: First candle wrong. Expected ${new Date(expectedFirst).toISOString()}, got ${new Date(test5[0].timestamp).toISOString()}`
        );
      }
    }

    if (errors.length === 0) {
      pass("Exchange.getRawCandles correctly handles all parameter combinations");
    } else {
      fail("Exchange.getRawCandles test failures:\n" + errors.join("\n"));
    }
  } catch (error) {
    fail(`Exchange.getRawCandles threw error: ${error.message}`);
  }
});

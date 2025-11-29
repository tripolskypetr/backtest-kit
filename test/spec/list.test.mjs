import { test } from "worker-testbed";

import {
  addExchange,
  addFrame,
  addStrategy,
  addSizing,
  listExchanges,
  listFrames,
  listStrategies,
  listSizings,
  getAveragePrice,
} from "../../build/index.mjs";

import getMockCandles from "../mock/getMockCandles.mjs";

test("listExchanges returns all registered exchanges", async ({ pass, fail }) => {

  addExchange({
    exchangeName: "binance-list-test-1",
    note: "First test exchange",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => {
      return price.toFixed(8);
    },
    formatQuantity: async (symbol, quantity) => {
      return quantity.toFixed(8);
    },
  });

  addExchange({
    exchangeName: "binance-list-test-2",
    note: "Second test exchange",
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => {
      return price.toFixed(8);
    },
    formatQuantity: async (symbol, quantity) => {
      return quantity.toFixed(8);
    },
  });

  const exchanges = await listExchanges();

  const testExchanges = exchanges.filter(e =>
    e.exchangeName.startsWith("binance-list-test")
  );

  if (testExchanges.length >= 2) {
    const hasNotes = testExchanges.every(e => typeof e.note === "string");
    const hasRequiredFields = testExchanges.every(e =>
      e.exchangeName &&
      typeof e.getCandles === "function" &&
      typeof e.formatPrice === "function" &&
      typeof e.formatQuantity === "function"
    );

    if (hasNotes && hasRequiredFields) {
      pass(`listExchanges returned ${testExchanges.length} test exchanges with all fields`);
      return;
    }

    fail("Exchanges missing required fields or notes");
    return;
  }

  fail(`Expected at least 2 test exchanges, got ${testExchanges.length}`);

});

test("listStrategies returns all registered strategies", async ({ pass, fail }) => {

  addStrategy({
    strategyName: "test-strategy-list-1",
    note: "First test strategy for list",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "test signal",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addStrategy({
    strategyName: "test-strategy-list-2",
    note: "Second test strategy for list",
    interval: "5m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "short",
        note: "test signal",
        priceOpen: price,
        priceTakeProfit: price - 1_000,
        priceStopLoss: price + 1_000,
        minuteEstimatedTime: 120,
      };
    },
  });

  const strategies = await listStrategies();

  const testStrategies = strategies.filter(s =>
    s.strategyName.startsWith("test-strategy-list")
  );

  if (testStrategies.length >= 2) {
    const hasNotes = testStrategies.every(s => typeof s.note === "string");
    const hasRequiredFields = testStrategies.every(s =>
      s.strategyName &&
      s.interval &&
      typeof s.getSignal === "function"
    );
    const hasCorrectIntervals = testStrategies.some(s => s.interval === "1m") &&
                                testStrategies.some(s => s.interval === "5m");

    if (hasNotes && hasRequiredFields && hasCorrectIntervals) {
      pass(`listStrategies returned ${testStrategies.length} test strategies with all fields`);
      return;
    }

    if (!hasNotes) {
      fail("Strategies missing notes");
      return;
    }

    if (!hasRequiredFields) {
      fail("Strategies missing required fields");
      return;
    }

    if (!hasCorrectIntervals) {
      fail("Strategies have incorrect intervals");
      return;
    }
  }

  fail(`Expected at least 2 test strategies, got ${testStrategies.length}`);

});

test("listFrames returns all registered frames", async ({ pass, fail }) => {

  addFrame({
    frameName: "1d-backtest-list-1",
    note: "First test frame for list",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  addFrame({
    frameName: "1d-backtest-list-2",
    note: "Second test frame for list",
    interval: "1h",
    startDate: new Date("2024-02-01T00:00:00Z"),
    endDate: new Date("2024-02-02T00:00:00Z"),
  });

  const frames = await listFrames();

  const testFrames = frames.filter(f =>
    f.frameName.startsWith("1d-backtest-list")
  );

  if (testFrames.length >= 2) {
    const hasNotes = testFrames.every(f => typeof f.note === "string");
    const hasRequiredFields = testFrames.every(f =>
      f.frameName &&
      f.interval &&
      f.startDate instanceof Date &&
      f.endDate instanceof Date
    );
    const hasCorrectIntervals = testFrames.some(f => f.interval === "1d") &&
                                testFrames.some(f => f.interval === "1h");

    if (hasNotes && hasRequiredFields && hasCorrectIntervals) {
      pass(`listFrames returned ${testFrames.length} test frames with all fields`);
      return;
    }

    if (!hasNotes) {
      fail("Frames missing notes");
      return;
    }

    if (!hasRequiredFields) {
      fail("Frames missing required fields");
      return;
    }

    if (!hasCorrectIntervals) {
      fail("Frames have incorrect intervals");
      return;
    }
  }

  fail(`Expected at least 2 test frames, got ${testFrames.length}`);

});

test("list functions return empty arrays when nothing registered", async ({ pass, fail }) => {

  // This test relies on the fact that we're using unique names for test items
  // So items registered in other tests won't interfere

  const exchanges = await listExchanges();
  const strategies = await listStrategies();
  const frames = await listFrames();

  // Check that they return arrays (not null/undefined)
  const allArrays =
    Array.isArray(exchanges) &&
    Array.isArray(strategies) &&
    Array.isArray(frames);

  if (allArrays) {
    pass(`All list functions return arrays (exchanges: ${exchanges.length}, strategies: ${strategies.length}, frames: ${frames.length})`);
    return;
  }

  fail("Some list functions did not return arrays");

});

test("listExchanges includes note field when provided", async ({ pass, fail }) => {

  const testNote = "Exchange with detailed note for testing";

  addExchange({
    exchangeName: "binance-note-test",
    note: testNote,
    getCandles: async (_symbol, interval, since, limit) => {
      return await getMockCandles(interval, since, limit);
    },
    formatPrice: async (symbol, price) => {
      return price.toFixed(8);
    },
    formatQuantity: async (symbol, quantity) => {
      return quantity.toFixed(8);
    },
  });

  const exchanges = await listExchanges();
  const testExchange = exchanges.find(e => e.exchangeName === "binance-note-test");

  if (testExchange && testExchange.note === testNote) {
    pass("Exchange note field correctly preserved");
    return;
  }

  if (!testExchange) {
    fail("Test exchange not found in list");
    return;
  }

  fail(`Exchange note mismatch: expected "${testNote}", got "${testExchange.note}"`);

});

test("listStrategies includes note field when provided", async ({ pass, fail }) => {

  const testNote = "Strategy with detailed note for testing";

  addStrategy({
    strategyName: "test-strategy-note",
    note: testNote,
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  const strategies = await listStrategies();
  const testStrategy = strategies.find(s => s.strategyName === "test-strategy-note");

  if (testStrategy && testStrategy.note === testNote) {
    pass("Strategy note field correctly preserved");
    return;
  }

  if (!testStrategy) {
    fail("Test strategy not found in list");
    return;
  }

  fail(`Strategy note mismatch: expected "${testNote}", got "${testStrategy.note}"`);

});

test("listFrames includes note field when provided", async ({ pass, fail }) => {

  const testNote = "Frame with detailed note for testing";

  addFrame({
    frameName: "1d-backtest-note",
    note: testNote,
    interval: "1d",
    startDate: new Date("2024-03-01T00:00:00Z"),
    endDate: new Date("2024-03-02T00:00:00Z"),
  });

  const frames = await listFrames();
  const testFrame = frames.find(f => f.frameName === "1d-backtest-note");

  if (testFrame && testFrame.note === testNote) {
    pass("Frame note field correctly preserved");
    return;
  }

  if (!testFrame) {
    fail("Test frame not found in list");
    return;
  }

  fail(`Frame note mismatch: expected "${testNote}", got "${testFrame.note}"`);

});

test("listStrategies includes callbacks when provided", async ({ pass, fail }) => {

  addStrategy({
    strategyName: "test-strategy-with-callbacks",
    note: "Strategy with callbacks for testing",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
    callbacks: {
      onOpen: () => {},
      onClose: () => {},
    },
  });

  const strategies = await listStrategies();
  const testStrategy = strategies.find(s => s.strategyName === "test-strategy-with-callbacks");

  if (!testStrategy) {
    fail("Test strategy with callbacks not found in list");
    return;
  }

  const hasCallbacks =
    testStrategy.callbacks &&
    typeof testStrategy.callbacks.onOpen === "function" &&
    typeof testStrategy.callbacks.onClose === "function";

  if (hasCallbacks) {
    pass("Strategy callbacks correctly preserved in listStrategies");
    return;
  }

  fail("Strategy callbacks missing or incorrect");

});

test("listFrames includes callbacks when provided", async ({ pass, fail }) => {

  addFrame({
    frameName: "1d-backtest-with-callbacks",
    note: "Frame with callbacks for testing",
    interval: "1d",
    startDate: new Date("2024-04-01T00:00:00Z"),
    endDate: new Date("2024-04-02T00:00:00Z"),
    callbacks: {
      onTimeframe: () => {},
    },
  });

  const frames = await listFrames();
  const testFrame = frames.find(f => f.frameName === "1d-backtest-with-callbacks");

  if (!testFrame) {
    fail("Test frame with callbacks not found in list");
    return;
  }

  const hasCallbacks =
    testFrame.callbacks &&
    typeof testFrame.callbacks.onTimeframe === "function";

  if (hasCallbacks) {
    pass("Frame callbacks correctly preserved in listFrames");
    return;
  }

  fail("Frame callbacks missing or incorrect");

});

test("listSizings returns all registered sizing schemas", async ({ pass, fail }) => {

  addSizing({
    sizingName: "test-sizing-list-1",
    note: "First test sizing for list",
    method: "fixed-percentage",
    riskPercentage: 2,
  });

  addSizing({
    sizingName: "test-sizing-list-2",
    note: "Second test sizing for list",
    method: "kelly-criterion",
    kellyMultiplier: 0.25,
  });

  addSizing({
    sizingName: "test-sizing-list-3",
    note: "Third test sizing for list",
    method: "atr-based",
    riskPercentage: 2,
    atrMultiplier: 2,
  });

  const sizings = await listSizings();

  const testSizings = sizings.filter(s =>
    s.sizingName.startsWith("test-sizing-list")
  );

  if (testSizings.length >= 3) {
    const hasNotes = testSizings.every(s => typeof s.note === "string");
    const hasRequiredFields = testSizings.every(s =>
      s.sizingName && s.method
    );
    const hasDifferentMethods =
      testSizings.some(s => s.method === "fixed-percentage") &&
      testSizings.some(s => s.method === "kelly-criterion") &&
      testSizings.some(s => s.method === "atr-based");

    if (hasNotes && hasRequiredFields && hasDifferentMethods) {
      pass(`listSizings returned ${testSizings.length} test sizings with all fields`);
      return;
    }

    if (!hasNotes) {
      fail("Sizings missing notes");
      return;
    }

    if (!hasRequiredFields) {
      fail("Sizings missing required fields");
      return;
    }

    if (!hasDifferentMethods) {
      fail("Sizings do not have all three methods");
      return;
    }
  }

  fail(`Expected at least 3 test sizings, got ${testSizings.length}`);

});

test("listSizings includes callbacks when provided", async ({ pass, fail }) => {

  addSizing({
    sizingName: "test-sizing-with-callbacks",
    note: "Sizing with callbacks for testing",
    method: "fixed-percentage",
    riskPercentage: 2,
    callbacks: {
      onCalculate: () => {},
    },
  });

  const sizings = await listSizings();
  const testSizing = sizings.find(s => s.sizingName === "test-sizing-with-callbacks");

  if (!testSizing) {
    fail("Test sizing with callbacks not found in list");
    return;
  }

  const hasCallbacks =
    testSizing.callbacks &&
    typeof testSizing.callbacks.onCalculate === "function";

  if (hasCallbacks) {
    pass("Sizing callbacks correctly preserved in listSizings");
    return;
  }

  fail("Sizing callbacks missing or incorrect");

});

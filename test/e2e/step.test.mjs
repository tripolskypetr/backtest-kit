import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  setConfig,
  listenActivePing,
  listenActivePingInterval,
  getConfig,
} from "../../build/index.mjs";

const MINUTE_MS = 60_000;
const BASE_PRICE = 95_000;

const alignTimestamp = (timestampMs, intervalMinutes) => {
  const intervalMs = intervalMinutes * MINUTE_MS;
  return Math.floor(timestampMs / intervalMs) * intervalMs;
};

/**
 * Exchange with 1m candles polyfilled from a flat daily bar, plus optional
 * per-minute overrides (minute index counted from startTime).
 */
const addPolyfilledExchange = (exchangeName, startTime, candleByMinute = {}) => {
  addExchangeSchema({
    exchangeName,
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * MINUTE_MS;
        const minute = Math.floor((timestamp - startTime) / MINUTE_MS);
        const custom = candleByMinute[minute];
        result.push(custom
          ? { timestamp, ...custom, volume: 100 }
          : { timestamp, open: BASE_PRICE, high: BASE_PRICE, low: BASE_PRICE, close: BASE_PRICE, volume: 100 });
      }
      return result;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });
};

test("CC_BACKTEST_STEP_MINUTES strides the pending candle loop (one iteration per day)", async ({ pass, fail }) => {
  const STEP_MINUTES = 24 * 60;
  const LIFETIME_DAYS = 3;
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();

  await setConfig({ CC_BACKTEST_STEP_MINUTES: STEP_MINUTES }, true);

  try {
    addPolyfilledExchange("binance-step-pending", startTime);

    let issued = false;
    let activePings = 0;
    addStrategySchema({
      strategyName: "test-strategy-step-pending",
      interval: "1m",
      getSignal: async () => {
        if (issued) return null;
        issued = true;
        return {
          position: "long",
          priceTakeProfit: BASE_PRICE * 2,
          priceStopLoss: BASE_PRICE / 2,
          minuteEstimatedTime: LIFETIME_DAYS * STEP_MINUTES,
        };
      },
      callbacks: {
        onActivePing: () => {
          activePings += 1;
        },
      },
    });

    addFrameSchema({
      frameName: "step-pending-frame",
      interval: "1d",
      startDate: new Date(startTime),
      endDate: new Date(startTime + 10 * STEP_MINUTES * MINUTE_MS),
    });

    const closed = [];
    for await (const result of Backtest.run("BTCUSDT", {
      strategyName: "test-strategy-step-pending",
      exchangeName: "binance-step-pending",
      frameName: "step-pending-frame",
    })) {
      if (result.action === "closed") closed.push(result);
    }

    if (closed.length !== 1 || closed[0].closeReason !== "time_expired") {
      fail(`Expected a single time_expired close, got ${JSON.stringify(closed.map((c) => c.closeReason))}`);
      return;
    }

    // Lifetime = 3 days of 1m candles (4320). A per-minute loop pings 4320
    // times; a daily stride evaluates at the end of day 1, 2, 3 (3 pings) and
    // the trailing expiry candle closes time_expired before pinging.
    if (activePings !== LIFETIME_DAYS) {
      fail(`Expected ${LIFETIME_DAYS} active pings (one per daily stride), got ${activePings}`);
      return;
    }

    pass(`Pending loop strided daily: ${activePings} pings over ${LIFETIME_DAYS * STEP_MINUTES} 1m candles`);
  } finally {
    await setConfig({ CC_BACKTEST_STEP_MINUTES: 0 }, true);
  }
});

test("CC_BACKTEST_STEP_MINUTES: a stop-loss touched on a SKIPPED candle still fires", async ({ pass, fail }) => {
  const STEP_MINUTES = 24 * 60;
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const priceStopLoss = BASE_PRICE - 500;

  await setConfig({ CC_BACKTEST_STEP_MINUTES: STEP_MINUTES }, true);

  try {
    // Minute 700 of day 1 wicks through the SL; it never lands on a daily
    // stride index, so a naive stride would miss it entirely.
    addPolyfilledExchange("binance-step-touch", startTime, {
      700: { open: BASE_PRICE, high: BASE_PRICE, low: priceStopLoss - 100, close: BASE_PRICE },
    });

    let issued = false;
    addStrategySchema({
      strategyName: "test-strategy-step-touch",
      interval: "1m",
      getSignal: async () => {
        if (issued) return null;
        issued = true;
        return {
          position: "long",
          priceTakeProfit: BASE_PRICE * 2,
          priceStopLoss,
          minuteEstimatedTime: 5 * STEP_MINUTES,
        };
      },
    });

    addFrameSchema({
      frameName: "step-touch-frame",
      interval: "1d",
      startDate: new Date(startTime),
      endDate: new Date(startTime + 10 * STEP_MINUTES * MINUTE_MS),
    });

    const closed = [];
    for await (const result of Backtest.run("BTCUSDT", {
      strategyName: "test-strategy-step-touch",
      exchangeName: "binance-step-touch",
      frameName: "step-touch-frame",
    })) {
      if (result.action === "closed") closed.push(result);
    }

    if (closed.length !== 1 || closed[0].closeReason !== "stop_loss") {
      fail(`Expected a single stop_loss close, got ${JSON.stringify(closed.map((c) => c.closeReason))}`);
      return;
    }

    // The touch is detected on the evaluation point of the span containing
    // the wick: the END of day 1 (open + 1439 minutes)
    const expectedCloseTimestamp = startTime + (STEP_MINUTES - 1) * MINUTE_MS;
    if (closed[0].closeTimestamp !== expectedCloseTimestamp) {
      fail(`Expected close at ${new Date(expectedCloseTimestamp).toISOString()}, got ${new Date(closed[0].closeTimestamp).toISOString()}`);
      return;
    }

    if (closed[0].currentPrice !== priceStopLoss) {
      fail(`Expected close at the exact SL level ${priceStopLoss}, got ${closed[0].currentPrice}`);
      return;
    }

    pass("Span-aggregated low caught the SL wick on a skipped candle; closed at the SL level at the span end");
  } finally {
    await setConfig({ CC_BACKTEST_STEP_MINUTES: 0 }, true);
  }
});

test("CC_BACKTEST_STEP_MINUTES larger than a candle chunk still evaluates every chunk (Infinity hold)", async ({ pass, fail }) => {
  const STEP_MINUTES = 24 * 60;
  const CHUNK = 1000;
  const WICK_MINUTE = 2500;
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const priceStopLoss = BASE_PRICE - 500;

  // Infinity-hold signals are replayed in chunks of CC_MAX_CANDLES_PER_REQUEST
  // candles; with a stride longer than the chunk no stride index fits inside a
  // chunk, so each chunk must be evaluated at its last candle instead.
  await setConfig({
    CC_BACKTEST_STEP_MINUTES: STEP_MINUTES,
    CC_MAX_CANDLES_PER_REQUEST: CHUNK,
    CC_MAX_SIGNAL_LIFETIME_MINUTES: Infinity,
  }, true);

  try {
    addPolyfilledExchange("binance-step-chunk", startTime, {
      [WICK_MINUTE]: { open: BASE_PRICE, high: BASE_PRICE, low: priceStopLoss - 100, close: BASE_PRICE },
    });

    let issued = false;
    addStrategySchema({
      strategyName: "test-strategy-step-chunk",
      interval: "1m",
      getSignal: async () => {
        if (issued) return null;
        issued = true;
        return {
          position: "long",
          priceTakeProfit: BASE_PRICE * 2,
          priceStopLoss,
          minuteEstimatedTime: Infinity,
        };
      },
    });

    addFrameSchema({
      frameName: "step-chunk-frame",
      interval: "1d",
      startDate: new Date(startTime),
      endDate: new Date(startTime + 10 * STEP_MINUTES * MINUTE_MS),
    });

    const closed = [];
    for await (const result of Backtest.run("BTCUSDT", {
      strategyName: "test-strategy-step-chunk",
      exchangeName: "binance-step-chunk",
      frameName: "step-chunk-frame",
    })) {
      if (result.action === "closed") closed.push(result);
    }

    if (closed.length !== 1 || closed[0].closeReason !== "stop_loss") {
      fail(`Expected a single stop_loss close, got ${JSON.stringify(closed.map((c) => c.closeReason))}`);
      return;
    }

    const closeMinute = (closed[0].closeTimestamp - startTime) / MINUTE_MS;
    // Detected at the end of the chunk that contains the wick: after the wick,
    // within one chunk of it
    if (closeMinute < WICK_MINUTE || closeMinute >= WICK_MINUTE + CHUNK) {
      fail(`Expected the close within one chunk after minute ${WICK_MINUTE}, got minute ${closeMinute}`);
      return;
    }

    if (closed[0].currentPrice !== priceStopLoss) {
      fail(`Expected close at the exact SL level ${priceStopLoss}, got ${closed[0].currentPrice}`);
      return;
    }

    pass(`Chunk shorter than the stride was evaluated at its last candle; SL wick at minute ${WICK_MINUTE} closed at minute ${closeMinute}`);
  } finally {
    await setConfig({
      CC_BACKTEST_STEP_MINUTES: 0,
      CC_MAX_CANDLES_PER_REQUEST: 1000,
      CC_MAX_SIGNAL_LIFETIME_MINUTES: 999999,
    }, true);
  }
});

// ---------------------------------------------------------------------------
// A stride that is NOT a multiple of the timeframe (4h 03m on a 1h frame)
// ---------------------------------------------------------------------------

const ODD_STEP_MINUTES = 243;

/** Active pings of the strategy as minute offsets from the position's open */
const collectPingOffsets = (strategyName, listen = listenActivePing, options) => {
  const offsets = [];
  const unsubscribe = options
    ? listen((event) => { if (event.strategyName === strategyName) offsets.push((event.timestamp - event.data.pendingAt) / MINUTE_MS); }, options)
    : listen((event) => { if (event.strategyName === strategyName) offsets.push((event.timestamp - event.data.pendingAt) / MINUTE_MS); });
  return { offsets, unsubscribe };
};

test("CC_BACKTEST_STEP_MINUTES not a multiple of the timeframe: spans end at step-1, drift past the hour, time_expired stays exact", async ({ pass, fail }) => {
  const HOLD_MINUTES = 1000;
  const startTime = new Date("2024-03-01T00:00:00Z").getTime();
  await setConfig({ CC_BACKTEST_STEP_MINUTES: ODD_STEP_MINUTES }, true);

  const strategyName = "test-strategy-step-odd";
  const pings = collectPingOffsets(strategyName);
  const hourly = collectPingOffsets(strategyName, listenActivePingInterval, { interval: "1h" });
  try {
    addPolyfilledExchange("binance-step-odd", startTime);
    let issued = false;
    addStrategySchema({
      strategyName,
      interval: "1h",
      getSignal: async () => {
        if (issued) return null;
        issued = true;
        return { position: "long", priceTakeProfit: BASE_PRICE * 2, priceStopLoss: BASE_PRICE / 2, minuteEstimatedTime: HOLD_MINUTES };
      },
    });
    addFrameSchema({
      frameName: "step-odd-frame",
      interval: "1h",
      startDate: new Date(startTime),
      endDate: new Date(startTime + 30 * 60 * MINUTE_MS),
    });

    const closed = [];
    for await (const result of Backtest.run("BTCUSDT", { strategyName, exchangeName: "binance-step-odd", frameName: "step-odd-frame" })) {
      if (result.action === "closed") closed.push(result);
    }

    // one evaluation per span, at the span END: step-1, 2·step-1, … while the hold lasts
    const expected = [];
    for (let offset = ODD_STEP_MINUTES - 1; offset < HOLD_MINUTES; offset += ODD_STEP_MINUTES) expected.push(offset);
    if (pings.offsets.join(",") !== expected.join(",")) {
      return fail(`expected evaluations at ${expected.join(",")} minutes from the open, got ${pings.offsets.join(",")}`);
    }
    // the evaluation points drift (step mod 60) minutes further past the hour on every span
    const drift = pings.offsets.map((offset) => (offset + 1) % 60);
    if (drift.join(",") !== expected.map((_, i) => ((i + 1) * ODD_STEP_MINUTES) % 60).join(",")) {
      return fail(`expected the evaluation to drift ${ODD_STEP_MINUTES % 60} minutes per span past the hour, got ${drift.join(",")}`);
    }
    // the trailing partial span is evaluated at the last candle of the hold: time_expired is exact
    if (closed.length !== 1 || closed[0].closeReason !== "time_expired") {
      return fail(`expected one time_expired close, got ${JSON.stringify(closed.map((c) => c.closeReason))}`);
    }
    const closeOffset = (closed[0].closeTimestamp - startTime) / MINUTE_MS;
    if (closeOffset !== HOLD_MINUTES) return fail(`expected the close exactly ${HOLD_MINUTES} minutes after the open, got ${closeOffset}`);
    // the 1h interval listener skips the first evaluation and then delivers on every one (each span crosses an hour)
    if (hourly.offsets.join(",") !== expected.slice(1).join(",")) {
      return fail(`listenActivePingInterval(1h) expected ${expected.slice(1).join(",")}, got ${hourly.offsets.join(",")}`);
    }
    pass(`evaluated at +${pings.offsets.join("/+")} (drift ${ODD_STEP_MINUTES % 60} min per span), closed exactly at +${closeOffset}, 1h interval deliveries at +${hourly.offsets.join("/+")}`);
  } finally {
    pings.unsubscribe();
    hourly.unsubscribe();
    await setConfig({ CC_BACKTEST_STEP_MINUTES: 0 }, true);
  }
});

test("CC_BACKTEST_STEP_MINUTES not a multiple of the chunk: the stride restarts at every chunk (step, step, remainder)", async ({ pass, fail }) => {
  const CHUNK = 600;
  const startTime = new Date("2024-03-01T00:00:00Z").getTime();
  await setConfig({
    CC_BACKTEST_STEP_MINUTES: ODD_STEP_MINUTES,
    CC_MAX_CANDLES_PER_REQUEST: CHUNK,
    CC_MAX_SIGNAL_LIFETIME_MINUTES: Infinity,
  }, true);

  const strategyName = "test-strategy-step-odd-chunk";
  const pings = collectPingOffsets(strategyName);
  try {
    addPolyfilledExchange("binance-step-odd-chunk", startTime);
    let issued = false;
    addStrategySchema({
      strategyName,
      interval: "1h",
      getSignal: async () => {
        if (issued) return null;
        issued = true;
        return { position: "long", priceTakeProfit: BASE_PRICE * 2, priceStopLoss: BASE_PRICE / 2, minuteEstimatedTime: Infinity };
      },
    });
    addFrameSchema({
      frameName: "step-odd-chunk-frame",
      interval: "1h",
      startDate: new Date(startTime),
      endDate: new Date(startTime + 30 * 60 * MINUTE_MS),
    });

    for await (const _ of Backtest.run("BTCUSDT", { strategyName, exchangeName: "binance-step-odd-chunk", frameName: "step-odd-chunk-frame" })) { /* drain */ }

    // every chunk carries a VWAP buffer in front: its evaluable length is CHUNK - (CC_AVG_PRICE_CANDLES_COUNT - 1)
    const chunkSpan = CHUNK - (getConfig().CC_AVG_PRICE_CANDLES_COUNT - 1);
    const fullSpans = Math.floor(chunkSpan / ODD_STEP_MINUTES);
    const remainder = chunkSpan - fullSpans * ODD_STEP_MINUTES;
    const gaps = pings.offsets.map((offset, i) => (i ? offset - pings.offsets[i - 1] : offset + 1));
    const pattern = [...Array(fullSpans).fill(ODD_STEP_MINUTES), remainder];
    // at least two full chunks of the pattern must be visible before the frame-end chunk
    const periods = Math.floor(gaps.length / pattern.length);
    if (periods < 2) return fail(`expected at least two chunks of ${pattern.join(",")}, got gaps ${gaps.join(",")}`);
    for (let i = 0; i < periods * pattern.length; i++) {
      if (gaps[i] !== pattern[i % pattern.length]) {
        return fail(`chunk ${Math.floor(i / pattern.length)}: expected the gap pattern ${pattern.join(",")} (the stride restarts at every chunk), got gaps ${gaps.join(",")}`);
      }
    }
    pass(`gaps ${gaps.slice(0, periods * pattern.length).join(",")}: the ${ODD_STEP_MINUTES}-minute stride restarts in every ${chunkSpan}-minute chunk, remainder ${remainder}`);
  } finally {
    pings.unsubscribe();
    await setConfig({
      CC_BACKTEST_STEP_MINUTES: 0,
      CC_MAX_CANDLES_PER_REQUEST: 1000,
      CC_MAX_SIGNAL_LIFETIME_MINUTES: 999999,
    }, true);
  }
});

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

// The watch stride is a property of the frame (IFrameSchema.watchInterval): an
// open or scheduled signal is re-evaluated once per watch span, at its last
// candle; "1m" (the default) evaluates every candle.

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

test("watchInterval 1d strides the pending candle loop (one iteration per day)", async ({ pass, fail }) => {
  const STEP_MINUTES = 24 * 60;
  const LIFETIME_DAYS = 3;
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();

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
      watchInterval: "1d",
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
    // nothing to restore: the stride lives in the frame schema
  }
});

test("watchInterval 1d: a stop-loss touched on a SKIPPED candle still fires", async ({ pass, fail }) => {
  const STEP_MINUTES = 24 * 60;
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const priceStopLoss = BASE_PRICE - 500;

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
      watchInterval: "1d",
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
    // nothing to restore: the stride lives in the frame schema
  }
});

test("watchInterval 1d longer than the exchange page: the replay window is one whole day (Infinity hold)", async ({ pass, fail }) => {
  const STEP_MINUTES = 24 * 60;
  const CHUNK = 1000;
  const WICK_MINUTE = 2500;
  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const priceStopLoss = BASE_PRICE - 500;

  // Infinity-hold signals are replayed in windows of whole spans: with a stride
  // longer than CC_MAX_CANDLES_PER_REQUEST the window is one span (buffer + step),
  // paged by the exchange layer, so the daily grid survives the window boundary.
  await setConfig({
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
      watchInterval: "1d",
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
    // Detected at the end of the daily span that contains the wick, not at the
    // end of a 1000-candle chunk: the window is rounded to whole spans
    const expectedClose = (Math.floor(WICK_MINUTE / STEP_MINUTES) + 1) * STEP_MINUTES - 1;
    if (closeMinute !== expectedClose) {
      fail(`Expected the close at the end of the daily span holding minute ${WICK_MINUTE} (minute ${expectedClose}), got minute ${closeMinute}`);
      return;
    }

    if (closed[0].currentPrice !== priceStopLoss) {
      fail(`Expected close at the exact SL level ${priceStopLoss}, got ${closed[0].currentPrice}`);
      return;
    }

    pass(`Window rounded to one daily span (${CHUNK}-candle chunk paged); SL wick at minute ${WICK_MINUTE} closed at minute ${closeMinute}`);
  } finally {
    await setConfig({
      CC_MAX_CANDLES_PER_REQUEST: 1000,
      CC_MAX_SIGNAL_LIFETIME_MINUTES: 999999,
    }, true);
  }
});

// ---------------------------------------------------------------------------
// A watch stride that is NOT a multiple of the entry interval, and one that
// is not a multiple of the exchange page
// ---------------------------------------------------------------------------

/** Active pings of the strategy as minute offsets from the position's open */
const collectPingOffsets = (strategyName, listen = listenActivePing, options) => {
  const offsets = [];
  const unsubscribe = options
    ? listen((event) => { if (event.strategyName === strategyName) offsets.push((event.timestamp - event.data.pendingAt) / MINUTE_MS); }, options)
    : listen((event) => { if (event.strategyName === strategyName) offsets.push((event.timestamp - event.data.pendingAt) / MINUTE_MS); });
  return { offsets, unsubscribe };
};

test("watchInterval 5m on a 3m entry interval: spans end at step-1, drift past the tick grid, time_expired stays exact", async ({ pass, fail }) => {
  const WATCH_MINUTES = 5;
  const ENTRY_MINUTES = 3;
  const HOLD_MINUTES = 60;
  const startTime = new Date("2024-03-01T00:00:00Z").getTime();

  const strategyName = "test-strategy-step-odd";
  const pings = collectPingOffsets(strategyName);
  const quarterHourly = collectPingOffsets(strategyName, listenActivePingInterval, { interval: "15m" });
  try {
    addPolyfilledExchange("binance-step-odd", startTime);
    let issued = false;
    addStrategySchema({
      strategyName,
      interval: "3m",
      getSignal: async () => {
        if (issued) return null;
        issued = true;
        return { position: "long", priceTakeProfit: BASE_PRICE * 2, priceStopLoss: BASE_PRICE / 2, minuteEstimatedTime: HOLD_MINUTES };
      },
    });
    addFrameSchema({
      frameName: "step-odd-frame",
      entryInterval: "3m",
      watchInterval: "5m",
      startDate: new Date(startTime),
      endDate: new Date(startTime + 3 * 60 * MINUTE_MS),
    });

    const closed = [];
    for await (const result of Backtest.run("BTCUSDT", { strategyName, exchangeName: "binance-step-odd", frameName: "step-odd-frame" })) {
      if (result.action === "closed") closed.push(result);
    }

    // one evaluation per span, at the span END: step-1, 2·step-1, … while the hold lasts
    const expected = [];
    for (let offset = WATCH_MINUTES - 1; offset < HOLD_MINUTES; offset += WATCH_MINUTES) expected.push(offset);
    if (pings.offsets.join(",") !== expected.join(",")) {
      return fail(`expected evaluations at ${expected.join(",")} minutes from the open, got ${pings.offsets.join(",")}`);
    }
    // 5 is not a multiple of 3: the evaluation points drift (5 mod 3 = 2) minutes past the tick grid on every span
    const drift = pings.offsets.map((offset) => (offset + 1) % ENTRY_MINUTES);
    if (drift.join(",") !== expected.map((_, i) => ((i + 1) * WATCH_MINUTES) % ENTRY_MINUTES).join(",")) {
      return fail(`expected the evaluation to drift ${WATCH_MINUTES % ENTRY_MINUTES} minutes per span past the ${ENTRY_MINUTES}m grid, got ${drift.join(",")}`);
    }
    // the trailing partial span is evaluated at the last candle of the hold: time_expired is exact
    if (closed.length !== 1 || closed[0].closeReason !== "time_expired") {
      return fail(`expected one time_expired close, got ${JSON.stringify(closed.map((c) => c.closeReason))}`);
    }
    const closeOffset = (closed[0].closeTimestamp - startTime) / MINUTE_MS;
    if (closeOffset !== HOLD_MINUTES) return fail(`expected the close exactly ${HOLD_MINUTES} minutes after the open, got ${closeOffset}`);
    // the 15m interval listener skips the first evaluation and then delivers on the first evaluation past each 15m point
    const expectedDeliveries = [];
    for (let point = 15; point < HOLD_MINUTES; point += 15) {
      const hit = expected.find((offset) => offset >= point && offset !== expected[0]);
      if (hit !== undefined && !expectedDeliveries.includes(hit)) expectedDeliveries.push(hit);
    }
    if (quarterHourly.offsets.join(",") !== expectedDeliveries.join(",")) {
      return fail(`listenActivePingInterval(15m) expected ${expectedDeliveries.join(",")}, got ${quarterHourly.offsets.join(",")}`);
    }
    pass(`evaluated at +${pings.offsets.join("/+")} (drift ${WATCH_MINUTES % ENTRY_MINUTES} min per span), closed exactly at +${closeOffset}, 15m interval deliveries at +${quarterHourly.offsets.join("/+")}`);
  } finally {
    pings.unsubscribe();
    quarterHourly.unsubscribe();
  }
});

test("watchInterval 4h not a multiple of the exchange page: the replay window holds whole spans, the grid stays regular", async ({ pass, fail }) => {
  const WATCH_MINUTES = 240;
  const CHUNK = 600;
  const startTime = new Date("2024-03-01T00:00:00Z").getTime();
  await setConfig({
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
      entryInterval: "1h",
      watchInterval: "4h",
      startDate: new Date(startTime),
      endDate: new Date(startTime + 40 * 60 * MINUTE_MS),
    });

    for await (const _ of Backtest.run("BTCUSDT", { strategyName, exchangeName: "binance-step-odd-chunk", frameName: "step-odd-chunk-frame" })) { /* drain */ }

    // the window is buffer + 2 spans (2 × 240 = 480 fits 600 − 4), so the stride never meets a partial window
    // before the frame end: every gap is the step
    const windowSpans = Math.floor((CHUNK - (getConfig().CC_AVG_PRICE_CANDLES_COUNT - 1)) / WATCH_MINUTES);
    if (windowSpans !== 2) return fail(`the scenario expects a two-span window, got ${windowSpans}`);
    const gaps = pings.offsets.map((offset, i) => (i ? offset - pings.offsets[i - 1] : offset + 1));
    const regular = gaps.slice(0, -1);
    if (regular.length < 2 * windowSpans + 1) return fail(`expected the grid to cross at least two window boundaries, got gaps ${gaps.join(",")}`);
    if (regular.some((gap) => gap !== WATCH_MINUTES)) {
      return fail(`expected every gap before the frame end to be ${WATCH_MINUTES} (whole spans per window), got ${gaps.join(",")}`);
    }
    if (gaps[gaps.length - 1] > WATCH_MINUTES) return fail(`the frame-end remainder cannot exceed a span, got ${gaps[gaps.length - 1]}`);
    pass(`gaps ${gaps.join(",")}: 4h watch regular across ${Math.ceil(regular.length / windowSpans)} windows of ${windowSpans} spans, frame-end remainder ${gaps[gaps.length - 1]}`);
  } finally {
    pings.unsubscribe();
    await setConfig({
      CC_MAX_CANDLES_PER_REQUEST: 1000,
      CC_MAX_SIGNAL_LIFETIME_MINUTES: 999999,
    }, true);
  }
});

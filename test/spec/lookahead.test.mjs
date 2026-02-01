import { test } from "worker-testbed";
import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  getCandles,
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

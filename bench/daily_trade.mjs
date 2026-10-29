import { setConfig, addExchangeSchema, addStrategySchema, addFrameSchema, Backtest, listenActivePing } from "../build/index.mjs";
setConfig({
    CC_MAX_STOPLOSS_DISTANCE_PERCENT: 50,
});
const MIN = 60_000, DAY = 1440;
const T0 = Date.parse("2024-05-01T00:00:00Z");
const DAYS = 60;
const minute = (t) => (t - T0) / MIN;
// a slow drift up with a daily wobble: levels and extremes keep moving, no stop or take is hit
const price = (m) => 100 + 0.0002 * m + 0.5 * Math.sin(m / 180);
addExchangeSchema({ exchangeName: "bench-ex", getCandles: async (_s, _i, since, limit) => { const out = []; let t = Math.floor(since.getTime() / MIN) * MIN; while (out.length < limit) { const p = price(minute(t)); out.push({ timestamp: t, open: p, high: p + 0.2, low: p - 0.2, close: p, volume: 1000 }); t += MIN; } return out; }, formatPrice: async (_s, p) => p.toFixed(8), formatQuantity: async (_s, q) => q.toFixed(8) });
// one market long per day, 1400-minute hold: a position is open ~97% of the time
addStrategySchema({ strategyName: "bench-st", interval: "1d", getSignal: async (_s, when) => ({ position: "long", priceTakeProfit: price(minute(when.getTime())) + 30, priceStopLoss: price(minute(when.getTime())) - 30, cost: 1000, minuteEstimatedTime: 1400 }) });
const results = {};
for (const watch of ["4h", "1d"]) {
  addFrameSchema({ frameName: `bench-fr-${watch}`, entryInterval: "1d", watchInterval: watch, startDate: new Date(T0), endDate: new Date(T0 + DAYS * DAY * MIN) });
  let pings = 0, closed = 0;
  const un = listenActivePing((e) => { if (e.data.strategyName === "bench-st") pings += 1; });
  const started = performance.now();
  for await (const r of Backtest.run("BTCUSDT", { strategyName: "bench-st", exchangeName: "bench-ex", frameName: `bench-fr-${watch}` })) { if (r.action === "closed") closed += 1; }
  const ms = Math.round(performance.now() - started);
  un();
  results[watch] = { ms, pings, closed };
  console.log(`RESULT ${watch}: ${ms} ms, ${pings} active pings, ${closed} closes`);
}
process.exit(0);
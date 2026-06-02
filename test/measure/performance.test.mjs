import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";

// PerformanceMarkdownService math coverage.
// Bug history:
// - percentile() used nearest-rank with ceil so p99 == max for any N≤100.
//   Fix: linear interpolation between adjacent ranks (numpy default).
// - stdDev divided by N (population). Fix: N-1 (sample, Bessel correction).
// - percentage of total time crashed with NaN% when totalDuration=0.
//   Fix: guard `totalDuration > 0` + isUnsafe-style fallback to 0.

const STRATEGY = "perf-edge";
const EXCHANGE = "ccxt-exchange";
const FRAME = "perf-frame";
const SYMBOL = "EDGE-PERF";

const T0 = Date.UTC(2026, 0, 1, 0, 0, 0);

const event = (id, metricType, duration, offset = 0, previousOffset = null, symbolOverride = SYMBOL) => ({
  timestamp: T0 + offset,
  previousTimestamp: previousOffset === null ? null : T0 + previousOffset,
  metricType,
  duration,
  strategyName: STRATEGY,
  exchangeName: EXCHANGE,
  frameName: FRAME,
  symbol: symbolOverride,
  backtest: true,
});

const sampleStdDev = (xs) => {
  if (xs.length < 2) return 0;
  const avg = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, r) => s + (r - avg) ** 2, 0) / (xs.length - 1));
};

const linearPercentile = (sorted, p) => {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  const f = rank - lo;
  return sorted[lo] * (1 - f) + sorted[hi] * f;
};

// ---------------------------------------------------------------------------
// Test 1: linear-interpolation percentile, sample stddev (N-1).
// 11 events at durations [10, 20, ..., 110]. For p99 with N=11:
//   rank = 0.99 * 10 = 9.9 → lo=9, hi=10 → 100*0.1 + 110*0.9 = 109.
// Old nearest-rank code: ceil(0.99*11) - 1 = 10 → durations[10] = 110.
// The test will fail if p99 == 110 (regression).
// ---------------------------------------------------------------------------
test("performance: percentile uses linear interpolation, stddev uses N-1", async ({ pass, fail }) => {
  const svc = lib.performanceMarkdownService;
  svc.subscribe();
  await svc.clear({ symbol: SYMBOL, strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  const durations = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110];
  for (let i = 0; i < durations.length; i++) {
    await svc.track(event(`e${i}`, "backtest_signal", durations[i], i * 1000, i === 0 ? null : (i - 1) * 1000));
  }

  const stats = await svc.getData(SYMBOL, STRATEGY, EXCHANGE, FRAME, true);
  const m = stats.metricStats["backtest_signal"];
  if (!m) return fail(`metricStats.backtest_signal missing`);

  const sorted = [...durations].sort((a, b) => a - b);
  const expectedP50 = linearPercentile(sorted, 50);
  const expectedP95 = linearPercentile(sorted, 95);
  const expectedP99 = linearPercentile(sorted, 99);
  const expectedStdDev = sampleStdDev(durations);

  if (Math.abs(m.median - expectedP50) > 1e-9) return fail(`median: expected ${expectedP50}, got ${m.median}`);
  if (Math.abs(m.p95 - expectedP95) > 1e-9) return fail(`p95: expected ${expectedP95}, got ${m.p95}`);
  if (Math.abs(m.p99 - expectedP99) > 1e-9) return fail(`p99: expected ${expectedP99}, got ${m.p99}`);

  // Regression check: p99 must NOT equal max for N=11. Old code returned max.
  if (m.p99 === 110) return fail(`p99 must not equal max (110) — that's the old nearest-rank bug`);

  if (Math.abs(m.stdDev - expectedStdDev) > 1e-9) {
    return fail(`stdDev: expected ${expectedStdDev} (sample, N-1), got ${m.stdDev}`);
  }

  pass(`Percentile linear interpolation + sample stddev verified (p99=${m.p99.toFixed(2)}, stdDev=${m.stdDev.toFixed(3)})`);
});

// ---------------------------------------------------------------------------
// Test 2: division-by-zero guard for all-zero durations.
// All events have duration=0 → totalDuration=0. The percentage-of-total
// calculation must not produce NaN%. We can't assert on the markdown string
// directly without rendering, so we assert on the stats and that getReport
// does not throw or contain "NaN".
// ---------------------------------------------------------------------------
test("performance: all-zero durations — pct guard, no NaN in report", async ({ pass, fail }) => {
  const svc = lib.performanceMarkdownService;
  svc.subscribe();
  await svc.clear({ symbol: "ZEROS-PERF", strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  for (let i = 0; i < 5; i++) {
    await svc.track(event(`z${i}`, "live_tick", 0, i * 1000, i === 0 ? null : (i - 1) * 1000, "ZEROS-PERF"));
  }

  const stats = await svc.getData("ZEROS-PERF", STRATEGY, EXCHANGE, FRAME, true);
  if (stats.totalDuration !== 0) return fail(`totalDuration must be 0, got ${stats.totalDuration}`);

  const m = stats.metricStats["live_tick"];
  if (!m) return fail(`metricStats.live_tick missing`);
  if (m.avgDuration !== 0) return fail(`avgDuration must be 0, got ${m.avgDuration}`);
  if (m.stdDev !== 0) return fail(`stdDev must be 0 for identical zeros, got ${m.stdDev}`);

  const md = await svc.getReport(STRATEGY);
  if (/NaN/.test(md)) return fail(`getReport contains "NaN" — pct guard regression. report:\n${md}`);
  pass(`All-zero durations: no NaN, stats safe`);
});

// ---------------------------------------------------------------------------
// Test 3: multiple metric types in one storage — aggregation per type.
// ---------------------------------------------------------------------------
test("performance: multi-metric grouping — each type aggregated independently", async ({ pass, fail }) => {
  const svc = lib.performanceMarkdownService;
  svc.subscribe();
  await svc.clear({ symbol: "MULTI-PERF", strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  for (let i = 0; i < 3; i++) await svc.track(event(`a${i}`, "backtest_timeframe", 100 + i * 10, i * 1000, null, "MULTI-PERF"));
  for (let i = 0; i < 3; i++) await svc.track(event(`b${i}`, "backtest_signal", 5 + i, 10_000 + i * 1000, null, "MULTI-PERF"));

  const stats = await svc.getData("MULTI-PERF", STRATEGY, EXCHANGE, FRAME, true);
  if (stats.totalEvents !== 6) return fail(`totalEvents must be 6, got ${stats.totalEvents}`);

  const tf = stats.metricStats["backtest_timeframe"];
  const sg = stats.metricStats["backtest_signal"];
  if (!tf || !sg) return fail(`expected both metric types present`);
  if (tf.count !== 3 || sg.count !== 3) return fail(`each type must have count=3, got tf=${tf.count} sg=${sg.count}`);
  if (Math.abs(tf.avgDuration - 110) > 1e-9) return fail(`tf.avgDuration must be 110, got ${tf.avgDuration}`);
  if (Math.abs(sg.avgDuration - 6) > 1e-9) return fail(`sg.avgDuration must be 6, got ${sg.avgDuration}`);
  pass(`Multi-metric grouping verified (tf avg=${tf.avgDuration}, sg avg=${sg.avgDuration})`);
});

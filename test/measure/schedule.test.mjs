import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";

// ScheduleMarkdownService math coverage.
// Bug history:
// - activationRate / cancellationRate used to inflate above 100% when the
//   "scheduled" record was evicted from the buffer before its outcome
//   arrived. Fix: match by signalId so denominator only counts scheduled
//   signals whose outcome (opened|cancelled) is also present.
// - duration was rounded to whole minutes, zeroing out sub-30s waits. Fix:
//   keep fractional minutes.
// - avgWaitTime / avgActivationTime used `e.duration || 0` so missing
//   durations diluted the mean. Fix: filter to `typeof === "number"`.

const STRATEGY = "schedule-edge";
const EXCHANGE = "ccxt-exchange";
const FRAME = "edge-frame";
const SYMBOL = "EDGE-SCHED";

const T0 = Date.UTC(2026, 0, 1, 0, 0, 0);

const baseSignal = (id, { scheduledAt, pendingAt }) => ({
  id,
  symbol: SYMBOL,
  position: "long",
  note: "synthetic",
  priceOpen: 100,
  priceStopLoss: 95,
  priceTakeProfit: 105,
  originalPriceTakeProfit: 105,
  originalPriceStopLoss: 95,
  originalPriceOpen: 100,
  totalEntries: 1,
  totalPartials: 0,
  partialExecuted: 0,
  scheduledAt,
  pendingAt,
  exchangeName: EXCHANGE,
  strategyName: STRATEGY,
  frameName: FRAME,
});

const scheduledTick = (id, scheduledAt) => ({
  action: "scheduled",
  signal: baseSignal(id, { scheduledAt, pendingAt: scheduledAt }),
  currentPrice: 100,
  strategyName: STRATEGY,
  exchangeName: EXCHANGE,
  frameName: FRAME,
  symbol: SYMBOL,
  backtest: true,
});

// `opened` after schedule: scheduledAt !== pendingAt → service records the
// opened event with duration = pendingAt - scheduledAt (minutes).
const openedTick = (id, scheduledAt, pendingAt) => ({
  action: "opened",
  signal: baseSignal(id, { scheduledAt, pendingAt }),
  currentPrice: 100,
  strategyName: STRATEGY,
  exchangeName: EXCHANGE,
  frameName: FRAME,
  symbol: SYMBOL,
  backtest: true,
});

const cancelledTick = (id, scheduledAt, closeTimestamp, reason = "time_expired") => ({
  action: "cancelled",
  signal: baseSignal(id, { scheduledAt, pendingAt: scheduledAt }),
  currentPrice: 100,
  closeTimestamp,
  reason,
  cancelId: `cancel-${id}`,
  strategyName: STRATEGY,
  exchangeName: EXCHANGE,
  frameName: FRAME,
  symbol: SYMBOL,
  backtest: true,
});

// ---------------------------------------------------------------------------
// Test 1: rates capped at 100% via signalId matching.
// 4 scheduled signals: 2 opened, 1 cancelled, 1 still pending (no outcome).
// resolvedScheduled = 2 opened + 1 cancelled = 3.
// activationRate = 2/3 * 100 ≈ 66.67%, cancellationRate = 1/3 * 100 ≈ 33.33%.
// Critical: the orphan-opened (no prior schedule) must NOT inflate denominator.
// ---------------------------------------------------------------------------
test("schedule: activationRate + cancellationRate match resolved scheduled by signalId, sum ≤ 100%", async ({ pass, fail }) => {
  const svc = lib.scheduleMarkdownService;
  svc.subscribe();
  await svc.clear({ symbol: SYMBOL, strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  await svc.tick(scheduledTick("s1", T0));
  await svc.tick(scheduledTick("s2", T0 + 60_000));
  await svc.tick(scheduledTick("s3", T0 + 120_000));
  await svc.tick(scheduledTick("s4", T0 + 180_000)); // still pending

  // s1 and s2 opened
  await svc.tick(openedTick("s1", T0, T0 + 30 * 60_000));
  await svc.tick(openedTick("s2", T0 + 60_000, T0 + 90 * 60_000));
  // s3 cancelled
  await svc.tick(cancelledTick("s3", T0 + 120_000, T0 + 150 * 60_000));
  // ORPHAN opened — no prior schedule. It DOES carry scheduledAt !== pendingAt
  // so the service stores it, but matching by signalId excludes it from rates.
  await svc.tick(openedTick("orphan", T0 + 500_000, T0 + 800_000));

  const stats = await svc.getData(SYMBOL, STRATEGY, EXCHANGE, FRAME, true);

  if (stats.totalScheduled !== 4) {
    fail(`totalScheduled must be 4, got ${stats.totalScheduled}`);
    return;
  }
  if (stats.totalOpened !== 3) {
    fail(`totalOpened must be 3 (2 from scheduled + 1 orphan), got ${stats.totalOpened}`);
    return;
  }
  if (stats.totalCancelled !== 1) {
    fail(`totalCancelled must be 1, got ${stats.totalCancelled}`);
    return;
  }

  const expectedActivation = (2 / 3) * 100;
  const expectedCancellation = (1 / 3) * 100;
  if (Math.abs(stats.activationRate - expectedActivation) > 1e-9) {
    fail(`activationRate must be ${expectedActivation} (2 of 3 resolved), got ${stats.activationRate}`);
    return;
  }
  if (Math.abs(stats.cancellationRate - expectedCancellation) > 1e-9) {
    fail(`cancellationRate must be ${expectedCancellation}, got ${stats.cancellationRate}`);
    return;
  }
  if (Math.abs((stats.activationRate + stats.cancellationRate) - 100) > 1e-9) {
    fail(`activation + cancellation must sum to 100% over resolved set, got ${stats.activationRate + stats.cancellationRate}`);
    return;
  }

  pass(`Rates verified: activation=${stats.activationRate.toFixed(2)}%, cancellation=${stats.cancellationRate.toFixed(2)}%, orphan excluded`);
});

// ---------------------------------------------------------------------------
// Test 2: avgActivationTime / avgWaitTime — fractional minutes preserved,
// missing durations not zero-diluted.
// ---------------------------------------------------------------------------
test("schedule: avgActivationTime keeps fractional minutes (no round-to-int zero dilution)", async ({ pass, fail }) => {
  const svc = lib.scheduleMarkdownService;
  svc.subscribe();
  await svc.clear({ symbol: SYMBOL, strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  // Three sub-minute waits: 10s, 20s, 50s → 1/6, 1/3, 5/6 minutes.
  // Old code rounded each to 0 minutes → avgActivationTime = 0.
  // Fixed code keeps fractions → avg = (1/6 + 1/3 + 5/6) / 3 = 4/9 ≈ 0.444 min.
  await svc.tick(scheduledTick("t1", T0));
  await svc.tick(scheduledTick("t2", T0 + 1000));
  await svc.tick(scheduledTick("t3", T0 + 2000));

  await svc.tick(openedTick("t1", T0, T0 + 10_000)); // 10s
  await svc.tick(openedTick("t2", T0 + 1000, T0 + 1000 + 20_000)); // 20s
  await svc.tick(openedTick("t3", T0 + 2000, T0 + 2000 + 50_000)); // 50s

  const stats = await svc.getData(SYMBOL, STRATEGY, EXCHANGE, FRAME, true);

  const expected = (10 / 60 + 20 / 60 + 50 / 60) / 3;
  if (stats.avgActivationTime === null) {
    fail(`avgActivationTime must be non-null with 3 opened events, got null`);
    return;
  }
  if (Math.abs(stats.avgActivationTime - expected) > 1e-9) {
    fail(`avgActivationTime must be ${expected} min (fractional), got ${stats.avgActivationTime}`);
    return;
  }
  if (Math.abs(stats.avgActivationTime) < 1e-6) {
    fail(`avgActivationTime must NOT be ≈0 — old buggy code rounded sub-30s waits to 0`);
    return;
  }

  pass(`Fractional minutes preserved: avgActivationTime=${stats.avgActivationTime.toFixed(6)} min`);
});

// ---------------------------------------------------------------------------
// Test 3: empty state — all-null aggregates.
// ---------------------------------------------------------------------------
test("schedule: empty state — totals zero, rates and durations null", async ({ pass, fail }) => {
  const svc = lib.scheduleMarkdownService;
  svc.subscribe();
  await svc.clear({ symbol: "EMPTY-SCHED", strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  const stats = await svc.getData("EMPTY-SCHED", STRATEGY, EXCHANGE, FRAME, true);

  if (stats.totalScheduled !== 0) return fail(`totalScheduled must be 0, got ${stats.totalScheduled}`);
  if (stats.totalOpened !== 0) return fail(`totalOpened must be 0, got ${stats.totalOpened}`);
  if (stats.totalCancelled !== 0) return fail(`totalCancelled must be 0, got ${stats.totalCancelled}`);
  if (stats.activationRate !== null) return fail(`activationRate must be null on empty state, got ${stats.activationRate}`);
  if (stats.cancellationRate !== null) return fail(`cancellationRate must be null on empty state, got ${stats.cancellationRate}`);
  if (stats.avgActivationTime !== null) return fail(`avgActivationTime must be null on empty state, got ${stats.avgActivationTime}`);
  if (stats.avgWaitTime !== null) return fail(`avgWaitTime must be null on empty state, got ${stats.avgWaitTime}`);
  pass(`Empty schedule state verified`);
});

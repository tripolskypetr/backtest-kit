import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";

// Real backtest output: 22 closed signals (TRXUSDT / jan_2026_strategy).
// Imported as a JSON module via the import-attribute syntax.
import signals from "../data/backtest_1.json" with { type: "json" };

const SYMBOL = "TRXUSDT";
const STRATEGY = "jan_2026_strategy";
const EXCHANGE = "ccxt-exchange";
const FRAME = "jan_2026_frame";

// Mirror the service constants (BacktestMarkdownService.ts) so the reference
// implementation gates the same way the production code does.
const MIN_SIGNALS_FOR_ANNUALIZATION = 10;
const MIN_CALENDAR_SPAN_DAYS = 14;
const MAX_TRADES_PER_YEAR = 365;
const MAX_EXPECTED_YEARLY_RETURNS = 100;
const MAX_CALMAR_RATIO = 1000;

/**
 * Maps a persisted ISignalRow (as stored in backtest_1.json) into the
 * IStrategyTickResultClosed shape that the markdown services' tick() consumes.
 * Services read: action, signal, closeTimestamp, pnl, symbol, strategyName,
 * exchangeName, frameName, currentPrice. We use updatedAt as the close time.
 */
const toClosedTick = (row) => ({
  action: "closed",
  signal: row,
  currentPrice: row.pnl?.priceClose ?? row.priceOpen,
  closeReason: "take_profit",
  closeTimestamp: row.updatedAt,
  pnl: row.pnl,
  strategyName: STRATEGY,
  exchangeName: EXCHANGE,
  frameName: FRAME,
  symbol: SYMBOL,
  backtest: true,
  createdAt: row.updatedAt,
});

const approx = (a, b, eps = 1e-6) =>
  a === null && b === null ? true : Math.abs(a - b) <= eps;

/**
 * Independent re-implementation of every BacktestMarkdownService metric,
 * computed here so the tests verify the service's math against a second
 * source of truth (rather than asserting "is a number").
 */
const computeReference = (rows) => {
  const valid = rows.filter(
    (r) =>
      typeof r.pendingAt === "number" && r.pendingAt > 0 &&
      typeof r.updatedAt === "number" && r.updatedAt > 0
  );
  const n = valid.length;
  const returns = valid.map((r) => r.pnl.pnlPercentage);

  const winCount = returns.filter((r) => r > 0).length;
  const lossCount = returns.filter((r) => r < 0).length;
  const avgPnl = returns.reduce((a, b) => a + b, 0) / n;
  const totalPnl = returns.reduce((a, b) => a + b, 0);
  const winRate = (winCount / (winCount + lossCount)) * 100;
  const stdDev = Math.sqrt(
    returns.reduce((s, r) => s + (r - avgPnl) ** 2, 0) / (n - 1)
  );
  const sharpe = stdDev > 0 ? avgPnl / stdDev : null;

  // calendar span + annualization gate
  const firstPend = Math.min(...valid.map((r) => r.pendingAt));
  const lastClose = Math.max(...valid.map((r) => r.updatedAt));
  const spanDays = (lastClose - firstPend) / (1000 * 60 * 60 * 24);
  const rawTPY =
    n >= MIN_SIGNALS_FOR_ANNUALIZATION && spanDays >= MIN_CALENDAR_SPAN_DAYS
      ? (n / spanDays) * 365
      : 0;
  const canAnnualize = rawTPY > 0 && rawTPY <= MAX_TRADES_PER_YEAR;
  const tradesPerYear = canAnnualize ? rawTPY : 0;
  const annualizedSharpe =
    canAnnualize && sharpe !== null ? sharpe * Math.sqrt(tradesPerYear) : null;

  // equity curve (compounded, chronological — JSON is already oldest-first)
  let equity = 1, peak = 1, equityMaxDrawdown = 0, blown = false;
  for (let i = 0; i < n; i++) {
    equity *= 1 + returns[i] / 100;
    if (equity <= 0) { equityMaxDrawdown = 100; blown = true; break; }
    if (equity > peak) peak = equity;
    const dd = ((peak - equity) / peak) * 100;
    if (dd > equityMaxDrawdown) equityMaxDrawdown = dd;
  }
  const equityFinal = blown ? 0 : equity;

  // expected yearly returns (geometric annualization, capped)
  let expectedYearlyReturns = null;
  if (canAnnualize) {
    if (blown) {
      expectedYearlyReturns = -100;
    } else {
      const raw = (Math.pow(equityFinal, tradesPerYear / n) - 1) * 100;
      expectedYearlyReturns =
        Math.abs(raw) > MAX_EXPECTED_YEARLY_RETURNS ? null : raw;
    }
  }

  // certainty ratio
  const wins = returns.filter((r) => r > 0);
  const losses = returns.filter((r) => r < 0);
  const avgWin = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
  const certaintyRatio = avgLoss < 0 ? avgWin / Math.abs(avgLoss) : null;

  // avg peak / fall pnl (from peakProfit / maxDrawdown snapshots on each row)
  const peakVals = valid
    .map((r) => r.peakProfit?.pnlPercentage)
    .filter((v) => typeof v === "number");
  const fallVals = valid
    .map((r) => r.maxDrawdown?.pnlPercentage)
    .filter((v) => typeof v === "number");
  const avgPeakPnl = peakVals.length ? peakVals.reduce((a, b) => a + b, 0) / peakVals.length : null;
  const avgFallPnl = fallVals.length ? fallVals.reduce((a, b) => a + b, 0) / fallVals.length : null;

  // sortino (MAR=0, downside dev over N_total)
  const negative = returns.filter((r) => r < 0);
  let sortinoRatio = null;
  if (n >= MIN_SIGNALS_FOR_ANNUALIZATION && negative.length > 0) {
    const downVar = negative.reduce((s, r) => s + r * r, 0) / returns.length;
    const downDev = Math.sqrt(downVar);
    sortinoRatio = downDev > 0 ? avgPnl / downDev : null;
  }

  // calmar (capped)
  const calmarRatio =
    equityMaxDrawdown > 0 && expectedYearlyReturns !== null
      ? Math.max(-MAX_CALMAR_RATIO, Math.min(MAX_CALMAR_RATIO, expectedYearlyReturns / equityMaxDrawdown))
      : null;

  // recovery factor (compounded total return / DD)
  const recoveryFactor =
    blown || equityMaxDrawdown <= 0
      ? null
      : ((equityFinal - 1) * 100) / equityMaxDrawdown;

  return {
    n, winCount, lossCount, avgPnl, totalPnl, winRate, stdDev, sharpe,
    annualizedSharpe, equityMaxDrawdown, expectedYearlyReturns, certaintyRatio,
    avgPeakPnl, avgFallPnl, sortinoRatio, calmarRatio, recoveryFactor,
    spanDays, tradesPerYear, equityFinal,
  };
};

// ---------------------------------------------------------------------------
// 1. BacktestMarkdownService — full statistical suite
// ---------------------------------------------------------------------------
test("backtest_1.json: BacktestMarkdownService computes the full statistical suite", async ({ pass, fail }) => {
  const svc = lib.backtestMarkdownService;
  svc.subscribe();

  await svc.clear({ symbol: SYMBOL, strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });
  for (const row of signals) {
    await svc.tick(toClosedTick(row));
  }

  const stats = await svc.getData(SYMBOL, STRATEGY, EXCHANGE, FRAME, true);
  const ref = computeReference(signals);

  const checks = [
    ["totalSignals", stats.totalSignals === ref.n, stats.totalSignals, ref.n],
    ["winCount", stats.winCount === ref.winCount, stats.winCount, ref.winCount],
    ["lossCount", stats.lossCount === ref.lossCount, stats.lossCount, ref.lossCount],
    ["winRate", approx(stats.winRate, ref.winRate, 1e-9), stats.winRate, ref.winRate],
    ["avgPnl", approx(stats.avgPnl, ref.avgPnl, 1e-9), stats.avgPnl, ref.avgPnl],
    ["totalPnl", approx(stats.totalPnl, ref.totalPnl, 1e-9), stats.totalPnl, ref.totalPnl],
    ["stdDev", stats.stdDev >= 0 && approx(stats.stdDev, ref.stdDev, 1e-9), stats.stdDev, ref.stdDev],
    ["sharpeRatio", approx(stats.sharpeRatio, ref.sharpe, 1e-9), stats.sharpeRatio, ref.sharpe],
    ["annualizedSharpeRatio", approx(stats.annualizedSharpeRatio, ref.annualizedSharpe, 1e-6), stats.annualizedSharpeRatio, ref.annualizedSharpe],
    ["certaintyRatio", approx(stats.certaintyRatio, ref.certaintyRatio, 1e-9), stats.certaintyRatio, ref.certaintyRatio],
    ["expectedYearlyReturns", approx(stats.expectedYearlyReturns, ref.expectedYearlyReturns, 1e-6), stats.expectedYearlyReturns, ref.expectedYearlyReturns],
    ["avgPeakPnl", approx(stats.avgPeakPnl, ref.avgPeakPnl, 1e-9), stats.avgPeakPnl, ref.avgPeakPnl],
    ["avgFallPnl", approx(stats.avgFallPnl, ref.avgFallPnl, 1e-9), stats.avgFallPnl, ref.avgFallPnl],
    ["sortinoRatio", approx(stats.sortinoRatio, ref.sortinoRatio, 1e-9), stats.sortinoRatio, ref.sortinoRatio],
    ["calmarRatio", approx(stats.calmarRatio, ref.calmarRatio, 1e-6), stats.calmarRatio, ref.calmarRatio],
    ["recoveryFactor", approx(stats.recoveryFactor, ref.recoveryFactor, 1e-9), stats.recoveryFactor, ref.recoveryFactor],
  ];

  for (const [name, ok, got, want] of checks) {
    if (!ok) {
      fail(`${name}: service=${got} ref=${want}`);
      return;
    }
  }

  pass(
    `Backtest math verified: sharpe=${stats.sharpeRatio.toFixed(4)}, ` +
    `annSharpe=${stats.annualizedSharpeRatio.toFixed(3)}, ` +
    `sortino=${stats.sortinoRatio.toFixed(4)}, ` +
    `calmar=${stats.calmarRatio === null ? "N/A" : stats.calmarRatio.toFixed(3)}, ` +
    `recovery=${stats.recoveryFactor === null ? "N/A" : stats.recoveryFactor.toFixed(3)}, ` +
    `maxDD(equity)=${ref.equityMaxDrawdown.toFixed(2)}%, ` +
    `expYearly=${stats.expectedYearlyReturns === null ? "N/A" : stats.expectedYearlyReturns.toFixed(2) + "%"}, ` +
    `winRate=${stats.winRate.toFixed(2)}%`
  );
});

// ---------------------------------------------------------------------------
// 2. LiveMarkdownService — same statistical suite in live mode
// ---------------------------------------------------------------------------
test("backtest_1.json: LiveMarkdownService computes the same statistical suite (live mode)", async ({ pass, fail }) => {
  const svc = lib.liveMarkdownService;
  svc.subscribe();

  // Live stores under backtest=false regardless of the event flag.
  await svc.clear({ symbol: SYMBOL, strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: false });
  for (const row of signals) {
    await svc.tick({ ...toClosedTick(row), backtest: false });
  }

  const stats = await svc.getData(SYMBOL, STRATEGY, EXCHANGE, FRAME, false);
  const ref = computeReference(signals);

  const checks = [
    ["totalClosed", stats.totalClosed === ref.n, stats.totalClosed, ref.n],
    ["winCount", stats.winCount === ref.winCount, stats.winCount, ref.winCount],
    ["lossCount", stats.lossCount === ref.lossCount, stats.lossCount, ref.lossCount],
    ["winRate", approx(stats.winRate, ref.winRate, 1e-9), stats.winRate, ref.winRate],
    ["avgPnl", approx(stats.avgPnl, ref.avgPnl, 1e-9), stats.avgPnl, ref.avgPnl],
    ["totalPnl", approx(stats.totalPnl, ref.totalPnl, 1e-9), stats.totalPnl, ref.totalPnl],
    ["stdDev", approx(stats.stdDev, ref.stdDev, 1e-9), stats.stdDev, ref.stdDev],
    ["sharpeRatio", approx(stats.sharpeRatio, ref.sharpe, 1e-9), stats.sharpeRatio, ref.sharpe],
    ["annualizedSharpeRatio", approx(stats.annualizedSharpeRatio, ref.annualizedSharpe, 1e-6), stats.annualizedSharpeRatio, ref.annualizedSharpe],
    ["certaintyRatio", approx(stats.certaintyRatio, ref.certaintyRatio, 1e-9), stats.certaintyRatio, ref.certaintyRatio],
    ["sortinoRatio", approx(stats.sortinoRatio, ref.sortinoRatio, 1e-9), stats.sortinoRatio, ref.sortinoRatio],
    ["calmarRatio", approx(stats.calmarRatio, ref.calmarRatio, 1e-6), stats.calmarRatio, ref.calmarRatio],
    ["recoveryFactor", approx(stats.recoveryFactor, ref.recoveryFactor, 1e-9), stats.recoveryFactor, ref.recoveryFactor],
    ["avgPeakPnl", approx(stats.avgPeakPnl, ref.avgPeakPnl, 1e-9), stats.avgPeakPnl, ref.avgPeakPnl],
    ["avgFallPnl", approx(stats.avgFallPnl, ref.avgFallPnl, 1e-9), stats.avgFallPnl, ref.avgFallPnl],
  ];

  for (const [name, ok, got, want] of checks) {
    if (!ok) {
      fail(`${name}: service=${got} ref=${want}`);
      return;
    }
  }

  pass(
    `Live math verified vs reference: n=${stats.totalClosed}, sharpe=${stats.sharpeRatio.toFixed(4)}, ` +
    `sortino=${stats.sortinoRatio.toFixed(4)}, calmar=${stats.calmarRatio === null ? "N/A" : stats.calmarRatio.toFixed(3)}, ` +
    `recovery=${stats.recoveryFactor === null ? "N/A" : stats.recoveryFactor.toFixed(3)}`
  );
});

// ---------------------------------------------------------------------------
// 3. HeatMarkdownService — per-symbol + pooled portfolio Sharpe + drawdown
// ---------------------------------------------------------------------------
test("backtest_1.json: HeatMarkdownService computes per-symbol and pooled portfolio Sharpe", async ({ pass, fail }) => {
  const svc = lib.heatMarkdownService;
  svc.subscribe();

  await svc.clear({ exchangeName: EXCHANGE, frameName: FRAME, backtest: true });
  for (const row of signals) {
    await svc.tick(toClosedTick(row));
  }

  // Heat is keyed by (exchangeName, frameName, backtest) — not symbol/strategy.
  const stats = await svc.getData(EXCHANGE, FRAME, true);
  const ref = computeReference(signals);

  if (stats.totalSymbols !== 1) {
    fail(`expected 1 symbol bucket, got ${stats.totalSymbols}`);
    return;
  }
  const row = stats.symbols.find((s) => s.symbol === SYMBOL);
  if (!row) {
    fail(`symbol row for ${SYMBOL} not found`);
    return;
  }

  // Single symbol => per-symbol Sharpe == backtest Sharpe; pooled == same.
  const checks = [
    ["row.totalTrades", row.totalTrades === ref.n, row.totalTrades, ref.n],
    ["row.winRate", approx(row.winRate, ref.winRate, 1e-9), row.winRate, ref.winRate],
    ["row.totalPnl", approx(row.totalPnl, ref.totalPnl, 1e-9), row.totalPnl, ref.totalPnl],
    ["row.sharpeRatio", approx(row.sharpeRatio, ref.sharpe, 1e-9), row.sharpeRatio, ref.sharpe],
    ["row.maxDrawdown", approx(row.maxDrawdown, ref.equityMaxDrawdown, 1e-6), row.maxDrawdown, ref.equityMaxDrawdown],
    ["portfolioSharpeRatio", approx(stats.portfolioSharpeRatio, ref.sharpe, 1e-9), stats.portfolioSharpeRatio, ref.sharpe],
    ["portfolioTotalPnl", approx(stats.portfolioTotalPnl, ref.totalPnl, 1e-9), stats.portfolioTotalPnl, ref.totalPnl],
    ["portfolioTotalTrades", stats.portfolioTotalTrades === ref.n, stats.portfolioTotalTrades, ref.n],
  ];

  for (const [name, ok, got, want] of checks) {
    if (!ok) {
      fail(`${name}: service=${got} ref=${want}`);
      return;
    }
  }

  pass(
    `Heat math verified: symbolSharpe=${row.sharpeRatio.toFixed(4)}, ` +
    `pooledSharpe=${stats.portfolioSharpeRatio.toFixed(4)}, ` +
    `maxDD=${row.maxDrawdown.toFixed(2)}%, portfolioPnl=${stats.portfolioTotalPnl.toFixed(2)}%`
  );
});

// ---------------------------------------------------------------------------
// 4. ScheduleMarkdownService — cancellation/activation rates + avg durations
// ---------------------------------------------------------------------------
test("backtest_1.json: ScheduleMarkdownService computes activation/cancellation rates and avg wait", async ({ pass, fail }) => {
  const svc = lib.scheduleMarkdownService;
  svc.subscribe();

  await svc.clear({ symbol: SYMBOL, strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  // The schedule math needs scheduled→opened / scheduled→cancelled pairs with a
  // wait gap (scheduledAt < pendingAt / closeTimestamp). The raw rows have
  // scheduledAt === pendingAt (immediate), so we synthesize a wait window per
  // signal and split the 22 signals: even-indexed activate, odd-indexed cancel.
  const WAIT_MS = 5 * 60 * 1000; // 5 minutes
  let activated = 0;
  let cancelled = 0;
  const activateWaits = [];
  const cancelWaits = [];

  for (let i = 0; i < signals.length; i++) {
    const base = signals[i];
    const scheduledAt = base.pendingAt;
    const wait = WAIT_MS * (i + 1); // distinct durations to exercise the average
    const sig = { ...base, scheduledAt };

    // scheduled event (must come first so its signalId is in scheduledIds)
    await svc.tick({
      action: "scheduled",
      signal: sig,
      currentPrice: base.priceOpen,
      strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME,
      symbol: SYMBOL, backtest: true,
    });

    if (i % 2 === 0) {
      const pendingAt = scheduledAt + wait;
      await svc.tick({
        action: "opened",
        signal: { ...sig, pendingAt },
        currentPrice: base.priceOpen,
        strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME,
        symbol: SYMBOL, backtest: true,
      });
      activated++;
      activateWaits.push(wait / 60000);
    } else {
      const closeTimestamp = scheduledAt + wait;
      await svc.tick({
        action: "cancelled",
        signal: sig,
        currentPrice: base.priceOpen,
        closeTimestamp,
        reason: "time_expired",
        cancelId: null,
        strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME,
        symbol: SYMBOL, backtest: true,
      });
      cancelled++;
      cancelWaits.push(wait / 60000);
    }
  }

  const stats = await svc.getData(SYMBOL, STRATEGY, EXCHANGE, FRAME, true);

  const resolved = activated + cancelled;
  const refActivationRate = (activated / resolved) * 100;
  const refCancellationRate = (cancelled / resolved) * 100;
  const refAvgActivation = activateWaits.reduce((a, b) => a + b, 0) / activateWaits.length;
  const refAvgWait = cancelWaits.reduce((a, b) => a + b, 0) / cancelWaits.length;

  const checks = [
    ["totalScheduled", stats.totalScheduled === signals.length, stats.totalScheduled, signals.length],
    ["totalOpened", stats.totalOpened === activated, stats.totalOpened, activated],
    ["totalCancelled", stats.totalCancelled === cancelled, stats.totalCancelled, cancelled],
    ["activationRate", approx(stats.activationRate, refActivationRate, 1e-9), stats.activationRate, refActivationRate],
    ["cancellationRate", approx(stats.cancellationRate, refCancellationRate, 1e-9), stats.cancellationRate, refCancellationRate],
    ["avgActivationTime", approx(stats.avgActivationTime, refAvgActivation, 1e-9), stats.avgActivationTime, refAvgActivation],
    ["avgWaitTime", approx(stats.avgWaitTime, refAvgWait, 1e-9), stats.avgWaitTime, refAvgWait],
  ];

  for (const [name, ok, got, want] of checks) {
    if (!ok) {
      fail(`${name}: service=${got} ref=${want}`);
      return;
    }
  }

  pass(
    `Schedule math verified: activationRate=${stats.activationRate.toFixed(2)}%, ` +
    `cancellationRate=${stats.cancellationRate.toFixed(2)}%, ` +
    `avgActivation=${stats.avgActivationTime.toFixed(2)}m, avgWait=${stats.avgWaitTime.toFixed(2)}m`
  );
});

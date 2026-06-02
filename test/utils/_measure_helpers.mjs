// Shared helpers and constants for the backtest_N.test.mjs measure suite.
// These mirror the service constants in BacktestMarkdownService.ts /
// LiveMarkdownService.ts / HeatMarkdownService.ts so the reference
// implementation gates identically to production.

export const STRATEGY = "jan_2026_strategy";
export const EXCHANGE = "ccxt-exchange";
export const FRAME = "jan_2026_frame";

export const MIN_SIGNALS_FOR_ANNUALIZATION = 10;
export const MIN_SIGNALS_FOR_RATIOS = 10;
export const MIN_CALENDAR_SPAN_DAYS = 14;
export const MAX_TRADES_PER_YEAR = 365;
export const MAX_EXPECTED_YEARLY_RETURNS = 100;
export const MAX_CALMAR_RATIO = 1000;
/** Float-artifact stdDev threshold — mirrors the service guard. */
export const STDDEV_EPSILON = 1e-9;

/**
 * Maps a persisted ISignalRow into the IStrategyTickResultClosed shape the
 * markdown services consume. `symbolOverride` routes a row to a specific bucket.
 * `dropPnl` is used by the corrupted-data tests to feed a tick without `pnl`.
 */
export const toClosedTick = (row, { symbolOverride, dropPnl = false, backtest = true } = {}) => {
  const tick = {
    action: "closed",
    signal: row,
    currentPrice: row.pnl?.priceClose ?? row.priceOpen,
    closeReason: "take_profit",
    closeTimestamp: row.updatedAt,
    pnl: row.pnl,
    strategyName: STRATEGY,
    exchangeName: EXCHANGE,
    frameName: FRAME,
    symbol: symbolOverride ?? row.symbol,
    backtest,
    createdAt: row.updatedAt,
  };
  if (dropPnl) delete tick.pnl;
  return tick;
};

/** Approx compare that treats null === null as equal. */
export const approx = (a, b, eps = 1e-6) =>
  a === null && b === null
    ? true
    : a === null || b === null
    ? false
    : Math.abs(a - b) <= eps;

export const sampleStdDev = (xs) => {
  if (xs.length < 2) return 0;
  const avg = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, r) => s + (r - avg) ** 2, 0) / (xs.length - 1));
};

/**
 * High-water-mark equity drawdown via compounded returns.
 * Detects blown account when equity ≤ 0 (e.g. r < -100% with leverage).
 */
export const equityMaxDrawdown = (returns) => {
  let equity = 1;
  let peak = 1;
  let maxDD = 0;
  for (const r of returns) {
    equity *= 1 + r / 100;
    if (equity <= 0) return { maxDD: 100, blown: true, equityFinal: 0 };
    if (equity > peak) peak = equity;
    const dd = ((peak - equity) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }
  return { maxDD, blown: false, equityFinal: equity };
};

/**
 * Independent re-implementation of the BacktestMarkdownService statistical
 * suite, computed over a pooled series — the second source of truth.
 * Accepts raw signal rows (with .pnl, .pendingAt, .updatedAt, .peakProfit,
 * .maxDrawdown) and filters validSignals exactly like the service does.
 */
export const computePoolReference = (rows) => {
  const valid = rows.filter(
    (r) =>
      typeof r.pendingAt === "number" &&
      r.pendingAt > 0 &&
      typeof r.updatedAt === "number" &&
      r.updatedAt > 0,
  );
  const n = valid.length;
  if (n === 0) return null;

  const returns = valid.map((r) => r.pnl.pnlPercentage);
  const winCount = returns.filter((r) => r > 0).length;
  const lossCount = returns.filter((r) => r < 0).length;
  const decisive = winCount + lossCount;
  const avgPnl = returns.reduce((a, b) => a + b, 0) / n;
  const totalPnl = returns.reduce((a, b) => a + b, 0);
  const winRate = decisive > 0 ? (winCount / decisive) * 100 : 0;

  const canRatios = n >= MIN_SIGNALS_FOR_RATIOS;
  const stdDev = canRatios ? sampleStdDev(returns) : 0;
  const sharpe = canRatios && stdDev > STDDEV_EPSILON ? avgPnl / stdDev : null;

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

  const { maxDD: equityMaxDD, blown, equityFinal } = equityMaxDrawdown(returns);

  let expectedYearlyReturns = null;
  if (canAnnualize) {
    if (blown) expectedYearlyReturns = -100;
    else {
      const raw = (Math.pow(equityFinal, tradesPerYear / n) - 1) * 100;
      expectedYearlyReturns = Math.abs(raw) > MAX_EXPECTED_YEARLY_RETURNS ? null : raw;
    }
  }

  const wins = returns.filter((r) => r > 0);
  const losses = returns.filter((r) => r < 0);
  const avgWin = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
  // Gated by canRatios (N≥MIN_SIGNALS_FOR_RATIOS) like the service — certainty
  // on a handful of trades is too noisy to publish. STDDEV_EPSILON guard mirrors
  // the service: float-artifact losses produce spurious astronomical certaintyRatio.
  const certaintyRatio =
    canRatios && Math.abs(avgLoss) > STDDEV_EPSILON && avgLoss < 0 ? avgWin / Math.abs(avgLoss) : null;

  const peakVals = valid
    .map((r) => r.peakProfit?.pnlPercentage)
    .filter((v) => typeof v === "number");
  const fallVals = valid
    .map((r) => r.maxDrawdown?.pnlPercentage)
    .filter((v) => typeof v === "number");
  const avgPeakPnl = peakVals.length ? peakVals.reduce((a, b) => a + b, 0) / peakVals.length : null;
  const avgFallPnl = fallVals.length ? fallVals.reduce((a, b) => a + b, 0) / fallVals.length : null;

  // Canonical Sortino: N_total denominator, MAR=0, RMS over negative returns.
  const negative = returns.filter((r) => r < 0);
  let sortinoRatio = null;
  if (canRatios && negative.length > 0) {
    const downDev = Math.sqrt(negative.reduce((s, r) => s + r * r, 0) / returns.length);
    sortinoRatio = downDev > STDDEV_EPSILON ? avgPnl / downDev : null;
  }

  const calmarRatio =
    equityMaxDD > 0 && expectedYearlyReturns !== null
      ? Math.max(
          -MAX_CALMAR_RATIO,
          Math.min(MAX_CALMAR_RATIO, expectedYearlyReturns / equityMaxDD),
        )
      : null;

  // Gated by canRatios (N≥MIN_SIGNALS_FOR_RATIOS) like the service.
  // Same MAX_CALMAR_RATIO clamp as the service — both compounded-profit/DD ratios.
  const recoveryFactor =
    !canRatios || blown || equityMaxDD <= 0
      ? null
      : Math.max(
          -MAX_CALMAR_RATIO,
          Math.min(MAX_CALMAR_RATIO, ((equityFinal - 1) * 100) / equityMaxDD),
        );

  return {
    n,
    winCount,
    lossCount,
    avgPnl,
    totalPnl,
    winRate,
    stdDev,
    sharpe,
    annualizedSharpe,
    equityMaxDrawdown: equityMaxDD,
    expectedYearlyReturns,
    certaintyRatio,
    avgPeakPnl,
    avgFallPnl,
    sortinoRatio,
    calmarRatio,
    recoveryFactor,
    spanDays,
    tradesPerYear,
    blown,
    equityFinal,
    canAnnualize,
    canRatios,
  };
};

/** Per-symbol + pooled reference matching HeatMarkdownService. */
export const computeHeatReference = (rows) => {
  const bySymbol = new Map();
  for (const r of rows) {
    if (!bySymbol.has(r.symbol)) bySymbol.set(r.symbol, []);
    bySymbol.get(r.symbol).push(r);
  }
  const perSymbol = {};
  for (const [symbol, sigs] of bySymbol.entries()) {
    const returns = sigs.map((s) => s.pnl.pnlPercentage);
    const n = returns.length;
    const winCount = returns.filter((r) => r > 0).length;
    const lossCount = returns.filter((r) => r < 0).length;
    const decisive = winCount + lossCount;
    const totalPnl = returns.reduce((a, b) => a + b, 0);
    const avgPnl = totalPnl / n;
    const canRatios = n >= MIN_SIGNALS_FOR_RATIOS;
    const stdDev = canRatios ? sampleStdDev(returns) : null;
    const sharpe = stdDev !== null && stdDev > STDDEV_EPSILON ? avgPnl / stdDev : null;
    const peakVals = sigs
      .map((s) => s.peakProfit?.pnlPercentage)
      .filter((v) => typeof v === "number");
    const fallVals = sigs
      .map((s) => s.maxDrawdown?.pnlPercentage)
      .filter((v) => typeof v === "number");
    const avgPeakPnl = peakVals.length
      ? peakVals.reduce((a, b) => a + b, 0) / peakVals.length
      : null;
    const avgFallPnl = fallVals.length
      ? fallVals.reduce((a, b) => a + b, 0) / fallVals.length
      : null;
    perSymbol[symbol] = {
      totalTrades: n,
      winCount,
      lossCount,
      winRate: decisive > 0 ? (winCount / decisive) * 100 : null,
      totalPnl,
      avgPnl,
      stdDev,
      sharpeRatio: sharpe,
      maxDrawdown: equityMaxDrawdown(returns).maxDD,
      avgPeakPnl,
      avgFallPnl,
    };
  }

  // Pooled (Markowitz-less) Sharpe across all rows: gated on the pool size.
  const allReturns = rows.map((r) => r.pnl.pnlPercentage);
  const portfolioTotalPnl = allReturns.reduce((a, b) => a + b, 0);
  let portfolioSharpe = null;
  if (allReturns.length >= MIN_SIGNALS_FOR_RATIOS) {
    const avg = portfolioTotalPnl / allReturns.length;
    const sd = sampleStdDev(allReturns);
    if (sd > STDDEV_EPSILON) portfolioSharpe = avg / sd;
  }

  // Trade-weighted peak/fall, weighted only over symbols with non-null values.
  const symbolsArr = Object.values(perSymbol);
  const peakSymbols = symbolsArr.filter((s) => s.avgPeakPnl !== null);
  const fallSymbols = symbolsArr.filter((s) => s.avgFallPnl !== null);
  const peakTradesTotal = peakSymbols.reduce((acc, s) => acc + s.totalTrades, 0);
  const fallTradesTotal = fallSymbols.reduce((acc, s) => acc + s.totalTrades, 0);
  const portfolioAvgPeakPnl =
    peakSymbols.length > 0 && peakTradesTotal > 0
      ? peakSymbols.reduce((acc, s) => acc + s.avgPeakPnl * s.totalTrades, 0) / peakTradesTotal
      : null;
  const portfolioAvgFallPnl =
    fallSymbols.length > 0 && fallTradesTotal > 0
      ? fallSymbols.reduce((acc, s) => acc + s.avgFallPnl * s.totalTrades, 0) / fallTradesTotal
      : null;

  return {
    perSymbol,
    totalSymbols: bySymbol.size,
    portfolioTotalPnl,
    portfolioSharpe,
    portfolioTotalTrades: rows.length,
    portfolioAvgPeakPnl,
    portfolioAvgFallPnl,
  };
};

/**
 * Run the standard pool-suite Backtest test. `extraAsserts` lets each
 * edge-case test add its own bespoke checks against `stats` and `ref`.
 *
 * @param svc lib.backtestMarkdownService
 * @param signals rows from backtest_N.json
 * @param poolSymbol unique symbol so each fixture has its own bucket
 * @param label test label fed to pass()
 * @param ctx { pass, fail }
 * @param extraAsserts(stats, ref) => null | string (error message)
 */
export const runBacktestPool = async (
  svc,
  signals,
  poolSymbol,
  label,
  ctx,
  extraAsserts,
) => {
  const { pass, fail } = ctx;
  svc.subscribe();

  await svc.clear({
    symbol: poolSymbol,
    strategyName: STRATEGY,
    exchangeName: EXCHANGE,
    frameName: FRAME,
    backtest: true,
  });
  for (const row of signals) {
    await svc.tick(toClosedTick(row, { symbolOverride: poolSymbol }));
  }
  const stats = await svc.getData(poolSymbol, STRATEGY, EXCHANGE, FRAME, true);
  const ref = computePoolReference(signals);

  const checks = [
    ["totalSignals", stats.totalSignals === ref.n, stats.totalSignals, ref.n],
    ["winCount", stats.winCount === ref.winCount, stats.winCount, ref.winCount],
    ["lossCount", stats.lossCount === ref.lossCount, stats.lossCount, ref.lossCount],
    ["winRate", approx(stats.winRate, ref.winRate, 1e-9), stats.winRate, ref.winRate],
    ["avgPnl", approx(stats.avgPnl, ref.avgPnl, 1e-9), stats.avgPnl, ref.avgPnl],
    ["totalPnl", approx(stats.totalPnl, ref.totalPnl, 1e-9), stats.totalPnl, ref.totalPnl],
    ["stdDev", approx(stats.stdDev, ref.stdDev, 1e-9), stats.stdDev, ref.stdDev],
    ["sharpeRatio", approx(stats.sharpeRatio, ref.sharpe, 1e-9), stats.sharpeRatio, ref.sharpe],
    [
      "annualizedSharpeRatio",
      approx(stats.annualizedSharpeRatio, ref.annualizedSharpe, 1e-6),
      stats.annualizedSharpeRatio,
      ref.annualizedSharpe,
    ],
    [
      "certaintyRatio",
      approx(stats.certaintyRatio, ref.certaintyRatio, 1e-9),
      stats.certaintyRatio,
      ref.certaintyRatio,
    ],
    [
      "expectedYearlyReturns",
      approx(stats.expectedYearlyReturns, ref.expectedYearlyReturns, 1e-6),
      stats.expectedYearlyReturns,
      ref.expectedYearlyReturns,
    ],
    ["avgPeakPnl", approx(stats.avgPeakPnl, ref.avgPeakPnl, 1e-9), stats.avgPeakPnl, ref.avgPeakPnl],
    ["avgFallPnl", approx(stats.avgFallPnl, ref.avgFallPnl, 1e-9), stats.avgFallPnl, ref.avgFallPnl],
    [
      "sortinoRatio",
      approx(stats.sortinoRatio, ref.sortinoRatio, 1e-9),
      stats.sortinoRatio,
      ref.sortinoRatio,
    ],
    ["calmarRatio", approx(stats.calmarRatio, ref.calmarRatio, 1e-6), stats.calmarRatio, ref.calmarRatio],
    [
      "recoveryFactor",
      approx(stats.recoveryFactor, ref.recoveryFactor, 1e-9),
      stats.recoveryFactor,
      ref.recoveryFactor,
    ],
  ];

  for (const [name, ok, got, want] of checks) {
    if (!ok) {
      fail(`${name}: service=${got} ref=${want}`);
      return;
    }
  }

  if (extraAsserts) {
    const err = extraAsserts(stats, ref);
    if (err) {
      fail(err);
      return;
    }
  }

  pass(`${label} (n=${stats.totalSignals})`);
};

/**
 * Run the standard pool-suite Live test (mirrors Backtest but in live mode).
 * `tickFn` lets callers inject corruption (e.g. dropPnl for #16).
 */
export const runLivePool = async (
  svc,
  signals,
  poolSymbol,
  label,
  ctx,
  extraAsserts,
  { tickFn } = {},
) => {
  const { pass, fail } = ctx;
  svc.subscribe();

  await svc.clear({
    symbol: poolSymbol,
    strategyName: STRATEGY,
    exchangeName: EXCHANGE,
    frameName: FRAME,
    backtest: false,
  });
  for (const row of signals) {
    const tick = tickFn
      ? tickFn(row)
      : toClosedTick(row, { symbolOverride: poolSymbol, backtest: false });
    await svc.tick(tick);
  }
  const stats = await svc.getData(poolSymbol, STRATEGY, EXCHANGE, FRAME, false);
  const ref = computePoolReference(signals);

  const checks = [
    ["totalClosed", stats.totalClosed === ref.n, stats.totalClosed, ref.n],
    ["winRate", approx(stats.winRate, ref.winRate, 1e-9), stats.winRate, ref.winRate],
    ["avgPnl", approx(stats.avgPnl, ref.avgPnl, 1e-9), stats.avgPnl, ref.avgPnl],
    ["totalPnl", approx(stats.totalPnl, ref.totalPnl, 1e-9), stats.totalPnl, ref.totalPnl],
    ["stdDev", approx(stats.stdDev, ref.stdDev, 1e-9), stats.stdDev, ref.stdDev],
    ["sharpeRatio", approx(stats.sharpeRatio, ref.sharpe, 1e-9), stats.sharpeRatio, ref.sharpe],
    [
      "annualizedSharpeRatio",
      approx(stats.annualizedSharpeRatio, ref.annualizedSharpe, 1e-6),
      stats.annualizedSharpeRatio,
      ref.annualizedSharpe,
    ],
    [
      "certaintyRatio",
      approx(stats.certaintyRatio, ref.certaintyRatio, 1e-9),
      stats.certaintyRatio,
      ref.certaintyRatio,
    ],
    [
      "sortinoRatio",
      approx(stats.sortinoRatio, ref.sortinoRatio, 1e-9),
      stats.sortinoRatio,
      ref.sortinoRatio,
    ],
    ["calmarRatio", approx(stats.calmarRatio, ref.calmarRatio, 1e-6), stats.calmarRatio, ref.calmarRatio],
    [
      "recoveryFactor",
      approx(stats.recoveryFactor, ref.recoveryFactor, 1e-9),
      stats.recoveryFactor,
      ref.recoveryFactor,
    ],
  ];

  for (const [name, ok, got, want] of checks) {
    if (!ok) {
      fail(`${name}: service=${got} ref=${want}`);
      return;
    }
  }

  if (extraAsserts) {
    const err = extraAsserts(stats, ref);
    if (err) {
      fail(err);
      return;
    }
  }

  pass(`${label} (n=${stats.totalClosed})`);
};

/**
 * Run the standard Heat (per-symbol + pooled) test. Each per-symbol row is
 * checked against the reference, and the pooled aggregate is verified.
 */
export const runHeat = async (svc, signals, label, ctx, extraAsserts) => {
  const { pass, fail } = ctx;
  svc.subscribe();

  await svc.clear({ exchangeName: EXCHANGE, frameName: FRAME, backtest: true });
  for (const row of signals) {
    await svc.tick(toClosedTick(row)); // keyed by row.symbol
  }
  const stats = await svc.getData(EXCHANGE, FRAME, true);
  const ref = computeHeatReference(signals);

  if (stats.totalSymbols !== ref.totalSymbols) {
    fail(`totalSymbols: service=${stats.totalSymbols} ref=${ref.totalSymbols}`);
    return;
  }

  for (const [symbol, want] of Object.entries(ref.perSymbol)) {
    const row = stats.symbols.find((s) => s.symbol === symbol);
    if (!row) {
      fail(`symbol row for ${symbol} not found`);
      return;
    }
    const rowChecks = [
      [`${symbol}.totalTrades`, row.totalTrades === want.totalTrades, row.totalTrades, want.totalTrades],
      [`${symbol}.winRate`, approx(row.winRate, want.winRate, 1e-9), row.winRate, want.winRate],
      [`${symbol}.totalPnl`, approx(row.totalPnl, want.totalPnl, 1e-9), row.totalPnl, want.totalPnl],
      [
        `${symbol}.sharpeRatio`,
        approx(row.sharpeRatio, want.sharpeRatio, 1e-9),
        row.sharpeRatio,
        want.sharpeRatio,
      ],
      [
        `${symbol}.maxDrawdown`,
        approx(row.maxDrawdown, want.maxDrawdown, 1e-6),
        row.maxDrawdown,
        want.maxDrawdown,
      ],
    ];
    for (const [name, ok, got, exp] of rowChecks) {
      if (!ok) {
        fail(`${name}: service=${got} ref=${exp}`);
        return;
      }
    }
  }

  const poolChecks = [
    [
      "portfolioTotalTrades",
      stats.portfolioTotalTrades === ref.portfolioTotalTrades,
      stats.portfolioTotalTrades,
      ref.portfolioTotalTrades,
    ],
    [
      "portfolioTotalPnl",
      approx(stats.portfolioTotalPnl, ref.portfolioTotalPnl, 1e-9),
      stats.portfolioTotalPnl,
      ref.portfolioTotalPnl,
    ],
    [
      "portfolioSharpeRatio",
      approx(stats.portfolioSharpeRatio, ref.portfolioSharpe, 1e-9),
      stats.portfolioSharpeRatio,
      ref.portfolioSharpe,
    ],
  ];
  for (const [name, ok, got, exp] of poolChecks) {
    if (!ok) {
      fail(`${name}: service=${got} ref=${exp}`);
      return;
    }
  }

  if (extraAsserts) {
    const err = extraAsserts(stats, ref);
    if (err) {
      fail(err);
      return;
    }
  }

  pass(`${label} (${stats.totalSymbols} symbols, ${stats.portfolioTotalTrades} trades)`);
};

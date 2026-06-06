import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";

// Real backtest output: 17 closed signals across 8 symbols, single strategy
// (jan_2026_strategy / ccxt-exchange / jan_2026_frame). Imported as a JSON
// module via the import-attribute syntax.
//
// Like backtest_1.json this is MULTI-SYMBOL: per-symbol buckets are all under
// MIN_SIGNALS_FOR_RATIOS (max 4 trades), so per-symbol ratios are gated off,
// while the pooled portfolio (17 trades) computes the full statistical suite.
import signals from "../data/backtest_2.json" with { type: "json" };

const STRATEGY = "jan_2026_strategy";
const EXCHANGE = "ccxt-exchange";
const FRAME = "jan_2026_frame";

// Synthetic single-bucket symbol for the pooled full-suite test.
const POOL_SYMBOL = "PORTFOLIO-BT2";

// Mirror the service constants so the reference gates identically.
const MIN_SIGNALS_FOR_ANNUALIZATION = 10;
const MIN_SIGNALS_FOR_RATIOS = 10;
const MIN_CALENDAR_SPAN_DAYS = 14;
const MAX_TRADES_PER_YEAR = 365;
const MAX_EXPECTED_YEARLY_RETURNS = 100;
const MAX_CALMAR_RATIO = 1000;

/**
 * Maps a persisted ISignalRow into the IStrategyTickResultClosed shape the
 * markdown services consume. `symbolOverride` routes a row into a specific
 * bucket (real per-symbol routing, or the pooled PORTFOLIO bucket).
 */
const toClosedTick = (row, symbolOverride) => ({
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
  backtest: true,
  createdAt: row.updatedAt,
});

const approx = (a, b, eps = 1e-6) =>
  a === null && b === null ? true : a === null || b === null ? false : Math.abs(a - b) <= eps;

const sampleStdDev = (xs) => {
  const avg = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, r) => s + (r - avg) ** 2, 0) / (xs.length - 1));
};

// Mark-to-market equity DD: optional `falls` (per-trade intra-trade troughs ≤ 0,
// aligned 1:1 with `returns`) applied as a transient trough before each realized
// close — mirrors the services.
const equityMaxDrawdown = (returns, falls = null) => {
  let equity = 1, peak = 1, maxDD = 0;
  for (let i = 0; i < returns.length; i++) {
    const fall = falls ? falls[i] : null;
    if (typeof fall === "number" && fall < 0) {
      const trough = equity * (1 + fall / 100);
      if (trough <= 0) return { maxDD: 100, blown: true, equityFinal: 0 };
      const troughDd = ((peak - trough) / peak) * 100;
      if (troughDd > maxDD) maxDD = troughDd;
    }
    equity *= 1 + returns[i] / 100;
    if (equity <= 0) return { maxDD: 100, blown: true, equityFinal: 0 };
    if (equity > peak) peak = equity;
    const dd = ((peak - equity) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }
  return { maxDD, blown: false, equityFinal: equity };
};

/** Independent full BacktestMarkdownService suite over a pooled series. */
const computePoolReference = (rows) => {
  const valid = rows
    .filter(
      (r) =>
        typeof r.pendingAt === "number" && r.pendingAt > 0 &&
        typeof r.updatedAt === "number" && r.updatedAt > 0
    )
    // Equity curve walks chronologically by closeTimestamp — mirrors the
    // post-fix BacktestMarkdownService / LiveMarkdownService.
    .sort((a, b) => a.updatedAt - b.updatedAt);
  const n = valid.length;
  const returns = valid.map((r) => r.pnl.pnlPercentage);
  const falls = valid.map((r) => {
    const f = r.maxDrawdown?.pnlPercentage;
    return typeof f === "number" ? f : null;
  });

  const winCount = returns.filter((r) => r > 0).length;
  const lossCount = returns.filter((r) => r < 0).length;
  const avgPnl = returns.reduce((a, b) => a + b, 0) / n;
  const totalPnl = returns.reduce((a, b) => a + b, 0);
  const winRate = (winCount / (winCount + lossCount)) * 100;

  const canRatios = n >= MIN_SIGNALS_FOR_RATIOS;
  const stdDev = canRatios ? sampleStdDev(returns) : 0;
  const sharpe = canRatios && stdDev > 0 ? avgPnl / stdDev : null;

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

  const { maxDD: equityMaxDD, blown, equityFinal } = equityMaxDrawdown(returns, falls);

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
  const certaintyRatio = avgLoss < 0 ? avgWin / Math.abs(avgLoss) : null;

  const peakVals = valid.map((r) => r.peakProfit?.pnlPercentage).filter((v) => typeof v === "number");
  const fallVals = valid.map((r) => r.maxDrawdown?.pnlPercentage).filter((v) => typeof v === "number");
  const avgPeakPnl = peakVals.length ? peakVals.reduce((a, b) => a + b, 0) / peakVals.length : null;
  const avgFallPnl = fallVals.length ? fallVals.reduce((a, b) => a + b, 0) / fallVals.length : null;

  const negative = returns.filter((r) => r < 0);
  let sortinoRatio = null;
  if (canRatios && negative.length > 0) {
    const downDev = Math.sqrt(negative.reduce((s, r) => s + r * r, 0) / returns.length);
    sortinoRatio = downDev > 0 ? avgPnl / downDev : null;
  }

  const calmarRatio =
    equityMaxDD > 0 && expectedYearlyReturns !== null
      ? Math.max(-MAX_CALMAR_RATIO, Math.min(MAX_CALMAR_RATIO, expectedYearlyReturns / equityMaxDD))
      : null;

  const recoveryFactor =
    blown || equityMaxDD <= 0 ? null : ((equityFinal - 1) * 100) / equityMaxDD;

  return {
    n, winCount, lossCount, avgPnl, totalPnl, winRate, stdDev, sharpe,
    annualizedSharpe, equityMaxDrawdown: equityMaxDD, expectedYearlyReturns,
    certaintyRatio, avgPeakPnl, avgFallPnl, sortinoRatio, calmarRatio,
    recoveryFactor, spanDays, tradesPerYear,
  };
};

/** Per-symbol + pooled reference matching HeatMarkdownService. */
const computeHeatReference = (rows) => {
  const bySymbol = new Map();
  for (const r of rows) {
    if (!bySymbol.has(r.symbol)) bySymbol.set(r.symbol, []);
    bySymbol.get(r.symbol).push(r);
  }
  const perSymbol = {};
  for (const [symbol, sigsRaw] of bySymbol.entries()) {
    // Mirror HeatMarkdownService.calculateSymbolStats: chronological walk by
    // closeTimestamp (`updatedAt`) so per-symbol DD is insertion-order-free.
    const sigs = [...sigsRaw].sort((a, b) => a.updatedAt - b.updatedAt);
    const returns = sigs.map((s) => s.pnl.pnlPercentage);
    const falls = sigs.map((s) => {
      const f = s.maxDrawdown?.pnlPercentage;
      return typeof f === "number" ? f : null;
    });
    const n = returns.length;
    const winCount = returns.filter((r) => r > 0).length;
    const lossCount = returns.filter((r) => r < 0).length;
    const decisive = winCount + lossCount;
    const totalPnl = returns.reduce((a, b) => a + b, 0);
    const avgPnl = totalPnl / n;
    const canRatios = n >= MIN_SIGNALS_FOR_RATIOS;
    const stdDev = canRatios ? sampleStdDev(returns) : null;
    const sharpe = stdDev !== null && stdDev > 0 ? avgPnl / stdDev : null;
    perSymbol[symbol] = {
      totalTrades: n,
      winRate: decisive > 0 ? (winCount / decisive) * 100 : null,
      totalPnl,
      sharpeRatio: sharpe,
      maxDrawdown: equityMaxDrawdown(returns, falls).maxDD,
    };
  }
  const allReturns = rows.map((r) => r.pnl.pnlPercentage);
  const portfolioTotalPnl = allReturns.reduce((a, b) => a + b, 0);
  let portfolioSharpe = null;
  if (allReturns.length >= MIN_SIGNALS_FOR_RATIOS) {
    const avg = portfolioTotalPnl / allReturns.length;
    const sd = sampleStdDev(allReturns);
    if (sd > 0) portfolioSharpe = avg / sd;
  }
  return { perSymbol, totalSymbols: bySymbol.size, portfolioTotalPnl, portfolioSharpe, portfolioTotalTrades: rows.length };
};

// ---------------------------------------------------------------------------
// 1. BacktestMarkdownService — pooled full statistical suite (all 17 trades)
// ---------------------------------------------------------------------------
test("backtest_2.json: BacktestMarkdownService computes the full statistical suite over the pooled portfolio", async ({ pass, fail }) => {
  const svc = lib.backtestMarkdownService;
  svc.subscribe();

  await svc.clear({ symbol: POOL_SYMBOL, strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });
  for (const row of signals) {
    await svc.tick(toClosedTick(row, POOL_SYMBOL));
  }

  const stats = await svc.getData(POOL_SYMBOL, STRATEGY, EXCHANGE, FRAME, true);
  const ref = computePoolReference(signals);

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
    `Backtest pooled math verified (n=${stats.totalSignals}): sharpe=${stats.sharpeRatio.toFixed(4)}, ` +
    `annSharpe=${stats.annualizedSharpeRatio.toFixed(3)}, sortino=${stats.sortinoRatio.toFixed(4)}, ` +
    `calmar=${stats.calmarRatio === null ? "N/A" : stats.calmarRatio.toFixed(3)}, ` +
    `recovery=${stats.recoveryFactor === null ? "N/A" : stats.recoveryFactor.toFixed(3)}, ` +
    `maxDD=${ref.equityMaxDrawdown.toFixed(2)}%, winRate=${stats.winRate.toFixed(2)}%`
  );
});

// ---------------------------------------------------------------------------
// 2. LiveMarkdownService — same pooled suite in live mode
// ---------------------------------------------------------------------------
test("backtest_2.json: LiveMarkdownService computes the same pooled suite (live mode)", async ({ pass, fail }) => {
  const svc = lib.liveMarkdownService;
  svc.subscribe();

  await svc.clear({ symbol: POOL_SYMBOL, strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: false });
  for (const row of signals) {
    await svc.tick({ ...toClosedTick(row, POOL_SYMBOL), backtest: false });
  }

  const stats = await svc.getData(POOL_SYMBOL, STRATEGY, EXCHANGE, FRAME, false);
  const ref = computePoolReference(signals);

  const checks = [
    ["totalClosed", stats.totalClosed === ref.n, stats.totalClosed, ref.n],
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
  ];

  for (const [name, ok, got, want] of checks) {
    if (!ok) {
      fail(`${name}: service=${got} ref=${want}`);
      return;
    }
  }

  pass(
    `Live pooled math verified (n=${stats.totalClosed}): sharpe=${stats.sharpeRatio.toFixed(4)}, ` +
    `sortino=${stats.sortinoRatio.toFixed(4)}, calmar=${stats.calmarRatio === null ? "N/A" : stats.calmarRatio.toFixed(3)}, ` +
    `recovery=${stats.recoveryFactor === null ? "N/A" : stats.recoveryFactor.toFixed(3)}`
  );
});

// ---------------------------------------------------------------------------
// 3. HeatMarkdownService — real multi-symbol portfolio aggregation (8 symbols)
// ---------------------------------------------------------------------------
test("backtest_2.json: HeatMarkdownService aggregates all symbols (per-symbol gated, pooled Sharpe computed)", async ({ pass, fail }) => {
  const svc = lib.heatMarkdownService;
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
      [`${symbol}.sharpeRatio`, approx(row.sharpeRatio, want.sharpeRatio, 1e-9), row.sharpeRatio, want.sharpeRatio],
      [`${symbol}.maxDrawdown`, approx(row.maxDrawdown, want.maxDrawdown, 1e-6), row.maxDrawdown, want.maxDrawdown],
    ];
    for (const [name, ok, got, exp] of rowChecks) {
      if (!ok) {
        fail(`${name}: service=${got} ref=${exp}`);
        return;
      }
    }
  }

  const nonNull = stats.symbols.filter((s) => s.sharpeRatio !== null);
  if (nonNull.length !== 0) {
    fail(`expected all per-symbol Sharpe null (each <10 trades), non-null for: ${nonNull.map((s) => s.symbol).join(", ")}`);
    return;
  }

  const poolChecks = [
    ["portfolioTotalTrades", stats.portfolioTotalTrades === ref.portfolioTotalTrades, stats.portfolioTotalTrades, ref.portfolioTotalTrades],
    ["portfolioTotalPnl", approx(stats.portfolioTotalPnl, ref.portfolioTotalPnl, 1e-9), stats.portfolioTotalPnl, ref.portfolioTotalPnl],
    ["portfolioSharpeRatio", approx(stats.portfolioSharpeRatio, ref.portfolioSharpe, 1e-9), stats.portfolioSharpeRatio, ref.portfolioSharpe],
  ];
  for (const [name, ok, got, exp] of poolChecks) {
    if (!ok) {
      fail(`${name}: service=${got} ref=${exp}`);
      return;
    }
  }

  pass(
    `Heat portfolio math verified: ${stats.totalSymbols} symbols, all per-symbol Sharpe gated null, ` +
    `pooledSharpe=${stats.portfolioSharpeRatio.toFixed(4)}, portfolioPnl=${stats.portfolioTotalPnl.toFixed(2)}%, ` +
    `trades=${stats.portfolioTotalTrades}`
  );
});

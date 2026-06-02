import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import { STRATEGY, EXCHANGE, FRAME } from "../utils/_measure_helpers.mjs";

// Empty-state contract: getData() on a storage with NO signals must return
// the documented all-nulls / zeros shape; getReport() must return the
// documented "No signals closed yet." placeholder, NOT throw and NOT
// produce a half-filled report.

// ---------------------------------------------------------------------------
// Test 1: Backtest empty getData — every aggregate must be null or 0.
// ---------------------------------------------------------------------------
test("empty_state: Backtest getData on empty storage returns documented all-nulls shape", async ({ pass, fail }) => {
  const svc = lib.backtestMarkdownService;
  svc.subscribe();
  await svc.clear({ symbol: "EMPTY-BT", strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  const stats = await svc.getData("EMPTY-BT", STRATEGY, EXCHANGE, FRAME, true);

  if (stats.totalSignals !== 0) return fail(`totalSignals must be 0, got ${stats.totalSignals}`);
  if (stats.winCount !== 0) return fail(`winCount must be 0, got ${stats.winCount}`);
  if (stats.lossCount !== 0) return fail(`lossCount must be 0, got ${stats.lossCount}`);

  const mustBeNull = [
    "winRate", "avgPnl", "totalPnl", "stdDev", "sharpeRatio",
    "annualizedSharpeRatio", "certaintyRatio", "expectedYearlyReturns",
    "avgPeakPnl", "avgFallPnl", "sortinoRatio", "calmarRatio", "recoveryFactor",
  ];
  for (const f of mustBeNull) {
    if (stats[f] !== null) return fail(`${f} must be null on empty storage, got ${stats[f]}`);
  }
  if (!Array.isArray(stats.signalList) || stats.signalList.length !== 0) {
    return fail(`signalList must be empty array, got ${stats.signalList}`);
  }
  pass(`Backtest empty state: 14 fields verified null, counts 0, empty list`);
});

// ---------------------------------------------------------------------------
// Test 2: Live empty getData — same shape under live keys.
// ---------------------------------------------------------------------------
test("empty_state: Live getData on empty storage returns documented all-nulls shape", async ({ pass, fail }) => {
  const svc = lib.liveMarkdownService;
  svc.subscribe();
  await svc.clear({ symbol: "EMPTY-LV", strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: false });

  const stats = await svc.getData("EMPTY-LV", STRATEGY, EXCHANGE, FRAME, false);

  if (stats.totalEvents !== 0) return fail(`totalEvents must be 0, got ${stats.totalEvents}`);
  if (stats.totalClosed !== 0) return fail(`totalClosed must be 0, got ${stats.totalClosed}`);

  const mustBeNull = [
    "winRate", "avgPnl", "totalPnl", "stdDev", "sharpeRatio",
    "annualizedSharpeRatio", "certaintyRatio", "expectedYearlyReturns",
    "avgPeakPnl", "avgFallPnl", "sortinoRatio", "calmarRatio", "recoveryFactor",
  ];
  for (const f of mustBeNull) {
    if (stats[f] !== null) return fail(`${f} must be null, got ${stats[f]}`);
  }
  if (!Array.isArray(stats.eventList) || stats.eventList.length !== 0) {
    return fail(`eventList must be empty array, got ${stats.eventList}`);
  }
  pass(`Live empty state verified`);
});

// ---------------------------------------------------------------------------
// Test 3: getReport on empty storage returns placeholder, NOT a half-filled
// report. Locks in the "No signals closed yet." UX contract.
// ---------------------------------------------------------------------------
test("empty_state: getReport on empty storage returns documented placeholder, no table", async ({ pass, fail }) => {
  const svc = lib.backtestMarkdownService;
  svc.subscribe();
  await svc.clear({ symbol: "EMPTY-RPT", strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  const md = await svc.getReport("EMPTY-RPT", STRATEGY, EXCHANGE, FRAME, true);

  if (!/# Backtest Report:/.test(md)) return fail(`report must include heading, got:\n${md}`);
  if (!/No signals closed yet/.test(md)) {
    return fail(`empty report must contain "No signals closed yet" placeholder, got:\n${md}`);
  }
  // Must NOT contain a markdown table on empty state (regression: half-filled report).
  if (/^\|.*\|.*\|/m.test(md)) {
    return fail(`empty report must NOT contain a table:\n${md}`);
  }
  if (/\*\*Sharpe Ratio:\*\*/.test(md)) {
    return fail(`empty report must NOT contain stat lines:\n${md}`);
  }
  pass(`Empty getReport: placeholder shown, no leaked table or stat lines`);
});

// ---------------------------------------------------------------------------
// Test 4: Heat empty getData — no symbols tracked.
// ---------------------------------------------------------------------------
test("empty_state: Heat getData on empty storage returns no symbols, null pool aggregates", async ({ pass, fail }) => {
  const svc = lib.heatMarkdownService;
  svc.subscribe();
  await svc.clear({ exchangeName: "EMPTY-HEAT", frameName: FRAME, backtest: true });

  const stats = await svc.getData("EMPTY-HEAT", FRAME, true);

  if (stats.totalSymbols !== 0) return fail(`totalSymbols must be 0, got ${stats.totalSymbols}`);
  if (!Array.isArray(stats.symbols) || stats.symbols.length !== 0) {
    return fail(`symbols must be empty array, got ${JSON.stringify(stats.symbols)}`);
  }
  if (stats.portfolioTotalPnl !== null) {
    return fail(`portfolioTotalPnl must be null, got ${stats.portfolioTotalPnl}`);
  }
  if (stats.portfolioSharpeRatio !== null) {
    return fail(`portfolioSharpeRatio must be null, got ${stats.portfolioSharpeRatio}`);
  }
  if (stats.portfolioTotalTrades !== 0) {
    return fail(`portfolioTotalTrades must be 0, got ${stats.portfolioTotalTrades}`);
  }
  pass(`Heat empty state verified`);
});

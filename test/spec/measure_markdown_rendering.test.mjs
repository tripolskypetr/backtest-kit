import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals3 from "../data/backtest_3.json" with { type: "json" }; // N=9, all ratios null
import signals1 from "../data/backtest_1.json" with { type: "json" }; // happy path
import signals10 from "../data/backtest_10.json" with { type: "json" }; // blown
import {
  STRATEGY,
  EXCHANGE,
  FRAME,
  toClosedTick,
} from "../utils/measure_helpers.mjs";

// Markdown rendering — defends the report's textual contract.
// Bug history: getReport could regress to printing `null` instead of `N/A`,
// or to omitting the "(higher is better)" suffix, or to emitting `NaN%`.
// We assert on the produced markdown directly, not on getData() values.

const feedAndReport = async (svc, poolSymbol, rows) => {
  svc.subscribe();
  await svc.clear({ symbol: poolSymbol, strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });
  for (const row of rows) {
    await svc.tick(toClosedTick(row, { symbolOverride: poolSymbol }));
  }
  return await svc.getReport(poolSymbol, STRATEGY, EXCHANGE, FRAME, true);
};

// ---------------------------------------------------------------------------
// 1. Gated metrics render as "N/A", not the literal string "null".
// ---------------------------------------------------------------------------
test("markdown: gated metrics render as 'N/A' (Backtest, N=9)", async ({ pass, fail }) => {
  const md = await feedAndReport(lib.backtestMarkdownService, "MD-NA", signals3);

  const mustHave = [
    /\*\*Sharpe Ratio:\*\* N\/A/,
    /\*\*Annualized Sharpe Ratio:\*\* N\/A/,
    /\*\*Sortino Ratio:\*\* N\/A/,
    /\*\*Expected Yearly Returns:\*\* N\/A/,
    /\*\*Calmar Ratio:\*\* N\/A/,
  ];
  for (const re of mustHave) {
    if (!re.test(md)) {
      fail(`pattern not found: ${re.source}\n--- report ---\n${md.slice(0, 800)}\n---`);
      return;
    }
  }

  // The literal "null"/"NaN" must NEVER appear in a VALUE the report renders —
  // that would mean a null/NaN was string-concatenated instead of formatted to
  // "N/A". The contract lives in the metric lines (start with "**") and the
  // signal-table rows (start with "|"). The trailing annotation block (each line
  // a single-"*" italic definition) legitimately uses the prose words
  // "null"/"Null"/"NaN" to explain each metric's gating ("Null when the closed
  // signal count < 10", "forced to 0 instead of NaN"), so scanning the whole
  // document would false-positive on documentation. Scan only the value lines.
  const valueLines = md
    .split("\n")
    .filter((l) => l.startsWith("**") || l.startsWith("|"));
  const nullLine = valueLines.find((l) => /\bnull\b/i.test(l));
  if (nullLine) {
    fail(`metric/table line renders literal "null":\n${nullLine}`);
    return;
  }
  const nanLine = valueLines.find((l) => /\bNaN\b/.test(l));
  if (nanLine) {
    fail(`metric/table line renders "NaN":\n${nanLine}`);
    return;
  }
  pass(`Gated metrics render as N/A, no literal 'null' or 'NaN'`);
});

// ---------------------------------------------------------------------------
// 2. Computed metrics render with correct precision + suffix.
// ---------------------------------------------------------------------------
test("markdown: computed metrics include '(higher is better)' suffix (Backtest, n=22)", async ({ pass, fail }) => {
  const md = await feedAndReport(lib.backtestMarkdownService, "MD-OK", signals1);

  // Sharpe is 0.3021 — must render as a number with 3 decimals + suffix.
  if (!/\*\*Sharpe Ratio:\*\* -?\d+\.\d{3} \(higher is better\)/.test(md)) {
    fail(`Sharpe Ratio line malformed:\n${md.slice(0, 800)}`);
    return;
  }
  if (!/\*\*Sortino Ratio:\*\* -?\d+\.\d{3} \(higher is better\)/.test(md)) {
    fail(`Sortino Ratio line malformed`);
    return;
  }
  if (!/\*\*Win rate:\*\* \d+\.\d{2}% \(\d+W \/ \d+L\) \(higher is better\)/.test(md)) {
    fail(`Win rate line malformed`);
    return;
  }
  // Avg PNL with leading + when positive.
  if (!/\*\*Average PNL:\*\* \+\d+\.\d{2}% \(higher is better\)/.test(md)) {
    fail(`Average PNL line missing leading '+' for positive value`);
    return;
  }
  pass(`Computed metrics render with correct precision and suffix`);
});

// ---------------------------------------------------------------------------
// 3. Blown account (N/A-on-blown contract): expectedYearlyReturns = null must
//    render as "N/A" (margin-based compounding is degenerate once a trade hits
//    -100% — the legacy -100.00% sentinel is gone), recoveryFactor = null must
//    render as "N/A".
// ---------------------------------------------------------------------------
test("markdown: blown account — expectedYearly = N/A, recoveryFactor = N/A (Backtest)", async ({ pass, fail }) => {
  const md = await feedAndReport(lib.backtestMarkdownService, "MD-BLOWN", signals10);

  if (!/\*\*Expected Yearly Returns:\*\* N\/A/.test(md)) {
    fail(`Expected Yearly Returns must render as N/A for blown account (N/A-on-blown):\n${md.slice(0, 1200)}`);
    return;
  }
  if (/\*\*Expected Yearly Returns:\*\* -100\.00%/.test(md)) {
    fail(`Legacy -100.00% blown sentinel must not render anymore:\n${md.slice(0, 1200)}`);
    return;
  }
  if (!/\*\*Recovery Factor:\*\* N\/A/.test(md)) {
    fail(`Recovery Factor must be N/A for blown account:\n${md.slice(0, 1200)}`);
    return;
  }
  pass(`Blown-account rendering verified`);
});

// ---------------------------------------------------------------------------
// 4. Heat report: pooled Sharpe rendering.
// ---------------------------------------------------------------------------
test("markdown: Heat report — 'Pooled Sharpe' label present, not 'Portfolio Sharpe'", async ({ pass, fail }) => {
  const svc = lib.heatMarkdownService;
  svc.subscribe();
  await svc.clear({ exchangeName: EXCHANGE, frameName: FRAME, backtest: true });
  for (const row of signals1) {
    await svc.tick(toClosedTick(row));
  }
  const md = await svc.getReport("md-test-heat", EXCHANGE, FRAME, true);

  // Bug history: label was renamed from "Portfolio Sharpe" to "Pooled Sharpe"
  // to make the (non-Markowitz) semantics honest. Regression-safety here.
  if (!/\*\*Pooled Sharpe:\*\*/.test(md)) {
    fail(`Heat report must contain "**Pooled Sharpe:**" label:\n${md.slice(0, 1200)}`);
    return;
  }
  if (/\*\*Portfolio Sharpe:\*\*/.test(md)) {
    fail(`Heat report must NOT contain the old "**Portfolio Sharpe:**" label`);
    return;
  }
  pass(`Heat 'Pooled Sharpe' label verified`);
});

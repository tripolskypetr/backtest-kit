import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";

// Walker has NO buffer cap. WalkerMarkdownService accumulates every
// strategy result fed via tick() without trimming. This makes it
// fundamentally different from Backtest/Live/Heat (where the buffer cap
// silently evicts old data).
//
// This test locks that contract: feed 500 strategy contracts, all 500 must
// remain accessible in strategyResults. Regression-safety against anyone
// introducing a cap (would silently change reporting semantics).

const WALKER = "unbounded-walker";
const EXCHANGE = "ccxt-exchange";
const FRAME = "edge-frame";
const SYMBOL = "EDGE-WALKER-UNBOUNDED";

const makeStats = (sharpe) => ({
  signalList: [],
  totalSignals: 30,
  winCount: 18,
  lossCount: 12,
  winRate: 60,
  avgPnl: 0.4,
  totalPnl: 12,
  stdDev: 0.5,
  sharpeRatio: sharpe,
  annualizedSharpeRatio: sharpe * 19,
  certaintyRatio: 1.2,
  expectedYearlyReturns: 40,
  avgPeakPnl: 1.0,
  avgFallPnl: -0.5,
  sortinoRatio: 0.9,
  calmarRatio: 4,
  recoveryFactor: 2,
});

const makeContract = (strategyName, sharpe, bestStrategy, bestMetric) => ({
  walkerName: WALKER,
  exchangeName: EXCHANGE,
  frameName: FRAME,
  symbol: SYMBOL,
  strategyName,
  stats: makeStats(sharpe),
  metricValue: sharpe,
  metric: "sharpeRatio",
  bestMetric,
  bestStrategy,
  strategiesTested: 1,
  totalStrategies: 500,
});

test("walker_unbounded: 500 strategies fed — all retained, NO buffer cap", async ({ pass, fail }) => {
  const svc = lib.walkerMarkdownService;
  svc.subscribe();
  svc.clear();

  // Track the running best while we feed
  let bestStrat = null;
  let bestMetric = -Infinity;

  for (let i = 0; i < 500; i++) {
    // Random-ish sharpe — peaks once at the middle
    const sharpe = (i === 250) ? 3.5 : 0.5 + (i % 7) * 0.1;
    const name = `strat-${String(i + 1).padStart(3, "0")}`;
    if (sharpe > bestMetric) { bestMetric = sharpe; bestStrat = name; }
    await svc.tick(makeContract(name, sharpe, bestStrat, bestMetric));
  }

  const results = await svc.getData(WALKER, SYMBOL, "sharpeRatio", { exchangeName: EXCHANGE, frameName: FRAME });

  if (results.strategyResults.length !== 500) {
    fail(`Walker must retain ALL 500 strategies (no buffer cap), got ${results.strategyResults.length}. ` +
      `If <500, a cap has been introduced — this changes reporting semantics silently.`);
    return;
  }
  // The peak at index 250 must still be the bestStrategy
  if (results.bestStrategy !== "strat-251") {
    fail(`bestStrategy must be strat-251 (sharpe=3.5 at i=250), got ${results.bestStrategy}`);
    return;
  }
  pass(`Walker unbounded contract verified: ${results.strategyResults.length} strategies retained, peak=${results.bestStrategy}@${results.bestMetric}`);
});

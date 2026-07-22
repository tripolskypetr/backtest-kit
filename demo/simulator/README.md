---
title: other/simulator/readme
group: other/simulator
---

# Simulator Demo

> Link to [the source code](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/simulator)

A **feasibility probe** for a signal feed, driven by the `Simulator` entity. The dataset is a scrape of TradingView ideas (author, direction, publish time) for June 2026 — a month where BTC fell **−20.4%** while the crowd kept posting longs. The question this demo answers is deliberately more basic than "which parameters are best": **is there anything to compute at all?** Does this news flow contain any signal worth searching for, and how many ideas and authors survive the windows — the anti-flood dedupe and the author ban rules — that any honest pipeline must apply first?

Be clear about what the search for the best grid point means here: **the probe's output is not a sum of money — it is a boolean.** The winners' PnL below is not a forecast of earnings; the sweep hunts for the ideal point only as *evidence*, and the whole run collapses into one bit: `true` — the dataset carries an edge and further processing makes sense, or `false` — there is nothing here and every next step is a waste.

That is why there is **no out-of-sample test run here, by design.** The probe evaluates the feed on its own full history (train-on-train, stated openly): a feed that yields no profitable grid region and no allowed authors under these most favorable conditions is disqualified immediately — there is nothing to validate. A feed that passes graduates to [`demo/tune`](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/tune), where the surviving signal is trained honestly: walk-forward split, frozen artifact, one shot on the tail.

Not every feed will pass, and that is the point. The edge found here is a property of THIS kind of feed: it rides **crowd liquidity** (a public idea with an audience moves its own market — people see the post, buy, and push the price a step by themselves) and it feeds the ban filter with a **large author population** to select from. Swap the input for an arbitrary RSS stream or a single-author Telegram channel and the same machinery may honestly find nothing: a feed nobody trades on has no crowd step to harvest, and a single unproven author offers nothing to whitelist — in principle, ALL of his signals can be wrong.

## Purpose

This project exists for the concrete checks below.

### 1. Is there a profitable grid region at all?

One `Simulator.run` over the whole feed: each idea gets ONE asynchronous candle pass from the minute after its publication (5-day horizon, wick-honest execution — exits by high/low, never close-to-close, stop wins inside an ambiguous candle, fees and slippage on both legs), and the outcome of **any** grid point is derived from the profiles arithmetically — a 23,328-point grid costs one candle pass per idea, not 23,328 backtests. If no point shows a viable risk-adjusted result even on its own training range, the feed carries no extractable signal — full stop.

### 2. How much does the window cut?

Before any trading logic runs, the feed passes the honesty filters: NEUTRAL ideas dropped, flood deduplicated (at most one idea per author per direction per 8 hours — reposting a call must not inflate a track record, retrigger entries or keep a consensus vote alive). The probe reports the cut explicitly: **421 BTCUSDT ideas → 300 directional survivors**. A feed that mostly evaporates here is a feed of reposts, not signals.

### 3. Does anyone survive the ban?

Ban is the **default**: an author is allowed only when his correctness is unambiguously proven — enough ideas with a fully observed outcome at a sufficient hit rate. The probe answers how many authors clear the bar: **5 of 154** under the winning rule (track ≥ 5, hit rate ≥ 0.6 — 149 banned, the long-posting crowd included). An empty whitelist is a disqualifying verdict no parameter sweep can fix.

### 4. Rules are searched, not assumed

Every mechanism threshold is a grid axis, not a constant: the ban rule (track ∈ {2, 3, 5} × hit rate ∈ {0.5, 0.6}), the weighted consensus gate (`minWeightAligned` ∈ {0, 0.6, 1.2} — Laplace-smoothed track-record weights of aligned authors), and the profit lock (`profitLockPercent` ∈ {0, 1.5, 2.5} — a floor armed by touching +X% from entry, exit on a pullback to it). The winners prove the axes carry signal: each ranking criterion elects a different rule combination, and the profit lock in particular is the watershed — see the results below.

### 5. The probe picks candidates, the engine validates them

The result carries ranking winners (time-based Sharpe/Sortino over daily equity increments — frozen capital is not free — plus total PnL and recovery factor) with full trade lists, hold-time tail percentiles and per-trade `absorbedIdeaIds`. These are **candidates and upper bounds**: the honest confirmation lives in `demo/tune` (walk-forward), and the final arbiter is always a real engine backtest (`Backtest.run`).

## Actual Results (June 2026, BTCUSDT, full feed)

The committed artifact is [`assets/simulator.done.json`](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/simulator/assets/simulator.done.json). The feed is strictly crypto-venue: ideas are classified by the `fullName` exchange prefix (Binance, Coinbase, Bitstamp, Bybit, OKX, …) — forex/CFD, metals, stocks and indices never enter the file, so no fabricated pairs.

| Stage | Numbers |
|---|---|
| Ideas in feed (BTCUSDT) | 421 total → 300 after NEUTRAL + flood dedupe |
| Profiles built | 300, none truncated |
| Author filter | **5 allowed / 149 banned** (winning rule: track ≥ 5, hit rate ≥ 0.6) |
| Grid | 23,328 points (8 × 6 × 3 × 3 × 3 × 2 × 3 × 3) |

The four ranking winners:

| Criterion | Point | Trades | PnL | Win rate | DD | Sharpe | Sortino |
|---|---|---|---|---|---|---|---|
| Sharpe | H=3 TT=2 72h N=1 track≥5 rate≥0.6 **lock=2.5** | 17 | +20.17% | 82% | 6.61% | **2.29** | 4.32 |
| PnL | H=3 TT=2 72h N=1 track≥2 rate≥0.6 **lock=2.5** | 19 | **+21.06%** | 84% | 6.61% | 2.03 | 3.68 |
| Sortino | H=2.5 TT=0.5 24h N=1 W=1.2 lock=1.5 | 10 | +2.18% | 60% | **0.51%** | 1.60 | **9.00** |
| Recovery | H=7 TT=4 72h N=2 track≥2 rate≥0.6 lock=0 | 8 | +18.97% | 63% | 1.92% | 1.39 | 7.12 |

The verdict for this feed: **`true` — there is an edge to process.** Not because +20% is money anyone will earn (it is not — a train-on-train, selection-biased ceiling), but because the evidence stacks: the profitable region is broad, not one point — the four winners span the whole risk spectrum, from a max-sharpe point to a near-zero-drawdown sortino curiosity to a lock-free low-DD recovery profile — and **hold = 72h** dominates three rankings of four. The profit lock is the scoring mechanism: 12 of 17 exits on the sharpe winner and 14 of 19 on the pnl winner are `profit_lock` at +2.5% — the crowd's ideas reach the lock level far more often than they survive 72 hours unlocked. And 5 authors survive the strictest scrutiny — enough population for a whitelist: TradingShot, MarketStrategysignals, PremiumTrader57, XAUxBTC_Pro, melikatrader94.

## Project Structure

```
demo/simulator/
├── assets/
│   ├── tv-ideas.normalized.jsonl   # crypto-venue ideas only, symbols normalized to *USDT
│   └── simulator.done.json         # probe artifact: full-feed run, 23,328-point grid
├── src/
│   └── index.mjs                   # Exchange + simulator schema + Simulator.run
├── dump/                           # raw run outputs and the candle persist cache
├── package.json                    # Scripts and dependencies
└── README.md                       # This file
```

The ideas feed contains every crypto symbol seen on the source platform (BTCUSDT 421, ETHUSDT 205, XRPUSDT 86, …, 1,049 ideas total) — `Simulator.run` filters by the requested symbol itself, so one shared feed serves any run.

## Installation

```bash
cd demo/simulator
npm install
```

## Running

```bash
# feasibility probe over the whole feed
npm start

# the published CLI on the same feed (stdout report + ./dump JSON)
npm run cli
```

The script registers a CCXT Binance spot exchange (`ccxt_exchange`), a simulator schema (`tv_simulator`) with explicit grid axes, loads the ideas feed and runs the probe for BTCUSDT:

```javascript
addSimulatorSchema({
  simulatorName: "tv_simulator",
  exchangeName: "ccxt_exchange",
  gridAxes: {
    hardStopPercent: [1, 1.5, 2, 2.5, 3, 4, 5, 7],
    trailingTakePercent: [0.5, 1, 1.5, 2, 3, 4],
    holdMinutes: [24 * 60, 2 * 24 * 60, 3 * 24 * 60],
    minIdeasAligned: [1, 2, 3],
    // правило бана авторов — тоже оси перебора
    minAuthorTrack: [2, 3, 5],
    minAuthorHitRate: [0.5, 0.6],
    minWeightAligned: [0, 0.6, 1.2],
    profitLockPercent: [0, 1.5, 2.5],
  },
});
```

Candles are fetched lazily in chunks through the exchange schema (persist cache first, network after) — only the horizons of actual ideas are requested, gaps between sparse ideas are never downloaded. The full result is written to `./dump/simulator.done.json`.

## Reading the Result

The probe's answer is a single boolean, assembled from three checks in order of importance — none of them is a money figure:

1. **The whitelist size** (`allowedAuthors`). Zero → **`false`** immediately, regardless of anything else — nobody survives proof, nothing to follow. `authorStats` behind it carries the raw evidence (ideas with known outcome, hits, hit rate).
2. **The window cut** (`ideasTotal` → `ideasDirectional`). A feed that mostly evaporates into reposts and NEUTRAL noise → **`false`**: not enough workable signals to ever clear the anti-fluke floors.
3. **The best grid region** (`best` — ranking winners with full trade lists; `reports` — every point sorted by Sharpe; `p95/p99HoldMinutes` — eternal holds pinned at the cap are visible instantly). Train-on-train by construction — an upper bound, never a promise of earnings. Its only legitimate reading: if even this selection-biased ceiling is unprofitable → **`false`**, stop here.

All three pass → **`true`**: the feed graduates to [`demo/tune`](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/tune) — walk-forward training on the head of the feed and one frozen out-of-sample shot on the tail. A `false` is an answer too, and a much cheaper one than a month of forward testing on a dead feed.

## License

MIT © [tripolskypetr](https://github.com/tripolskypetr)

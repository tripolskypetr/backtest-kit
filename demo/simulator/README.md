---
title: other/simulator/readme
group: other/simulator
---

# Simulator Demo

> Link to [the source code](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/simulator)

A **feasibility probe** for a signal feed, driven by the `Simulator` entity. The dataset is a scrape of TradingView ideas (author, direction, publish time) for June 2026 — a month where BTC fell **−20.4%** while the crowd kept posting longs. The question this demo answers is deliberately more basic than "which parameters are best": **is there anything to compute at all?** Does this news flow contain any signal worth searching for, and how many ideas and authors survive the windows — the anti-flood dedupe and the author ban rules — that any honest pipeline must apply first?

That is why there is **no out-of-sample test run here, by design.** The probe evaluates the feed on its own full history (train-on-train, stated openly): a feed that yields no profitable grid region and no allowed authors under these most favorable conditions is disqualified immediately — there is nothing to validate. A feed that passes graduates to [`demo/tune`](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/tune), where the surviving signal is trained honestly: walk-forward split, frozen artifact, one shot on the tail.

Not every feed will pass, and that is the point. The edge found here is a property of THIS kind of feed: it rides **crowd liquidity** (a public idea with an audience moves its own market — people see the post, buy, and push the price a step by themselves) and it feeds the ban filter with a **large author population** to select from. Swap the input for an arbitrary RSS stream or a single-author Telegram channel and the same machinery may honestly find nothing: a feed nobody trades on has no crowd step to harvest, and a single unproven author offers nothing to whitelist — in principle, ALL of his signals can be wrong.

## Purpose

This project exists for the concrete checks below.

### 1. Is there a profitable grid region at all?

One `Simulator.run` over the whole feed: each idea gets ONE asynchronous candle pass from the minute after its publication (5-day horizon, wick-honest execution — exits by high/low, never close-to-close, stop wins inside an ambiguous candle, fees and slippage on both legs), and the outcome of **any** grid point is derived from the profiles arithmetically — a 2,592-point grid costs one candle pass per idea, not 2,592 backtests. If no point shows a viable risk-adjusted result even on its own training range, the feed carries no extractable signal — full stop.

### 2. How much does the window cut?

Before any trading logic runs, the feed passes the honesty filters: NEUTRAL ideas dropped, flood deduplicated (at most one idea per author per direction per 8 hours — reposting a call must not inflate a track record, retrigger entries or keep a consensus vote alive). The probe reports the cut explicitly: **421 BTCUSDT ideas → 300 directional survivors**. A feed that mostly evaporates here is a feed of reposts, not signals.

### 3. Does anyone survive the ban?

Ban is the **default**: an author is allowed only when his correctness is unambiguously proven — enough ideas with a fully observed outcome at a sufficient hit rate, and the ban thresholds themselves are grid axes (track ∈ {2, 3, 5} × hit rate ∈ {0.5, 0.6}). The probe answers how many authors clear the bar: **13 of 154** under the winning rule (141 banned — the long-posting crowd). An empty whitelist is a disqualifying verdict no parameter sweep can fix.

### 4. Does the ban rule itself matter?

Two entry points differ in exactly one thing. `src/index.mjs` sweeps the ban thresholds as grid axes; `src/index.strict.mjs` keeps the rule pinned at the engine default (track ≥ 3, rate ≥ 0.5). Comparing the two committed artifacts shows what searching the rule is worth on this feed: best sharpe 1.57 vs 1.04, drawdown 1.92% vs 5.29%.

### 5. The probe picks candidates, the engine validates them

The result carries ranking winners (time-based Sharpe/Sortino over daily equity increments — frozen capital is not free — plus total PnL) with full trade lists, hold-time tail percentiles and per-trade `absorbedIdeaIds`. These are **candidates and upper bounds**: the honest confirmation lives in `demo/tune` (walk-forward), and the final arbiter is always a real engine backtest (`Backtest.run`).

## Actual Results (June 2026, BTCUSDT, full feed)

Both artifacts are committed: [`assets/simulator.done.json`](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/simulator/assets/simulator.done.json) (swept ban rule) and [`assets/simulator.strict.json`](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/simulator/assets/simulator.strict.json) (pinned ban rule). The feed is strictly crypto-venue: ideas are classified by the `fullName` exchange prefix (Binance, Coinbase, Bitstamp, Bybit, OKX, …) — forex/CFD, metals, stocks and indices never enter the file, so no fabricated pairs.

| | Swept ban rule (`npm start`) | Pinned ban rule (`index.strict.mjs`) |
|---|---|---|
| Ideas (BTCUSDT) | 421 → 300 after NEUTRAL + flood dedupe | same |
| Profiles built | 300, none truncated | same |
| Author filter | **13 allowed / 141 banned** (winner rule: track≥2, rate≥0.6) | 12 allowed / 142 banned (track≥3, rate≥0.5) |
| Grid | 2,592 points | 432 points |
| Sharpe winner | H=7 TT=3 hold=72h N=2 | H=5 TT=3 hold=72h N=1 |
| Trades | 8 | 12 |
| PnL | **+15.98%** | +10.89% |
| Win rate | 63% | 75% |
| Max series drawdown | **1.92%** | 5.29% |
| Sharpe / Sortino | **1.57** / 6.00 | 1.04 / 1.84 |

The verdict for this feed: **there is something to compute.** A profitable region exists and is not a single fluke point (hold = 72h dominates both runs and every ranking), the window cut leaves 300 workable ideas, and 13 authors survive the strictest scrutiny — enough population for a whitelist. Sweeping the ban rule instead of hardcoding it adds half a point of sharpe and cuts the drawdown almost 3× — the rule is signal, not a constant. Top allowed authors under the winner's rule: TradingShot (15 ideas, 0.60), MarketStrategysignals (8, 0.62), PremiumTrader57 (8, 0.62), XAUxBTC_Pro (6, 0.67).

## Project Structure

```
demo/simulator/
├── assets/
│   ├── tv-ideas.normalized.jsonl   # crypto-venue ideas only, symbols normalized to *USDT
│   ├── simulator.done.json         # probe artifact: swept ban rule (2,592 points)
│   └── simulator.strict.json       # probe artifact: pinned ban rule (432 points)
├── src/
│   ├── index.mjs                   # Exchange + simulator schema, ban rule as grid axes
│   └── index.strict.mjs            # same, ban rule pinned to the engine default
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
# feasibility probe, ban rule swept as grid axes
npm start

# same probe with the ban rule pinned to the engine default
node ./src/index.strict.mjs

# the published CLI on the same feed (stdout report + ./dump JSON)
npm run cli
```

The script registers a CCXT Binance spot exchange (`ccxt_exchange`), a simulator schema (`tv_simulator`) with explicit grid axes, loads the ideas feed and runs the probe for BTCUSDT. Candles are fetched lazily in chunks through the exchange schema (persist cache first, network after) — only the horizons of actual ideas are requested, gaps between sparse ideas are never downloaded.

## Reading the Result

The probe's answer is three numbers, in order of importance:

1. **The whitelist size** (`allowedAuthors`). Zero disqualifies the feed regardless of anything else — nobody survives proof, nothing to follow. `authorStats` behind it carries the raw evidence (ideas with known outcome, hits, hit rate).
2. **The window cut** (`ideasTotal` → `ideasDirectional`). Shows how much of the flow is reposts and NEUTRAL noise versus workable directional signals.
3. **The best grid region** (`best` — ranking winners with full trade lists; `reports` — every point sorted by Sharpe; `p95/p99HoldMinutes` — eternal holds pinned at the cap are visible instantly). Train-on-train by construction: read it as an upper bound, not a promise. If even the upper bound is unprofitable, stop here.

A passing feed graduates to [`demo/tune`](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/tune) — walk-forward training on the head of the feed and one frozen out-of-sample shot on the tail. A failing feed is an answer too, and a much cheaper one than a month of forward testing.

## License

MIT © [tripolskypetr](https://github.com/tripolskypetr)

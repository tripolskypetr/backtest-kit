---
title: other/simulator/readme
group: other/simulator
---

# Simulator Demo

> Link to [the source code](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/simulator)

A walk-forward parameter sweep over crowd trading ideas, driven by the `Simulator` entity. The dataset is a scrape of TradingView ideas (author, direction, publish time) for June 2026 — a month where BTC fell **−20.4%** while the crowd kept posting longs. The demo trains on the first 70% of the feed's time range (`Simulator.run`: profiles, author whitelist, full grid, four ranking winners — without a backtest per grid point) and then proves the picked parameters **out-of-sample** on the remaining tail with `Simulator.test`: the winning point and the author track record are frozen, nothing is trained on the test data.

## Purpose

This project exists for the concrete checks below.

### 1. Ideas are the unit of simulation, not candles

Each idea gets ONE asynchronous forward candle pass from the minute after its publication, capped by a static 5-day horizon. The pass produces a per-candle trajectory profile: maximum favorable/adverse excursion by wicks, whale-shakeout depth (worst drawdown *before* the peak), and the count of aligned authors at entry. The outcome of **any** grid point — hard stop × trailing take × hold duration × consensus threshold — is then derived from the profile arithmetically. A 7,776-point grid costs one candle pass per idea, not 7,776 backtests.

### 2. Honest execution, no close-to-close shortcuts

The trade arithmetic follows strict contracts: entry at the open of the minute *after* publication, exits checked against candle wicks (never close), stop wins when stop and trailing are both reachable inside one candle, trailing arms only from previous-candle peaks and only when the locked level is not worse than entry, fees and slippage charged on both legs. Trade invariants are asserted on every grid point — a violation throws instead of producing a pretty number.

### 3. The author filter is a trained artifact

Ban is the **default**: an author is allowed only when his correctness is unambiguously proven — enough ideas with a fully observed outcome at a sufficient hit rate, and the ban thresholds themselves are grid axes (this demo sweeps track ∈ {2, 3, 5} × hit rate ∈ {0.5, 0.6}). Flood is neutralized before anything else: at most one idea per author per direction per 8 hours, so reposting the same call cannot inflate a track record, retrigger entries or keep a consensus vote alive. On the train window the winning rule allowed **10 of 42 authors** and banned the long-posting crowd — the whitelist (`allowedAuthors`) is the artifact to apply in production.

### 4. Metrics that measure performance, not a pretty picture

Sharpe and Sortino are **time-based**: computed over daily equity increments across the whole simulated range, idle days included. The same total PnL concentrated in rare chunky exits scores worse than PnL spread over frequent short trades — frozen capital is not free. Eternal holds are additionally visible in the raw accounting: hold-time tail percentiles (`p95HoldMinutes`, `p99HoldMinutes`) and per-trade `absorbedIdeaIds` — the qualified ideas a held position swallowed while occupying the slot.

### 5. The simulator picks candidates, the engine validates them

The result carries winners of four rankings (Sharpe, Sortino, total PnL, recovery factor) with full trade lists. These are **candidates**: the final arbiter for the chosen parameters is always a real engine backtest (`Backtest.run`) — the simulator's job is to make the search cheap, not to replace the engine.

### 6. Out-of-sample honesty via `Simulator.test`

`run()` trains its author filter with deliberate lookahead inside the train range — the honesty comes from the walk-forward step. `Simulator.test` takes the frozen Sharpe-winner point and the frozen `authorStats` from the train run and evaluates them on the tail of the feed the training never saw: the banned flag is re-derived from the frozen track under the point's own ban rule, an author unseen in train is banned by default (unproven = banned), and `onAuthorsTrained` never fires on test data.

## Actual Results (June 2026, BTCUSDT, walk-forward)

The committed [`dump/simulator.done.json`](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/simulator/dump/simulator.done.json) (train) and [`dump/simulator.test.json`](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/simulator/dump/simulator.test.json) (out-of-sample) were produced by one `npm start`. The feed is split by TIME at 70% of its range: **train = June 1–21**, **test = June 22–30** (the tail is denser — the crowd posted hardest at the bottom of the crash). The feed is strictly crypto-venue: ideas are classified by the `fullName` exchange prefix (Binance, Coinbase, Bitstamp, Bybit, OKX, …) — forex/CFD, metals, stocks and indices never enter the file, so no fabricated pairs.

| Stage | Train (June 1–21) | Test (June 22–30) |
|---|---|---|
| Ideas in feed (BTCUSDT) | 145 total → 119 after NEUTRAL + flood dedupe | 276 total → 181 |
| Profiles built | 119, none truncated | 181, none truncated |
| Author filter | **trained**: 10 allowed / 32 banned | **frozen** from train; unseen authors banned (144 banned total) |
| Grid | 7,776 points (8 × 6 × 3 × 3 × 3 × 2 × 3) | the Sharpe winner's single point |

The four ranking winners on the train window:

| Criterion | Point | Ban rule | Trades | PnL | Win rate | Sharpe | Sortino |
|---|---|---|---|---|---|---|---|
| Sharpe | H=5 TT=3 hold=72h N=1 W=0 | track≥2, rate≥0.5 | 9 (5L/4S) | +15.61% | 89% | **1.42** | 2.95 |
| Sortino | H=1 TT=4 hold=72h N=1 W=0.6 | track≥2, rate≥0.6 | 8 (0L/8S) | +14.94% | 38% | 1.07 | **5.13** |
| PnL | H=3 TT=4 hold=72h N=1 W=0 | track≥2, rate≥0.5 | 8 (3L/5S) | **+17.40%** | 75% | 1.25 | 4.31 |
| Recovery | H=4 TT=3 hold=72h N=1 W=0.6 | track≥3, rate≥0.5 | 8 (2L/6S) | +13.22% | 50% | 1.32 | 4.49 |

All four criteria converge on **hold = 72h**; the W column is the weighted-consensus threshold (`minWeightAligned`, swept from the defaults — two of four winners use it). Top allowed authors under the Sharpe winner's rule: TradingShot (10 ideas, 0.60), Apex_Legends (7, 0.57), Cryptollica (6, 0.50), MarketStrategysignals (6, 0.67).

### Out-of-sample (frozen point H=5 TT=3 hold=72h, frozen whitelist)

| Metric | Train | Test |
|---|---|---|
| Trades | 9 | 3 (16 qualified ideas absorbed by busy slot) |
| PnL | +15.61% | **+0.91%** |
| Win rate | 89% | 33% |
| Profit factor | — | 1.24 |
| Sharpe | 1.42 | 0.17 |
| Max series drawdown | 5.29% | 3.72% |

The test trades: one SHORT closed by trailing take at **+4.63%**, two LONGs expired at −1.49% and −2.23%. This shrinkage is the honest picture the train-only numbers hide: the edge survives out-of-sample (positive PnL, profit factor above 1) but is an order of magnitude thinner than the in-sample Sharpe suggests — exactly why `test()` exists, and why the final arbiter is still a real engine backtest.

## Project Structure

```
demo/simulator/
├── assets/
│   └── ts-ideas.normalized.jsonl   # crypto-venue ideas only, symbols normalized to *USDT
├── src/
│   └── index.mjs                   # Exchange + simulator schema + Simulator.run
├── dump/
│   └── simulator.done.json         # Full result of the committed run
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
npm start
```

The script registers a CCXT Binance spot exchange (`ccxt_exchange`), a simulator schema (`tv_simulator`) with explicit grid axes, splits the feed by time (train = first 70% of the range, test = the tail), runs the sweep on the train window and proves the Sharpe winner out-of-sample:

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
  },
});

// train on the first 70% of the feed's time range...
const result = await Simulator.run({
  symbol: "BTCUSDT",
  simulatorName: "tv_simulator",
  ideas: trainIdeas,
});

// ...prove the Sharpe winner on the tail the training never saw
const winner = result.best.find(({ criterion }) => criterion === "sharpe");
const testResult = await Simulator.test({
  symbol: "BTCUSDT",
  simulatorName: "tv_simulator",
  ideas: testIdeas,
  point: winner.report.point,
  authorStats: result.authorStats,
});
```

Candles are fetched lazily in chunks through the exchange schema (persist cache first, network after) — only the horizons of actual ideas are requested, gaps between sparse ideas are never downloaded. The train result is written to `./dump/simulator.done.json`, the out-of-sample result to `./dump/simulator.test.json`.

## Reading the Result

`ISimulatorResult` fields worth checking first:

- **`best`** — winners of the four rankings, each with its point report and full trade list (`exitReason`, `pnlPercent`, `holdMinutesActual`, `absorbedIdeaIds` per trade).
- **`allowedAuthors` / `bannedAuthors`** — the trained whitelist; in production only ideas of allowed authors should count.
- **`authorStats`** — per-author track records behind the ban decisions (ideas with known outcome, hits, hit rate).
- **`reports`** — all grid points sorted by Sharpe, each with time-based Sharpe/Sortino, exit-reason counts and hold-time percentiles.
- **`avgHoldMinutes` / `p95HoldMinutes` / `p99HoldMinutes`** — run-level hold distribution; a p99 pinned at the hold cap exposes eternal holds instantly.

`ISimulatorTestResult` (the out-of-sample artifact) mirrors a single point of the above: the frozen `point`, its `report` with the same metric math (time-based Sharpe/Sortino, Calmar, recovery — computed over the TEST range), the `trades` list, and the frozen author artifact as applied (`authorStats` carry the train numbers verbatim; `bannedAuthors` additionally includes every author seen only in the test feed).

## License

MIT © [tripolskypetr](https://github.com/tripolskypetr)

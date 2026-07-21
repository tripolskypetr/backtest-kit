---
title: other/simulator/readme
group: other/simulator
---

# Simulator Demo

> Link to [the source code](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/simulator)

A parameter sweep over crowd trading ideas, driven by the `Simulator` entity. The dataset is a scrape of TradingView ideas (author, direction, publish time) for June 2026 — a month where BTC fell **−20.4%** while the crowd kept posting longs. The simulator profiles every idea with one candle pass, trains an author whitelist on the results, evaluates the whole exit-parameter grid arithmetically from the profiles and reports three ranking winners — without running a backtest per grid point.

## Purpose

This project exists for the concrete checks below.

### 1. Ideas are the unit of simulation, not candles

Each idea gets ONE asynchronous forward candle pass from the minute after its publication, capped by a static 5-day horizon. The pass produces a per-candle trajectory profile: maximum favorable/adverse excursion by wicks, whale-shakeout depth (worst drawdown *before* the peak), and the count of aligned authors at entry. The outcome of **any** grid point — hard stop × trailing take × hold duration × consensus threshold — is then derived from the profile arithmetically. A 432-point grid costs one candle pass per idea, not 432 backtests.

### 2. Honest execution, no close-to-close shortcuts

The trade arithmetic follows strict contracts: entry at the open of the minute *after* publication, exits checked against candle wicks (never close), stop wins when stop and trailing are both reachable inside one candle, trailing arms only from previous-candle peaks and only when the locked level is not worse than entry, fees and slippage charged on both legs. Trade invariants are asserted on every grid point — a violation throws instead of producing a pretty number.

### 3. The author filter is a trained artifact

Ban is the **default**: an author is allowed only when his correctness is unambiguously proven — at least 3 ideas with a fully observed outcome and a hit rate of 50% or better. Flood is neutralized before anything else: at most one idea per author per direction per 8 hours, so reposting the same call cannot inflate a track record, retrigger entries or keep a consensus vote alive. On this bear-month dataset the filter allowed **17 of 167 authors** and banned the long-posting crowd — the whitelist (`allowedAuthors`) is the artifact to apply in production.

### 4. Metrics that measure performance, not a pretty picture

Sharpe and Sortino are **time-based**: computed over daily equity increments across the whole simulated range, idle days included. The same total PnL concentrated in rare chunky exits scores worse than PnL spread over frequent short trades — frozen capital is not free. Eternal holds are additionally visible in the raw accounting: hold-time tail percentiles (`p95HoldMinutes`, `p99HoldMinutes`) and per-trade `absorbedIdeaIds` — the qualified ideas a held position swallowed while occupying the slot.

### 5. The simulator picks candidates, the engine validates them

The result carries winners of three rankings (Sharpe, Sortino, total PnL) with full trade lists. These are **candidates**: the final arbiter for the chosen parameters is always a real engine backtest (`Backtest.run`) — the simulator's job is to make the search cheap, not to replace the engine.

## Actual Results (June 2026, BTCUSDT)

The committed [`dump/simulator.done.json`](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/simulator/dump/simulator.done.json) was produced by this demo on the bear month:

| Stage | Numbers |
|---|---|
| Ideas in feed (BTCUSDT) | 462 total → 334 after NEUTRAL + flood dedupe |
| Profiles built | 334, none truncated |
| Author filter | 17 allowed / 150 banned (default-ban) |
| Grid | 432 points (8 × 6 × 3 × 3) |

All three rankings converged to one zone:

| Criterion | Point | Trades | PnL | Win rate | Sharpe |
|---|---|---|---|---|---|
| Sharpe | H=5 TT=1 hold=72h N=1 | 31 (12L/19S) | +23.66% | 87% | 2.60 |
| Sortino | H=5 TT=1 hold=72h N=1 | 31 (12L/19S) | +23.66% | 87% | 2.60 |
| PnL | H=4 TT=1 hold=72h N=1 | 31 (12L/19S) | +24.24% | 87% | 2.21 |

On a −20% month the whitelist-filtered crowd signal earned +23.7%, mostly on shorts, with a single stop-out (a long into the falling knife). Top allowed authors: TradingShot (15 ideas, 0.60 hit rate), Apex_Legends (10, 0.50), MarketStrategysignals (9, 0.56).

## Project Structure

```
demo/simulator/
├── assets/
│   └── ts-ideas.normalized.jsonl   # TradingView ideas, symbols normalized to *USDT
├── src/
│   └── index.mjs                   # Exchange + simulator schema + Simulator.run
├── dump/
│   └── simulator.done.json         # Full result of the committed run
├── package.json                    # Scripts and dependencies
└── README.md                       # This file
```

The ideas feed contains every symbol (BTCUSDT, ETHUSDT, XAUUSDT, …) — `Simulator.run` filters by the requested symbol itself, so one shared feed serves any run.

## Installation

```bash
cd demo/simulator
npm install
```

## Running

```bash
npm start
```

The script registers a CCXT Binance spot exchange (`ccxt_exchange`), a simulator schema (`tv_simulator`) with explicit grid axes, loads the ideas feed and runs the sweep for BTCUSDT:

```javascript
addSimulatorSchema({
  simulatorName: "tv_simulator",
  exchangeName: "ccxt_exchange",
  gridAxes: {
    hardStopPercent: [1, 1.5, 2, 2.5, 3, 4, 5, 7],
    trailingTakePercent: [0.5, 1, 1.5, 2, 3, 4],
    holdMinutes: [24 * 60, 2 * 24 * 60, 3 * 24 * 60],
    minIdeasAligned: [1, 2, 3],
  },
});

const result = await Simulator.run({
  symbol: "BTCUSDT",
  simulatorName: "tv_simulator",
  ideas,
});
```

Candles are fetched lazily in chunks through the exchange schema (persist cache first, network after) — only the horizons of actual ideas are requested, gaps between sparse ideas are never downloaded. The full result is written to `./dump/simulator.done.json`.

## Reading the Result

`ISimulatorResult` fields worth checking first:

- **`best`** — winners of the three rankings, each with its point report and full trade list (`exitReason`, `pnlPercent`, `holdMinutesActual`, `absorbedIdeaIds` per trade).
- **`allowedAuthors` / `bannedAuthors`** — the trained whitelist; in production only ideas of allowed authors should count.
- **`authorStats`** — per-author track records behind the ban decisions (ideas with known outcome, hits, hit rate).
- **`reports`** — all grid points sorted by Sharpe, each with time-based Sharpe/Sortino, exit-reason counts and hold-time percentiles.
- **`avgHoldMinutes` / `p95HoldMinutes` / `p99HoldMinutes`** — run-level hold distribution; a p99 pinned at the hold cap exposes eternal holds instantly.

## License

MIT © [tripolskypetr](https://github.com/tripolskypetr)

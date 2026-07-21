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

Ban is the **default**: an author is allowed only when his correctness is unambiguously proven — enough ideas with a fully observed outcome at a sufficient hit rate, and the ban thresholds themselves are grid axes (defaults: 3 ideas, 50%). Flood is neutralized before anything else: at most one idea per author per direction per 8 hours, so reposting the same call cannot inflate a track record, retrigger entries or keep a consensus vote alive. On this bear-month dataset the filter allowed **12 of 154 authors** and banned the long-posting crowd — the whitelist (`allowedAuthors`) is the artifact to apply in production.

### 4. Metrics that measure performance, not a pretty picture

Sharpe and Sortino are **time-based**: computed over daily equity increments across the whole simulated range, idle days included. The same total PnL concentrated in rare chunky exits scores worse than PnL spread over frequent short trades — frozen capital is not free. Eternal holds are additionally visible in the raw accounting: hold-time tail percentiles (`p95HoldMinutes`, `p99HoldMinutes`) and per-trade `absorbedIdeaIds` — the qualified ideas a held position swallowed while occupying the slot.

### 5. The simulator picks candidates, the engine validates them

The result carries winners of three rankings (Sharpe, Sortino, total PnL) with full trade lists. These are **candidates**: the final arbiter for the chosen parameters is always a real engine backtest (`Backtest.run`) — the simulator's job is to make the search cheap, not to replace the engine.

## Actual Results (June 2026, BTCUSDT)

The committed [`dump/simulator.done.json`](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/simulator/dump/simulator.done.json) was produced by `npm start` on the bear month. The feed is strictly crypto-venue: ideas are classified by the `fullName` exchange prefix (Binance, Coinbase, Bitstamp, Bybit, OKX, …) — forex/CFD, metals, stocks and indices never enter the file, so no fabricated pairs.

| Stage | Numbers |
|---|---|
| Ideas in feed (BTCUSDT) | 421 total → 300 after NEUTRAL + flood dedupe |
| Profiles built | 300, none truncated |
| Author filter | 12 allowed / 142 banned (default-ban, thresholds = grid axes) |
| Grid | 432 points (8 × 6 × 3 × 3 × default ban axes) |

All three rankings converged to a **single point** — a strong robustness signal:

| Criterion | Point | Trades | PnL | Win rate | Sharpe | Sortino |
|---|---|---|---|---|---|---|
| Sharpe = Sortino = PnL | H=5 TT=3 hold=72h N=1 | 12 (8L/4S) | **+10.89%** | 75% | 1.04 | 1.84 |

On a −20.4% month the whitelist-filtered crowd signal earned +10.89% with a single stop-out — and, notably, 8 of the 12 trades are **longs**: with a 3% trailing take the whitelisted authors' bottom-calls on relief rallies pay even against the downtrend. Top allowed authors: TradingShot (15 ideas, 0.60 hit rate), MarketStrategysignals (8, 0.62), PremiumTrader57 (8, 0.62), XAUxBTC_Pro (6, 0.67).

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

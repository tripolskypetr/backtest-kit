---
title: other/tune/readme
group: other/tune
---

# Tune Demo

> Link to [the source code](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/tune)

A two-step walk-forward protocol for tuning `Simulator` grid parameters over crowd trading ideas (TradingView scrape, June 2026, BTC −20.4%). The honesty is structural, enforced by the file split: **`src/index.mjs` trains and never loads the test tail; `src/test.mjs` tests and never trains.** Training sees only the head of the feed — the first 70% of its time range. The tail exists for exactly one out-of-sample shot with a hardcoded training artifact: pick the candidate by train metrics, freeze it, fire once. No re-picking after seeing the tail.

## Step 1 — Training (`npm start`)

`src/index.mjs` declares four simulator schemas — four grid-axis profiles, each an explicit `addSimulatorSchema` at the top of the file: `tune_default` (baseline axes), `tune_shorthold` (4h–48h holds), `tune_lockrich` (dense profit-lock sweep 0–3%), `tune_wide` (4h–72h holds compromise). Every config trains on the same `trainIdeas` — the head of the feed.

### Training output

The result is a flat list of rows, saved to [`assets/tv-ideas.train.json`](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/tune/assets/tv-ideas.train.json): **one row per (config × ranking criterion)** — four winners tagged with the same `config` name, since different criteria may elect different points — plus one `authorStats` row per config with the raw track record:

```json
[
  {
    "config": "tune_default",
    "by": "sharpe",
    "point": "H=7 TT=2 hold=72h track=2 rate=0.6 lock=2.5 metric=close",
    "train": { "trades": 10, "pnl": 13.51, "wr": 0.9, "dd": 4.35, "sharpe": 1.91, "sortino": 3.11 }
  },
  {
    "config": "tune_default",
    "by": "sortino",
    "point": "H=3 TT=4 hold=72h track=2 rate=0.5 lock=0 metric=close",
    "train": { "trades": 9, "pnl": 19.08, "wr": 0.78, "dd": 3.3, "sharpe": 1.57, "sortino": 4.09 }
  },
  {
    "config": "tune_default",
    "authorStats": [
      { "author": "MasterAnanda", "ideas": 16, "hits": 9 },
      { "author": "TradingShot", "ideas": 10, "hits": 6 },
      "..."
    ]
  },
  {
    "config": "tune_shorthold",
    "by": "sharpe | sortino | pnl | recovery",
    "point": "H=5 TT=3 hold=48h track=2 rate=0.6 lock=0 metric=close",
    "train": { "trades": 9, "pnl": 11.48, "wr": 0.78, "dd": 5.3, "sharpe": 1.19, "sortino": 2.17 }
  },
  {
    "config": "tune_lockrich",
    "by": "sharpe | sortino | pnl",
    "point": "H=5 TT=3 hold=72h track=2 rate=0.6 lock=3 metric=close",
    "train": { "trades": 10, "pnl": 16.08, "wr": 0.9, "dd": 5.3, "sharpe": 1.88, "sortino": 3.03 }
  },
  {
    "config": "tune_wide",
    "by": "sharpe | sortino",
    "point": "H=3 TT=4 hold=72h track=2 rate=0.5 lock=0 metric=close",
    "train": { "trades": 9, "pnl": 19.08, "wr": 0.78, "dd": 3.3, "sharpe": 1.57, "sortino": 4.09 }
  },
  "..."
]
```

What to read out of this:

- **Grading happens inside each point's own hold window.** A 12h point judges its authors by the 12h close, a 72h point by the 72h close — the author is graded on exactly the event the point trades, never on an engine constant nobody harvests (the grid's longest hold only sets the candle fetch depth). The window is part of the ban rule and of every `bans` dictionary.
- **One core re-emerges across grids.** H=3 TT=4 hold=72h rate=0.5 lock=0 wins sharpe AND sortino of `tune_wide` plus sortino of `tune_default` at track=2 (sharpe 1.57), and its track=3 twin takes the pnl and recovery rankings of both configs. A core elected by differently shaped grids is not an artifact of axis choice.
- **The big sharpes cannot re-emerge — and that disqualifies them.** `tune_default`'s sharpe winner (H=7 TT=2 lock=2.5, 1.91) and `tune_lockrich`'s (lock=3, 1.88) carry locks that simply do not exist in the other grids' axes: their cross-config test never ran, so a single-grid election is all they have. Convergence beats a lone number.
- **Hold = 72h dominates.** Every config whose axes reach 72h elects it; `tune_shorthold` stays uniformly worse — the ideas need days, not hours.
- **`authorStats` is the artifact to freeze.** Raw `author/ideas/hits` only — the whitelist is NOT part of the output on purpose: `Simulator.test` re-derives banned flags from these numbers under the rule of whatever point you freeze, and an author absent from the list is banned by default.

### Selected candidate

The sharpe winners of the four configs, side by side:

| Config | Point | Sharpe | Sortino | PnL | DD |
|---|---|---|---|---|---|
| tune_default | H=7 TT=2 72h track2 rate0.6, lock=2.5 | **1.91** | 3.11 | 13.51 | 4.35 |
| tune_lockrich | H=5 TT=3 72h track2 rate0.6, lock=3 | 1.88 | 3.03 | 16.08 | 5.30 |
| **tune_wide** | H=3 TT=4 72h track2 rate0.5, lock=0 | 1.57 | **4.09** | **19.08** | **3.30** |
| tune_shorthold | H=5 TT=3 48h track2 rate0.6, lock=0 | 1.19 | 2.17 | 11.48 | 5.30 |

The training elects the re-emergent core — `tune_wide`'s sharpe/sortino winner, re-elected by `tune_default`'s sortino, 9 trades (above the anti-fluke floor) at the shallowest drawdown and the biggest PnL of the table. The two nominally higher sharpes are lock-carrying singles whose lock values are absent from every other grid's axes — no re-emergence, no trust. Its parameters, frozen into `src/test.mjs`:

| Parameter | Value | Meaning |
|---|---|---|
| `hardStopPercent` | **3** | hard stop 3% from entry |
| `trailingTakePercent` | **4** | trailing take, 4% pullback from peak |
| `holdMinutes` | **4320** (72h) | maximum hold |
| `minAuthorTrack` | **2** | author needs ≥ 2 fully observed ideas |
| `minAuthorHitRate` | **0.5** | ...at hit rate ≥ 0.5 to be allowed |
| `profitLockPercent` | **0** | profit lock disabled |
| `authorMetric` | **"close"** | hit = the close of the point's own 72h hold window is in the idea's direction |

## Step 2 — Out-of-sample (`npm test`)

`src/test.mjs` hardcodes the chosen candidate — the frozen `POINT` and the raw `AUTHOR_STATS` from Step 1 — loads ONLY the tail of the feed (the 30% the training never saw) and calls `Simulator.test` once. No training happens on the tail: `onAuthorsTrained` never fires, unseen authors are banned as unproven. The full result is saved to [`assets/tv-ideas.test.json`](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/tune/assets/tv-ideas.test.json).

### Out-of-sample result

181 tail profiles (June 22–30, none truncated, graded inside the point's own 72h hold window), the frozen whitelist resolves to 8 authors under the close rule (ideas ≥ 2, hit rate ≥ 0.5), 146 logins banned — including every author the training never saw:

| Metric | Train (Jun 1–21) | Test (Jun 22–30) |
|---|---|---|
| Trades | 9 | 4 (7 qualified ideas absorbed by busy slot) |
| PnL | +19.08% | **+3.44%** |
| PnL per day | 0.91%/day | 0.38%/day |
| Win rate | 78% | 75% |
| Profit factor | — | **2.75** |
| Sharpe | 1.57 | **0.61** |
| Sortino | 4.09 | 1.75 |
| Max series drawdown | 3.30% | 1.96% |

The four test trades, in order — all SHORT, all from the frozen whitelist: trailing **+3.70%** (71h), trailing **+1.69%** (8h), expired +0.01% (72h), expired **−1.96%** (72h).

What to read out of this — honestly:

- **The candidate transfers, modestly.** +3.44% on nine unseen days at profit factor 2.75, win rate holding at train level (75% vs 78%) and the drawdown well inside train scale — but sharpe 0.61 is a fraction of the train's 1.57. A positive, believable carry-over; not yet proof of an edge.
- **One trade carried the window.** The +3.70% trailing exit after a 71-hour ride is most of the PnL; the two expiries netted out to roughly zero. With no lock and TT=4, winners must run far before anything is banked — that is the shape the train elected, and the tail confirmed both its upside and its patience cost.
- **The whitelist transfers structurally.** All four trades come from the frozen 8-author list; the tail's own crowd (146 banned logins) contributed nothing — default-ban semantics carry the edge across the split.
- **No re-picking.** The tail has been seen; selecting a different candidate now would be curve-fitting. The honest continuation is a fresh month of data for a new one-shot.
- **Read Calmar with care.** `calmarRatio` annualizes a ~2-week bucket window; `recoveryFactor` 1.75 (PnL over drawdown, no annualization) is the honest cousin.

Two honest caveats. Four trades is a thin sample — this demo certifies the *protocol* and a modest transfer, not a production edge. And the final arbiter for any point picked here is still a real engine backtest (`Backtest.run`) — the simulator makes the search cheap, it does not replace the engine.

## License

MIT © [tripolskypetr](https://github.com/tripolskypetr)

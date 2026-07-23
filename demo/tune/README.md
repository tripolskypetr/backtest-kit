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
    "point": "H=5 TT=3 hold=72h track=2 rate=0.5 lock=0 metric=retain",
    "train": { "trades": 9, "pnl": 15.61, "wr": 0.89, "dd": 5.29, "sharpe": 1.42, "sortino": 2.95 }
  },
  {
    "config": "tune_default",
    "by": "sortino | pnl | recovery",
    "point": "H=3 TT=4 hold=72h track=2 rate=0.5 lock=0 metric=retain",
    "train": { "trades": 8, "pnl": 17.4, "wr": 0.75, "dd": 5.63, "sharpe": 1.25, "sortino": 4.31 }
  },
  {
    "config": "tune_default",
    "authorStats": [
      { "author": "MasterAnanda", "ideas": 16, "hits": 7 },
      { "author": "TradingShot", "ideas": 10, "hits": 6 },
      "..."
    ]
  },
  {
    "config": "tune_shorthold",
    "by": "sharpe",
    "point": "H=3 TT=1.5 hold=48h track=2 rate=0.5 lock=2 metric=retain",
    "train": { "trades": 15, "pnl": 4.55, "wr": 0.53, "dd": 5.29, "sharpe": 0.72, "sortino": 1.15 }
  },
  {
    "config": "tune_shorthold",
    "by": "sortino | pnl | recovery",
    "point": "H=5 TT=3 hold=48h track=2 rate=0.6 lock=0 metric=retain",
    "train": { "trades": 10, "pnl": 7.01, "wr": 0.6, "dd": 5, "sharpe": 0.7, "sortino": 1.3 }
  },
  {
    "config": "tune_lockrich",
    "by": "sharpe | sortino | pnl | recovery",
    "point": "H=5 TT=3 hold=72h track=2 rate=0.5 lock=0 metric=retain",
    "train": { "trades": 9, "pnl": 15.61, "wr": 0.89, "dd": 5.29, "sharpe": 1.42, "sortino": 2.95 }
  },
  {
    "config": "tune_wide",
    "by": "sharpe",
    "point": "H=5 TT=3 hold=72h track=2 rate=0.5 lock=0 metric=retain",
    "train": { "trades": 9, "pnl": 15.61, "wr": 0.89, "dd": 5.29, "sharpe": 1.42, "sortino": 2.95 }
  },
  { "config": "tune_wide", "by": "sortino | pnl | recovery", "point": "H=3 TT=4 hold=72h ... lock=0 metric=retain", "train": "..." },
  "..."
]
```

What to read out of this:

- **One point sweeps almost everything.** H=5 TT=3 hold=72h track=2 lock=0 wins ALL FOUR rankings of `tune_lockrich` and the sharpe rankings of `tune_default` and `tune_wide` — the strongest cross-config re-emergence this feed has shown. A point elected by differently shaped grids is not an artifact of axis choice.
- **The retain pin routed itself back to close.** Every substantive winner takes `lock = 0`, and a retain rule without a lock has no level to grade fixation against — it structurally degenerates into close grading. The only genuinely median-graded winner (shorthold sharpe, lock=2) is weak (0.72). On this feed the sweep says: the signal is in horizon survival, not in level fixation.
- **Hold = 72h dominates.** Every config whose axes reach 72h elects it; `tune_shorthold` stays uniformly worse — the ideas need days, not hours.
- **The strict track lost its crown.** Unlike the lock-era run (track ≥ 5 everywhere), the H=5 TT=3 family prefers track=2 — with the lock retired, the wider whitelist's extra trades buy more than its extra noise costs. Rules are searched, not assumed.
- **`authorStats` is the artifact to freeze.** Raw `author/ideas/hits` only — the whitelist is NOT part of the output on purpose: `Simulator.test` re-derives banned flags from these numbers under the rule of whatever point you freeze, and an author absent from the list is banned by default.

### Selected candidate

The sharpe winners of the four configs, side by side:

| Config | Point | Sharpe | Sortino | PnL | DD |
|---|---|---|---|---|---|
| **tune_default** | H=5 TT=3 72h track2, lock=0 | **1.42** | 2.95 | 15.61 | **5.29** |
| tune_lockrich | the same point (4/4 convergence) | 1.42 | 2.95 | 15.61 | 5.29 |
| tune_wide | the same point | 1.42 | 2.95 | 15.61 | 5.29 |
| tune_shorthold | H=3 TT=1.5 48h track2, lock=2 | 0.72 | 1.15 | 4.55 | 5.29 |

The training elects the shared sharpe winner — the best sharpe everywhere it exists, a full 4/4 criteria convergence inside `tune_lockrich`, 9 trades (above the anti-fluke floor). The only bigger number anywhere is the raw-PnL one (17.4 at H=3 TT=4) — a slightly deeper drawdown for a clearly worse sharpe (1.25). Its parameters, frozen into `src/test.mjs`:

| Parameter | Value | Meaning |
|---|---|---|
| `hardStopPercent` | **5** | hard stop 5% from entry |
| `trailingTakePercent` | **3** | trailing take, 3% pullback from peak |
| `holdMinutes` | **4320** (72h) | maximum hold |
| `minAuthorTrack` | **2** | author needs ≥ 2 fully observed ideas |
| `minAuthorHitRate` | **0.5** | ...at hit rate ≥ 0.5 to be allowed |
| `profitLockPercent` | **0** | profit lock disabled |
| `authorMetric` | **"retain"** | with lock=0 structurally canonized into close grading |

## Step 2 — Out-of-sample (`npm test`)

`src/test.mjs` hardcodes the chosen candidate — the frozen `POINT` and the raw `AUTHOR_STATS` from Step 1 — loads ONLY the tail of the feed (the 30% the training never saw) and calls `Simulator.test` once. No training happens on the tail: `onAuthorsTrained` never fires, unseen authors are banned as unproven. The full result is saved to [`assets/tv-ideas.test.json`](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/tune/assets/tv-ideas.test.json).

### Out-of-sample result

181 tail profiles (June 22–30, none truncated), the frozen whitelist resolves to 10 authors, 144 logins banned — including every author the training never saw:

| Metric | Train (Jun 1–21) | Test (Jun 22–30) |
|---|---|---|
| Trades | 9 | 3 (16 qualified ideas absorbed by busy slot) |
| PnL | +15.61% | **+0.91%** |
| PnL per day | 0.74%/day | 0.10%/day |
| Win rate | 89% | 33% |
| Profit factor | — | 1.24 |
| Sharpe | 1.42 | **0.17** |
| Sortino | 2.95 | 0.34 |
| Max series drawdown | 5.29% | 3.72% |

The three test trades, in order: SHORT trailing **+4.63%** (62h), LONG expired −1.49% (72h), LONG expired −2.23% (72h).

What to read out of this — honestly:

- **The shot does NOT certify an edge.** +0.91% at profit factor 1.24 and sharpe 0.17 is noise, not a transfer: the candidate that converged across every config on the train head came back from the tail barely breakeven. This is exactly the verdict the walk-forward exists to deliver — before production, not after.
- **The slot did most of the damage.** With no lock and a 72h hold, the first trade sits for days and 16 qualified ideas die absorbed — three trades on a 9-day tail is not selectivity, it is capacity starvation. One good short (+4.63%) carried the window; two longs from the softened track=2 whitelist rode the full hold into the red.
- **The whitelist still transfers structurally.** All three trades come from the frozen 10-author list; the tail's own crowd (144 banned logins) contributed nothing — default-ban semantics work regardless of grading.
- **No re-picking.** The tail has been seen; selecting a different candidate now would be curve-fitting. The honest continuation is a fresh month of data for a new one-shot.
- **Read Calmar with care.** `calmarRatio` annualizes a ~2-week bucket window; `recoveryFactor` 0.24 (PnL over drawdown, no annualization) is the honest cousin.

Two honest caveats. Three trades is a thin sample — this demo certifies the *protocol*, not a production edge (and on this feed the protocol's current verdict is "not proven"). And the final arbiter for any point picked here is still a real engine backtest (`Backtest.run`) — the simulator makes the search cheap, it does not replace the engine.

## License

MIT © [tripolskypetr](https://github.com/tripolskypetr)

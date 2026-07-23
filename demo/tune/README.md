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
    "by": "sharpe | sortino | pnl | recovery",
    "point": "H=4 TT=4 hold=72h track=2 rate=0.6 lock=0 metric=retain",
    "train": { "trades": 8, "pnl": 17.01, "wr": 0.63, "dd": 4.79, "sharpe": 1.11, "sortino": 3.07 }
  },
  {
    "config": "tune_default",
    "authorStats": [
      { "author": "MasterAnanda", "ideas": 16, "hits": 8 },
      { "author": "TradingShot", "ideas": 10, "hits": 6 },
      "..."
    ]
  },
  {
    "config": "tune_shorthold",
    "by": "sharpe | sortino | pnl | recovery",
    "point": "H=3 TT=3 hold=48h track=2 rate=0.6 lock=0 metric=retain",
    "train": { "trades": 11, "pnl": 7.14, "wr": 0.55, "dd": 3.3, "sharpe": 0.83, "sortino": 2.08 }
  },
  {
    "config": "tune_lockrich",
    "by": "sharpe | sortino | pnl",
    "point": "H=3 TT=3 hold=72h track=2 rate=0.6 lock=3 metric=retain",
    "train": { "trades": 12, "pnl": 11.49, "wr": 0.75, "dd": 6.61, "sharpe": 1.41, "sortino": 2.44 }
  },
  {
    "config": "tune_wide",
    "by": "sharpe | sortino | pnl | recovery",
    "point": "H=5 TT=4 hold=72h track=2 rate=0.6 lock=0 metric=retain",
    "train": { "trades": 8, "pnl": 16.01, "wr": 0.63, "dd": 5.3, "sharpe": 1.02, "sortino": 2.52 }
  },
  "..."
]
```

What to read out of this:

- **The core re-emerges across grids.** hold=72h, track=2, rate=0.6, lock=0, TT=4 wins ALL FOUR rankings of both `tune_default` and `tune_wide` — the two configs disagree only on the stop (4 vs 5). A core elected by differently shaped grids is not an artifact of axis choice.
- **Retain is now genuinely median-graded.** The metric needs no lock by construction — a hit is an idea whose median 5-day move sits above the entry price. The winners at `lock = 0` are graded exactly by that fixation rule, not by any hidden fallback.
- **Hold = 72h dominates.** Every config whose axes reach 72h elects it; `tune_shorthold` stays uniformly worse — the ideas need days, not hours.
- **The strict rate won its crown back.** Under retain grading every single winner takes rate=0.6 over 0.5 — the fixation hit is a harder test than horizon close, and the survivors of the harder test are worth trusting at a stricter rate. Track stays at 2 everywhere. Rules are searched, not assumed.
- **`authorStats` is the artifact to freeze.** Raw `author/ideas/hits` only — the whitelist is NOT part of the output on purpose: `Simulator.test` re-derives banned flags from these numbers under the rule of whatever point you freeze, and an author absent from the list is banned by default.

### Selected candidate

The sharpe winners of the four configs, side by side:

| Config | Point | Sharpe | Sortino | PnL | DD |
|---|---|---|---|---|---|
| **tune_default** | H=4 TT=4 72h track2 rate0.6, lock=0 | 1.11 | 3.07 | **17.01** | **4.79** |
| tune_wide | H=5 TT=4 72h track2 rate0.6, lock=0 | 1.02 | 2.52 | 16.01 | 5.30 |
| tune_lockrich | H=3 TT=3 72h track2 rate0.6, lock=3 | **1.41** | 2.44 | 11.49 | 6.61 |
| tune_shorthold | H=3 TT=3 48h track2 rate0.6, lock=0 | 0.83 | 2.08 | 7.14 | 3.30 |

The training elects the `tune_default` winner — a full 4/4 criteria convergence inside its own config, the same core re-elected 4/4 by `tune_wide` with a slightly worse sharpe, 8 trades (at the anti-fluke floor). The nominally higher sharpe (`tune_lockrich`, 1.41 at lock=3) is a single-config outlier with the deepest drawdown of the table and no re-emergence anywhere else. Its parameters, frozen into `src/test.mjs`:

| Parameter | Value | Meaning |
|---|---|---|
| `hardStopPercent` | **4** | hard stop 4% from entry |
| `trailingTakePercent` | **4** | trailing take, 4% pullback from peak |
| `holdMinutes` | **4320** (72h) | maximum hold |
| `minAuthorTrack` | **2** | author needs ≥ 2 fully observed ideas |
| `minAuthorHitRate` | **0.6** | ...at hit rate ≥ 0.6 to be allowed |
| `profitLockPercent` | **0** | profit lock disabled |
| `authorMetric` | **"retain"** | hit = median 5-day move above the entry price |

## Step 2 — Out-of-sample (`npm test`)

`src/test.mjs` hardcodes the chosen candidate — the frozen `POINT` and the raw `AUTHOR_STATS` from Step 1 — loads ONLY the tail of the feed (the 30% the training never saw) and calls `Simulator.test` once. No training happens on the tail: `onAuthorsTrained` never fires, unseen authors are banned as unproven. The full result is saved to [`assets/tv-ideas.test.json`](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/tune/assets/tv-ideas.test.json).

### Out-of-sample result

181 tail profiles (June 22–30, none truncated), the frozen whitelist resolves to 6 authors under the retain rule (ideas ≥ 2, hit rate ≥ 0.6), 148 logins banned — including every author the training never saw:

| Metric | Train (Jun 1–21) | Test (Jun 22–30) |
|---|---|---|
| Trades | 8 | 4 (8 qualified ideas absorbed by busy slot) |
| PnL | +17.01% | **+0.64%** |
| PnL per day | 0.81%/day | 0.07%/day |
| Win rate | 63% | 75% |
| Profit factor | — | 1.33 |
| Sharpe | 1.11 | **0.20** |
| Sortino | 3.07 | 0.33 |
| Max series drawdown | 4.79% | 1.96% |

The four test trades, in order — all SHORT, all from the frozen whitelist: trailing **+0.90%** (42h), trailing **+1.69%** (8h), expired +0.01% (72h), expired **−1.96%** (72h).

What to read out of this — honestly:

- **The shot does NOT certify an edge.** +0.64% at profit factor 1.33 and sharpe 0.20 is noise, not a transfer: the candidate that converged across differently shaped grids on the train head came back from the tail barely breakeven. This is exactly the verdict the walk-forward exists to deliver — before production, not after.
- **The wins were small by construction.** Three of four trades closed green, but with no lock and TT=4 the trailing arms late — the two takes banked under 2% each while the one red trade rode the full 72h hold to −1.96%. High win rate, near-zero sum.
- **The whitelist transfers structurally.** All four trades come from the frozen 6-author retain list; the tail's own crowd (148 banned logins) contributed nothing — default-ban semantics work regardless of grading.
- **No re-picking.** The tail has been seen; selecting a different candidate now would be curve-fitting. The honest continuation is a fresh month of data for a new one-shot.
- **Read Calmar with care.** `calmarRatio` annualizes a ~2-week bucket window; `recoveryFactor` 0.33 (PnL over drawdown, no annualization) is the honest cousin.

Two honest caveats. Four trades is a thin sample — this demo certifies the *protocol*, not a production edge (and on this feed the protocol's current verdict is "not proven"). And the final arbiter for any point picked here is still a real engine backtest (`Backtest.run`) — the simulator makes the search cheap, it does not replace the engine.

## License

MIT © [tripolskypetr](https://github.com/tripolskypetr)

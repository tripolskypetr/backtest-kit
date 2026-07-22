---
title: other/tune/readme
group: other/tune
---

# Tune Demo

> Link to [the source code](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/tune)

A two-step walk-forward protocol for tuning `Simulator` grid parameters over crowd trading ideas (TradingView scrape, June 2026, BTC −20.4%). The honesty is structural, enforced by the file split: **`src/index.mjs` trains and never loads the test tail; `src/test.mjs` tests and never trains.** Training sees only the head of the feed — the first 70% of its time range. The tail exists for exactly one out-of-sample shot with a hardcoded training artifact: pick the candidate by train metrics, freeze it, fire once. No re-picking after seeing the tail.

## Step 1 — Training (`npm start`)

`src/index.mjs` declares four simulator schemas — four grid-axis profiles, each an explicit `addSimulatorSchema` at the top of the file: `tune_default` (baseline axes), `tune_shorthold` (4h–48h holds), `tune_lockrich` (dense profit-lock sweep 0–3%), `tune_wide` (4h–72h holds compromise). Every config trains on the same `trainIdeas` and prints a flat list of rows: **one row per (config × ranking criterion)** — four winners tagged with the same `config` name, since different criteria may elect different points — plus one `authorStats` row per config with the raw track record:

```json
[
  {
    "config": "tune_default",
    "by": "sharpe",
    "point": "H=5 TT=2 hold=72h N=1 track=5 rate=0.5 W=0 lock=2.5",
    "train": { "trades": 9, "pnl": 12.22, "wr": 0.89, "dd": 1.31, "sharpe": 2.44, "sortino": 9.34 }
  },
  { "config": "tune_default", "by": "sortino", "point": "H=5 TT=2 hold=72h ... lock=2.5", "train": "..." },
  {
    "config": "tune_default",
    "by": "pnl",
    "point": "H=3 TT=4 hold=72h N=1 track=2 rate=0.5 W=0 lock=0",
    "train": { "trades": 8, "pnl": 17.4, "wr": 0.75, "dd": 5.63, "sharpe": 1.25, "sortino": 4.31 }
  },
  { "config": "tune_default", "by": "recovery", "point": "H=5 TT=2 hold=72h ... lock=2.5", "train": "..." },
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
    "point": "H=3 TT=1.5 hold=48h N=1 track=5 rate=0.5 W=0.6 lock=2",
    "train": { "trades": 9, "pnl": 8.7, "wr": 0.78, "dd": 1.92, "sharpe": 1.83, "sortino": 3.76 }
  },
  { "config": "tune_shorthold", "by": "sortino | pnl | recovery", "point": "the same point", "train": "..." },
  {
    "config": "tune_lockrich",
    "by": "sharpe",
    "point": "H=5 TT=3 hold=72h N=1 track=3 rate=0.5 W=0.6 lock=2.5",
    "train": { "trades": 9, "pnl": 12.82, "wr": 0.89, "dd": 2.84, "sharpe": 2.15, "sortino": 4.52 }
  },
  { "config": "tune_lockrich", "by": "sortino | recovery", "point": "H=5 TT=3 hold=72h ... rate=0.6 W=0.6 lock=3", "train": "..." },
  {
    "config": "tune_wide",
    "by": "sharpe",
    "point": "H=5 TT=2 hold=72h N=1 track=5 rate=0.5 W=0 lock=2",
    "train": { "trades": 9, "pnl": 9.21, "wr": 0.89, "dd": 1.31, "sharpe": 2.31, "sortino": 7.05 }
  },
  { "config": "tune_wide", "by": "sortino | recovery", "point": "the same point", "train": "..." },
  "..."
]
```

What to read out of this:

- **Criteria convergence is the robustness signal.** Inside `tune_default`, three of four criteria (sharpe, sortino, recovery) land on ONE point — a point that wins one ranking may be a fluke of that metric, a point that wins three is a shape of the data. `tune_shorthold` converges 4/4, but on weaker numbers — convergence alone is not enough, read it together with the metrics.
- **The same point re-emerges across independent configs.** The sharpe winners of `tune_default` and `tune_wide` are the identical point up to the ceiling of the lock axis (2.5 vs 2 — wide simply had no 2.5 in its list). When differently shaped grids keep electing one family — H=5, TT=2, hold=72h, strict track ≥ 5 — that family is not an artifact of axis choice.
- **The profit lock is the watershed of the grid.** Every winner of every criterion except raw PnL takes `lock > 0`. The pnl criterion elects the same lock-free point in three configs out of four: +17.4% total, but dd 5.63 and sharpe 1.25. The lock gives up ~5 p.p. of PnL (17.4 → 12.22) and buys a 4× smaller drawdown (5.63 → 1.31) and a doubled sharpe (1.25 → 2.44). Sortino 9.34 on the winner means the train equity curve has almost no losing days.
- **Shortening the hold does not pay.** `tune_shorthold` is uniformly worse (sharpe 1.83, pnl 8.7) even with the weighted-consensus crutch W=0.6 — the 72h hold dominates every shorter window on this feed.
- **A strict ban beats a soft ban with a weight gate.** Wherever track ≥ 5 is available, it wins with W=0; W=0.6 appears only in configs whose ban axes stop at track 2–3 — the weighted consensus compensates for the softer rule, not improves on the strict one.
- **`authorStats` is the artifact to freeze.** Raw `author/ideas/hits` only — the whitelist is NOT part of the output on purpose: `Simulator.test` re-derives banned flags and consensus weights from these numbers under the rule of whatever point you freeze, and an author absent from the list is banned by default.

## Step 2 — Out-of-sample (`npm test`)

`src/test.mjs` hardcodes the chosen candidate — the frozen `POINT` and the raw `AUTHOR_STATS` from Step 1 — loads ONLY the tail of the feed (the 30% the training never saw) and calls `Simulator.test` once. No training happens on the tail: `onAuthorsTrained` never fires, unseen authors are banned as unproven.

*(to be filled with the argumentation of the applied config and the actual `npm test` run result)*

## License

MIT © [tripolskypetr](https://github.com/tripolskypetr)

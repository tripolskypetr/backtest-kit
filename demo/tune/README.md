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
    "point": "H=5 TT=2 hold=72h track=5 rate=0.5 lock=2.5 metric=close",
    "train": { "trades": 9, "pnl": 12.22, "wr": 0.89, "dd": 1.31, "sharpe": 2.44, "sortino": 9.34 }
  },
  { "config": "tune_default", "by": "sortino", "point": "H=5 TT=2 hold=72h ... lock=2.5 metric=close", "train": "..." },
  {
    "config": "tune_default",
    "by": "pnl",
    "point": "H=3 TT=4 hold=72h track=2 rate=0.5 lock=0 metric=close",
    "train": { "trades": 8, "pnl": 17.4, "wr": 0.75, "dd": 5.63, "sharpe": 1.25, "sortino": 4.31 }
  },
  { "config": "tune_default", "by": "recovery", "point": "H=5 TT=2 hold=72h ... lock=2.5 metric=close", "train": "..." },
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
    "by": "sharpe | sortino | recovery",
    "point": "H=2 TT=1 hold=4h track=2 rate=0.6 lock=2 metric=reach",
    "train": { "trades": 14, "pnl": 3.6, "wr": 0.64, "dd": 1.26, "sharpe": 1.09, "sortino": 1.99 }
  },
  {
    "config": "tune_shorthold",
    "by": "pnl",
    "point": "H=5 TT=3 hold=48h track=2 rate=0.6 lock=0 metric=close",
    "train": { "trades": 10, "pnl": 7.01, "wr": 0.6, "dd": 5, "sharpe": 0.7, "sortino": 1.3 }
  },
  {
    "config": "tune_lockrich",
    "by": "sharpe",
    "point": "H=3 TT=3 hold=72h track=2 rate=0.6 lock=2.5 metric=close",
    "train": { "trades": 12, "pnl": 13.46, "wr": 0.83, "dd": 6.61, "sharpe": 1.63, "sortino": 2.88 }
  },
  { "config": "tune_lockrich", "by": "sortino", "point": "H=5 TT=3 hold=72h track=2 rate=0.5 lock=3 metric=close", "train": "..." },
  {
    "config": "tune_lockrich",
    "by": "pnl | recovery",
    "point": "H=5 TT=3 hold=72h track=2 rate=0.5 lock=0 metric=close",
    "train": { "trades": 9, "pnl": 15.61, "wr": 0.89, "dd": 5.29, "sharpe": 1.42, "sortino": 2.95 }
  },
  {
    "config": "tune_wide",
    "by": "sharpe",
    "point": "H=5 TT=2 hold=72h track=5 rate=0.5 lock=2 metric=close",
    "train": { "trades": 9, "pnl": 9.21, "wr": 0.89, "dd": 1.31, "sharpe": 2.31, "sortino": 7.05 }
  },
  { "config": "tune_wide", "by": "sortino | recovery", "point": "the same point", "train": "..." },
  "..."
]
```

What to read out of this:

- **Criteria convergence is the robustness signal.** Inside `tune_default`, three of four criteria (sharpe, sortino, recovery) land on ONE point — a point that wins one ranking may be a fluke of that metric, a point that wins three is a shape of the data. `tune_shorthold` converges 3/4 too, but on much weaker numbers — convergence alone is not enough, read it together with the metrics.
- **The same point re-emerges across independent configs.** The sharpe winners of `tune_default` and `tune_wide` are the identical point up to the ceiling of the lock axis (2.5 vs 2 — wide simply had no 2.5 in its list). When differently shaped grids keep electing one family — H=5, TT=2, hold=72h, strict track ≥ 5 — that family is not an artifact of axis choice.
- **The profit lock is the watershed of the grid.** Every sharpe and sortino winner of every config takes `lock > 0`; lock-free points win only raw-PnL rankings (and the lockrich recovery). The pnl criterion elects the same lock-free point in default and wide: +17.4% total, but dd 5.63 and sharpe 1.25. The lock gives up ~5 p.p. of PnL (17.4 → 12.22) and buys a 4× smaller drawdown (5.63 → 1.31) and a doubled sharpe (1.25 → 2.44). Sortino 9.34 on the winner means the train equity curve has almost no losing days.
- **Shortening the hold does not pay.** `tune_shorthold` is uniformly worse: its best point is a 4h reach-lock curiosity (sharpe 1.09, pnl 3.6) — the 72h hold dominates every shorter window on this feed.
- **A strict ban beats a soft ban.** Wherever track ≥ 5 is available (default, wide), it wins every risk-adjusted ranking; configs whose ban axes stop at track 2–3 (shorthold, lockrich) produce uniformly weaker winners — softer evidence requirements let regime-lucky authors into the whitelist.
- **`authorStats` is the artifact to freeze.** Raw `author/ideas/hits` only — the whitelist is NOT part of the output on purpose: `Simulator.test` re-derives banned flags from these numbers under the rule of whatever point you freeze, and an author absent from the list is banned by default.

### Selected candidate

The sharpe winners of the four configs, side by side:

| Config | Point | Sharpe | Sortino | PnL | DD |
|---|---|---|---|---|---|
| **tune_default** | H=5 TT=2 72h track5 **lock=2.5** | **2.44** | **9.34** | **12.22** | **1.31** |
| tune_wide | same point, lock=2 | 2.31 | 7.05 | 9.21 | 1.31 |
| tune_lockrich | H=3 TT=3 72h track2 rate.6, lock=2.5 | 1.63 | 2.88 | 13.46 | 6.61 |
| tune_shorthold | H=2 TT=1 4h track2, lock=2 (reach) | 1.09 | 1.99 | 3.60 | 1.26 |

The training elects the `tune_default` sharpe winner — it dominates every risk-adjusted metric at once: the best sharpe, the best sortino, more PnL than the same family point at lock=2 (wide) at the identical 1.31 drawdown, a 3-of-4 criteria convergence (sharpe + sortino + recovery on this exact point), 9 trades (above the anti-fluke floor), and the strictest author rule available. The only bigger numbers anywhere are raw-PnL ones (13.46 lockrich, 15.61 its lock-free pnl winner, 17.4 the default lock-free pnl winner) — all pay with a 4–5× deeper drawdown and a much worse sharpe. Its parameters, frozen into `src/test.mjs`:

| Parameter | Value | Meaning |
|---|---|---|
| `hardStopPercent` | **5** | hard stop 5% from entry |
| `trailingTakePercent` | **2** | trailing take, 2% pullback from peak |
| `holdMinutes` | **4320** (72h) | maximum hold |
| `minAuthorTrack` | **5** | author needs ≥ 5 fully observed ideas |
| `minAuthorHitRate` | **0.5** | ...at hit rate ≥ 0.5 to be allowed |
| `profitLockPercent` | **2.5** | profit lock: floor armed at +2.5%, exit on pullback to it |
| `authorMetric` | **"close"** | author hits graded by the 5-day horizon close |

## Step 2 — Out-of-sample (`npm test`)

`src/test.mjs` hardcodes the chosen candidate — the frozen `POINT` and the raw `AUTHOR_STATS` from Step 1 — loads ONLY the tail of the feed (the 30% the training never saw) and calls `Simulator.test` once. No training happens on the tail: `onAuthorsTrained` never fires, unseen authors are banned as unproven. The full result is saved to [`assets/tv-ideas.test.json`](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/tune/assets/tv-ideas.test.json).

### Out-of-sample result

181 tail profiles (June 22–30, none truncated), the frozen whitelist resolves to the same 7 authors, 147 logins banned — including every author the training never saw:

| Metric | Train (Jun 1–21) | Test (Jun 22–30) |
|---|---|---|
| Trades | 9 | 7 (8 qualified ideas absorbed by busy slot) |
| PnL | +12.22% | **+6.98%** |
| PnL per day | 0.58%/day | **0.78%/day** |
| Win rate | 89% | 57% |
| Profit factor | — | 4.82 |
| Sharpe | 2.44 | **1.65** |
| Sortino | 9.34 | 4.46 |
| Max series drawdown | 1.31% | 1.56% |

The seven test trades, in order: LONG trailing −0.16% (11h), SHORT lock +2.20% (30h), SHORT lock +2.20% (4h), SHORT trailing −0.11% (9h), SHORT lock +2.20% (4h), SHORT expired −1.56% (72h), SHORT lock +2.20% (16h).

What to read out of this:

- **The edge survives the tail.** Sharpe retains 68% of its train value (2.44 → 1.65), the drawdown stays in the same 1.3–1.6% band, and PnL per calendar day is actually HIGHER out-of-sample (0.78 vs 0.58 %/day) — the total looks smaller only because the tail is 9 days against 21.
- **The profit lock is the scoring mechanism, not a decoration.** Four of seven exits are `profit_lock` at exactly +2.20% each (2.5% minus fees and slippage), most within hours — the crowd's ideas keep reaching +2.5% on the tail, they just don't keep it for 72 hours. On the train window the same pattern held 8 of 9 trades.
- **The trailing-take arm guarantee converts would-be losers into breakeven.** The two `trailing_take` exits close at −0.16% and −0.11% — the trailing floor arms only when its locked level is not worse than entry, so a reversal after a small run costs only the round-trip fees instead of a stop.
- **Exactly one real loss:** a SHORT that never reached +2.5%, rode the full 72h hold and expired at −1.56% — the hold cap, not the hard stop, is the actual worst-case boundary on this feed (zero `hard_stop` exits on either window).
- **The whitelist transfers.** All seven trades come from the frozen 7-author whitelist; the tail's own crowd (147 banned logins, everyone unproven on train) contributed nothing but absorbed-idea noise.
- **Read Calmar with care.** The report's `calmarRatio` of ~117 is an annualization artifact of a 9-day bucket window; `recoveryFactor` 4.48 (PnL over drawdown, no annualization) is the honest cousin.

Two honest caveats. Seven trades is a thin sample — this demo certifies the *protocol*, not a production edge. And the final arbiter for any point picked here is still a real engine backtest (`Backtest.run`) — the simulator makes the search cheap, it does not replace the engine.

## License

MIT © [tripolskypetr](https://github.com/tripolskypetr)

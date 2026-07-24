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
    "by": "sharpe | sortino | recovery",
    "point": "H=5 TT=2 hold=72h track=5 rate=0.5 lock=2.5 metric=close",
    "train": { "trades": 9, "pnl": 12.22, "wr": 0.89, "dd": 1.31, "sharpe": 2.44, "sortino": 9.34 }
  },
  {
    "config": "tune_default",
    "by": "pnl",
    "point": "H=3 TT=4 hold=72h track=2 rate=0.5 lock=0 metric=close",
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
    "by": "sharpe | sortino",
    "point": "H=3 TT=2 hold=24h track=5 rate=0.6 lock=2 metric=close",
    "train": { "trades": 18, "pnl": 5.85, "wr": 0.61, "dd": 5.98, "sharpe": 0.95, "sortino": 1.73 }
  },
  {
    "config": "tune_lockrich",
    "by": "sharpe",
    "point": "H=3 TT=3 hold=72h track=2 rate=0.6 lock=2.5 metric=close",
    "train": { "trades": 12, "pnl": 13.46, "wr": 0.83, "dd": 6.61, "sharpe": 1.63, "sortino": 2.88 }
  },
  {
    "config": "tune_wide",
    "by": "sharpe | sortino | recovery",
    "point": "H=5 TT=2 hold=72h track=5 rate=0.5 lock=2 metric=close",
    "train": { "trades": 9, "pnl": 9.21, "wr": 0.89, "dd": 1.31, "sharpe": 2.31, "sortino": 7.05 }
  },
  "..."
]
```

What to read out of this:

- **The core re-emerges across grids.** H=5 TT=2 hold=72h track=5 rate=0.5 plus a profit lock wins sharpe, sortino AND recovery in both `tune_default` and `tune_wide` — the two configs disagree only on the lock depth (2.5 vs 2), and only because `tune_wide`'s lock axis stops at 2. A core elected by differently shaped grids is not an artifact of axis choice.
- **The lock is the signature of the close era.** Every sharpe winner carries a non-zero `profitLockPercent`: close grading proves an author by horizon survival, and the lock then banks the crowd step without waiting out the full hold. The lock-free points win only the raw-PnL ranking — more money on paper, three times the drawdown.
- **Hold = 72h dominates.** Every config whose axes reach 72h elects it; `tune_shorthold` stays uniformly worse — the ideas need days, not hours.
- **The strictest track wears the crown.** track=5 with rate=0.5 beats every softer rule on sharpe wherever the axis offers it: five fully observed ideas is what separates a track record from a coin streak. Rules are searched, not assumed.
- **`authorStats` is the artifact to freeze.** Raw `author/ideas/hits` only — the whitelist is NOT part of the output on purpose: `Simulator.test` re-derives banned flags from these numbers under the rule of whatever point you freeze, and an author absent from the list is banned by default.

### Selected candidate

The sharpe winners of the four configs, side by side:

| Config | Point | Sharpe | Sortino | PnL | DD |
|---|---|---|---|---|---|
| **tune_default** | H=5 TT=2 72h track5 rate0.5, lock=2.5 | **2.44** | **9.34** | 12.22 | **1.31** |
| tune_wide | H=5 TT=2 72h track5 rate0.5, lock=2 | 2.31 | 7.05 | 9.21 | 1.31 |
| tune_lockrich | H=3 TT=3 72h track2 rate0.6, lock=2.5 | 1.63 | 2.88 | 13.46 | 6.61 |
| tune_shorthold | H=3 TT=2 24h track5 rate0.6, lock=2 | 0.95 | 1.73 | 5.85 | 5.98 |

The training elects the `tune_default` winner — the best sharpe of every config, a sharpe/sortino/recovery convergence inside its own config, the same core re-elected by the same three criteria in `tune_wide`, 9 trades (above the anti-fluke floor) at the shallowest drawdown of the table. The only bigger PnL numbers (17.4 lock-free, 13.46 at track=2) buy their extra points with 4–5× the drawdown for a clearly worse sharpe. Its parameters, frozen into `src/test.mjs`:

| Parameter | Value | Meaning |
|---|---|---|
| `hardStopPercent` | **5** | hard stop 5% from entry |
| `trailingTakePercent` | **2** | trailing take, 2% pullback from peak |
| `holdMinutes` | **4320** (72h) | maximum hold |
| `minAuthorTrack` | **5** | author needs ≥ 5 fully observed ideas |
| `minAuthorHitRate` | **0.5** | ...at hit rate ≥ 0.5 to be allowed |
| `profitLockPercent` | **2.5** | fixed floor arms at +2.5%, exits on the pullback |
| `authorMetric` | **"close"** | hit = the 5-day horizon closes in the idea's direction |

## Step 2 — Out-of-sample (`npm test`)

`src/test.mjs` hardcodes the chosen candidate — the frozen `POINT` and the raw `AUTHOR_STATS` from Step 1 — loads ONLY the tail of the feed (the 30% the training never saw) and calls `Simulator.test` once. No training happens on the tail: `onAuthorsTrained` never fires, unseen authors are banned as unproven. The full result is saved to [`assets/tv-ideas.test.json`](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/tune/assets/tv-ideas.test.json).

### Out-of-sample result

181 tail profiles (June 22–30, none truncated), the frozen whitelist resolves to 7 authors under the close rule (ideas ≥ 5, hit rate ≥ 0.5), 147 logins banned — including every author the training never saw:

| Metric | Train (Jun 1–21) | Test (Jun 22–30) |
|---|---|---|
| Trades | 9 | 7 (8 qualified ideas absorbed by busy slot) |
| PnL | +12.22% | **+6.98%** |
| PnL per day | 0.58%/day | 0.78%/day |
| Win rate | 89% | 57% |
| Profit factor | — | **4.82** |
| Sharpe | 2.44 | **1.65** |
| Sortino | 9.34 | 4.46 |
| Max series drawdown | 1.31% | 1.56% |

The seven test trades, in order: LONG trailing −0.16% (11h), then six SHORTs — lock **+2.20%** (30h), lock **+2.20%** (4h), trailing −0.11% (9h), lock **+2.20%** (4h), expired −1.56% (72h), lock **+2.20%** (16h).

What to read out of this — honestly:

- **The candidate transfers.** +6.98% on nine unseen days at sharpe 1.65 and profit factor 4.82, with the drawdown staying at train scale (1.56% vs 1.31%) — the strict-track close rule plus the 2.5% lock came back from the tail behaving like it did on the head. This is the strongest one-shot this feed has produced.
- **The lock did exactly its job.** Four of seven exits are `profit_lock` at +2.20% each — the crowd step gets banked in hours, not held for days; the three red trades are capped small (worst −1.56%, a full-hold expiry). Small fixed wins, smaller fixed losses — that shape IS the sharpe.
- **The whitelist transfers structurally.** All seven trades come from the frozen 7-author list (track ≥ 5); the tail's own crowd (147 banned logins) contributed nothing — default-ban semantics carry the edge across the split.
- **No re-picking.** The tail has been seen; selecting a different candidate now would be curve-fitting. The honest continuation is a fresh month of data for a new one-shot.
- **Read Calmar with care.** `calmarRatio` annualizes a ~2-week bucket window; `recoveryFactor` 4.48 (PnL over drawdown, no annualization) is the honest cousin.

Two honest caveats. Seven trades is still a thin sample — this demo certifies the *protocol* and one successful transfer, not a production edge. And the final arbiter for any point picked here is still a real engine backtest (`Backtest.run`) — the simulator makes the search cheap, it does not replace the engine.

## License

MIT © [tripolskypetr](https://github.com/tripolskypetr)

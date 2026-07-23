---
title: other/simulator/readme
group: other/simulator
---

# Simulator Demo

> Link to [the source code](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/simulator)

A **feasibility probe** for a signal feed, driven by the `Simulator` entity. The dataset is a scrape of TradingView ideas (author, direction, publish time) for June 2026 — a month where BTC fell **−20.4%** while the crowd kept posting longs. The question this demo answers is deliberately more basic than "which parameters are best" — that search belongs to [`demo/tune`](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/tune): **is there anything to compute at all?** Technically the probe is a run of the trained model over its own training dataset with deliberately primitive mechanics — it must find that a profitable corridor EXISTS, not try to earn from it. Does this news flow contain any signal worth searching for, and how many ideas and authors survive the windows — the anti-flood dedupe and the author ban rules — that any honest pipeline must apply first?

Be clear about what the search for the best grid point means here: **the probe's output is not a sum of money — it is a boolean.** The winners' PnL below is not a forecast of earnings; the sweep hunts for the ideal point only as *evidence*, and the whole run collapses into one bit: `true` — the dataset carries an edge and further processing makes sense, or `false` — there is nothing here and every next step is a waste.

That is why there is **no out-of-sample test run here, by design.** The probe evaluates the feed on its own full history (train-on-train, stated openly): a feed that yields no profitable grid region and no allowed authors under these most favorable conditions is disqualified immediately — there is nothing to validate. A feed that passes graduates to [`demo/tune`](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/tune), where the surviving signal is trained honestly: walk-forward split, frozen artifact, one shot on the tail.

Not every feed will pass, and that is the point. The edge found here is a property of THIS kind of feed: it rides **crowd liquidity** (a public idea with an audience moves its own market — people see the post, buy, and push the price a step by themselves) and it feeds the ban filter with a **large author population** to select from. Swap the input for an arbitrary RSS stream or a single-author Telegram channel and the same machinery may honestly find nothing: a feed nobody trades on has no crowd step to harvest, and a single unproven author offers nothing to whitelist — in principle, ALL of his signals can be wrong.

## Purpose

This project exists for the concrete checks below.

### 1. Is there a profitable corridor at all?

One `Simulator.run` over the whole feed: each idea gets ONE asynchronous candle pass from the minute after its publication (5-day horizon, wick-honest execution — exits by high/low, never close-to-close, stop wins inside an ambiguous candle, fees and slippage on both legs), and the outcome of **any** grid point is derived from the profiles arithmetically. The grid is deliberately small — **48 points of hard stop × hold × ban rule** — because the profit-harvesting machinery is switched off: a position is entered on a proven author's idea and exits by time or catastrophe stop, nothing else. If no point of even this primitive corridor is profitable on its own training range, the feed carries no extractable signal — full stop.

### 2. How much does the window cut?

Before any trading logic runs, the feed passes the honesty filters: NEUTRAL ideas dropped, flood deduplicated (at most one idea per author per direction per 8 hours — reposting a call must not inflate a track record or retrigger entries). The probe reports the cut explicitly: **421 BTCUSDT ideas → 300 directional survivors**. A feed that mostly evaporates here is a feed of reposts, not signals.

### 3. Does anyone survive the ban?

Ban is the **default**: an author is allowed only when his correctness is unambiguously proven — enough ideas with a fully observed outcome at a sufficient hit rate. The probe answers how many authors clear the bar: **7 of 154** under the winning rule (track ≥ 5, hit rate ≥ 0.5 — 147 banned, the long-posting crowd included). An empty whitelist is a disqualifying verdict no parameter sweep can fix.

### 4. The mechanics are deliberately primitive

The probe must not try to EARN — that is `demo/tune`'s territory. Every profit-harvesting mechanism is pinned off: `profitLockPercent: [0]`, the trailing take is inert (`[100]` never arms); any idea of a proven author triggers an entry — the engine grades authors strictly in isolation, no interaction metrics exist. What remains swept is only what the feasibility question needs: the catastrophe stop (2–7%), the hold (24–72h) and the ban rule (track 3/5 × rate 0.5/0.6). A probe that tunes the harvest on its own training range would overfit the very question it is asking.

### 5. The probe answers a boolean, tune finds the edge

The result still carries ranking winners (time-based Sharpe/Sortino over daily equity increments — frozen capital is not free — plus total PnL and recovery factor) with full trade lists, hold-time tail percentiles and per-trade `absorbedIdeaIds` — but they are **evidence for the verdict, not candidates**. The parameter search (the lock, the trailing, the rule arithmetic) belongs to `demo/tune` with its walk-forward split, and the final arbiter for anything picked there is always a real engine backtest (`Backtest.run`).

## Actual Results (June 2026, BTCUSDT, full feed)

The committed artifact is [`assets/simulator.done.json`](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/simulator/assets/simulator.done.json). The feed is strictly crypto-venue: ideas are classified by the `fullName` exchange prefix (Binance, Coinbase, Bitstamp, Bybit, OKX, …) — forex/CFD, metals, stocks and indices never enter the file, so no fabricated pairs.

| Stage | Numbers |
|---|---|
| Ideas in feed (BTCUSDT) | 421 total → 300 after NEUTRAL + flood dedupe |
| Profiles built | 300, none truncated |
| Author filter | **7 allowed / 147 banned** (winning rule: track ≥ 5, hit rate ≥ 0.5) |
| Grid | 48 points (stop 4 × hold 3 × track 2 × rate 2), harvesting machinery off |
| Profitable corridor | **24 of 48 points**; by hold: 3/16 @ 24h → 7/16 @ 48h → **14/16 @ 72h** |

The four ranking winners:

| Criterion | Point | Trades | PnL | Win rate | DD | Sharpe | Sortino |
|---|---|---|---|---|---|---|---|
| Sharpe | H=5 72h track≥5 rate≥0.5 | 10 | **+19.77%** | 70% | 5.29% | **1.36** | 3.29 |
| PnL | the same point | 10 | +19.77% | 70% | 5.29% | 1.36 | 3.29 |
| Sortino | H=5 72h track≥5 rate≥0.6 | 9 | +18.01% | 78% | 3.89% | 1.23 | **4.02** |
| Recovery | H=3 72h track≥5 rate≥0.6 | 9 | +17.52% | 78% | **3.30%** | 1.19 | 3.76 |

The verdict for this feed: **`true` — there is an edge to search.** Not because +19.8% is money anyone will earn (train-on-train, a ceiling by construction), but because the evidence stacks with the harvesting machinery OFF: half the primitive grid is profitable, and the corridor widens monotonically with the hold — 14 of 16 points at 72h. The signal is the direction of the ideas, not exit engineering: 9 of the sharpe winner's 10 exits are the plain hold cap (`time_expired`), one is the stop. All four criteria converge on hold = 72h and the strictest track ≥ 5, and 7 authors survive that scrutiny — a population worth whitelisting: TradingShot 9/15, MarketStrategysignals 5/8, PremiumTrader57 5/8, XAUxBTC_Pro 4/6, Cryptollica 3/6, InvestingScope 3/6, melikatrader94 3/5.

## Project Structure

```
demo/simulator/
├── assets/
│   ├── tv-ideas.normalized.jsonl   # crypto-venue ideas only, symbols normalized to *USDT
│   └── simulator.done.json         # probe artifact: full-feed run, 48-point primitive grid
├── src/
│   └── index.mjs                   # Exchange + simulator schema + Simulator.run
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
# feasibility probe over the whole feed
npm start

# the published CLI on the same feed (stdout report + ./dump JSON)
npm run cli
```

The script registers a CCXT Binance spot exchange (`ccxt_exchange`), a simulator schema (`tv_simulator`) with explicit grid axes, loads the ideas feed and runs the probe for BTCUSDT:

```javascript
addSimulatorSchema({
  simulatorName: "tv_simulator",
  exchangeName: "ccxt_exchange",
  gridAxes: {
    // грубая шкала катастрофы: коридор должен быть широким, не точкой
    hardStopPercent: [2, 3, 5, 7],
    // инертен: проба не собирает прибыль, выход — по времени или стопу
    trailingTakePercent: [100],
    holdMinutes: [24 * 60, 2 * 24 * 60, 3 * 24 * 60],
    // правило бана — единственная перебираемая "умность" пробы
    minAuthorTrack: [3, 5],
    minAuthorHitRate: [0.5, 0.6],
    profitLockPercent: [0],
    // retain при lock=0 структурно канонизируется в close-грейдинг —
    // вердикт пробы не зависит от этого пина по построению
    authorMetric: ["retain"],
    banCriteria: ["sharpe", "pnl"],
  },
  reportOrder: "sharpe",
});
```

Candles are fetched lazily in chunks through the exchange schema (persist cache first, network after) — only the horizons of actual ideas are requested, gaps between sparse ideas are never downloaded. The full result is written to `./dump/simulator.done.json`.

## Reading the Result

The probe's answer is a single boolean, assembled from three checks in order of importance — none of them is a money figure:

1. **The whitelist size** (`allowedAuthors`). Zero → **`false`** immediately, regardless of anything else — nobody survives proof, nothing to follow. `authorStats` behind it carries the raw evidence (ideas with known outcome, hits, hit rate).
2. **The window cut** (`ideasTotal` → `ideasDirectional`). A feed that mostly evaporates into reposts and NEUTRAL noise → **`false`**: not enough workable signals to ever clear the anti-fluke floors.
3. **The profitable corridor** (`reports` — every point of the primitive grid, sorted by Sharpe: count the positive-PnL share and how it distributes over the hold axis; `best` — ranking winners with full trade lists as the corridor's evidence; `p95/p99HoldMinutes` — eternal holds pinned at the cap are visible instantly). Train-on-train by construction — an upper bound, never a promise of earnings. Its only legitimate reading: if even this primitive, harvest-free ceiling is unprofitable → **`false`**, stop here.

All three pass → **`true`**: the feed graduates to [`demo/tune`](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/tune) — walk-forward training on the head of the feed and one frozen out-of-sample shot on the tail. A `false` is an answer too, and a much cheaper one than a month of forward testing on a dead feed.

## License

MIT © [tripolskypetr](https://github.com/tripolskypetr)

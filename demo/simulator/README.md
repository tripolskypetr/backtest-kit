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

One `Simulator.run` over the whole feed: each idea gets ONE asynchronous candle pass from the minute after its publication (the horizon is the grid's longest hold — 72h here, no hidden engine constant; wick-honest execution — exits by high/low, never close-to-close, stop wins inside an ambiguous candle, fees and slippage on both legs), and the outcome of **any** grid point is derived from the profiles arithmetically. The grid is deliberately small — **48 points of hard stop × hold × ban rule** — because the profit-harvesting machinery is switched off: a position is entered on a proven author's idea and exits by time or catastrophe stop, nothing else. If no point of even this primitive corridor is profitable on its own training range, the feed carries no extractable signal — full stop.

### 2. How much does the window cut?

Before any trading logic runs, the feed passes the honesty filters: NEUTRAL ideas dropped, flood deduplicated (at most one idea per author per direction per 8 hours — reposting a call must not inflate a track record or retrigger entries). The probe reports the cut explicitly: **421 BTCUSDT ideas → 300 directional survivors**. A feed that mostly evaporates here is a feed of reposts, not signals.

### 3. Does anyone survive the ban?

Ban is the **default**: an author is allowed only when his correctness is unambiguously proven — enough ideas with a fully observed outcome at a sufficient hit rate. Correctness here is graded by `close` inside each point's OWN hold window — a 24h point judges its authors by the 24h close, a 72h point by the 72h close: the author is graded on exactly the event the point trades (the probe runs lock-free, and the level-graded metrics `reach`/`retain` require a lock by construction). The probe answers how many authors clear the bar: **8 of 154** under the winning rule (48h window, track ≥ 5, hit rate ≥ 0.5 — 146 banned, the long-posting crowd included). An empty whitelist is a disqualifying verdict no parameter sweep can fix.

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
| Author filter | **8 allowed / 146 banned** (winning rule: 48h window, track ≥ 5, hit rate ≥ 0.5) — 12 ban dictionaries total, one per window × rule |
| Grid | 48 points (stop 4 × hold 3 × track 2 × rate 2), harvesting machinery off |
| Profitable corridor | **41 of 48 points**; by hold: 14/16 @ 24h → **15/16 @ 48h** → 12/16 @ 72h |

The four ranking winners (the `close` bucket — the probe's single swept metric):

| Criterion | Point | Trades | PnL | Win rate | DD | Sharpe | Sortino |
|---|---|---|---|---|---|---|---|
| Sharpe | H=3 48h track≥5 rate≥0.5 | 14 | +19.32% | 71% | 5.52% | **1.69** | 4.85 |
| Sortino | H=3 72h track≥3 rate≥0.6 | 10 | **+23.30%** | **80%** | **3.30%** | 1.50 | **4.99** |
| PnL | the same 72h point | 10 | +23.30% | 80% | 3.30% | 1.50 | 4.99 |
| Recovery | the same 72h point | 10 | +23.30% | 80% | 3.30% | 1.50 | 4.99 |

The verdict for this feed: **`true` — there is an edge to search.** Not because +23.3% is money anyone will earn (train-on-train, a ceiling by construction), but because the evidence stacks with the harvesting machinery OFF: 41 of 48 points are profitable, and the corridor covers EVERY hold once authors are judged by the window their point actually trades — 14/16 at 24h, 15/16 at 48h, 12/16 at 72h (under the old shared-horizon grading the short holds looked dead only because their authors were graded on a 72h event). The signal is the direction of the ideas, not exit engineering: 12 of the sharpe winner's 14 exits are the plain hold cap (`time_expired`), two are the stop. The rankings split between two honest shapes — faster turnover on the strictest track (48h, track ≥ 5: sharpe 1.69 on 14 trades) and a calmer 72h point (track ≥ 3, rate ≥ 0.6: +23.3% at dd 3.3) — and 8 authors survive the winner's scrutiny: TradingShot 10/15, XAUxBTC_Pro 5/6, CryptoSkullSignal 4/8, Cryptollica 3/6, InvestingScope 3/6, melikatrader94 3/5, CandleKing09 3/5, Vili_Wealth_Plan 3/5.

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
    // close: закрытие 5-дневного горизонта в сторону идеи — у пробы
    // замок выключен (lock=0), уровневым метрикам грейдить нечем
    authorMetric: ["close"],
  },
  reportOrder: "sharpe",
});
```

Candles are fetched lazily in chunks through the exchange schema (persist cache first, network after) — only the horizons of actual ideas are requested, gaps between sparse ideas are never downloaded. The full result is written to `./dump/simulator.done.json`.

## Reading the Result

The probe's answer is a single boolean, assembled from three checks in order of importance — none of them is a money figure:

1. **The whitelist size** (`allowedAuthors`). Zero → **`false`** immediately, regardless of anything else — nobody survives proof, nothing to follow. `authorStats` behind it carries the raw evidence (ideas with known outcome, hits, hit rate).
2. **The window cut** (`ideasTotal` → `ideasDirectional`). A feed that mostly evaporates into reposts and NEUTRAL noise → **`false`**: not enough workable signals to ever clear the anti-fluke floors.
3. **The profitable corridor** (`reports` — a dictionary keyed by the point's author metric, every bucket sorted by Sharpe; the probe's single-metric grid lands entirely in one bucket: count the positive-PnL share and how it distributes over the hold axis; `best` — ranking winners with full trade lists as the corridor's evidence; `p95/p99HoldMinutes` — eternal holds pinned at the cap are visible instantly). Train-on-train by construction — an upper bound, never a promise of earnings. Its only legitimate reading: if even this primitive, harvest-free ceiling is unprofitable → **`false`**, stop here.

All three pass → **`true`**: the feed graduates to [`demo/tune`](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/tune) — walk-forward training on the head of the feed and one frozen out-of-sample shot on the tail. A `false` is an answer too, and a much cheaper one than a month of forward testing on a dead feed.

## License

MIT © [tripolskypetr](https://github.com/tripolskypetr)

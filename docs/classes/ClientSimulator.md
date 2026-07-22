---
title: docs/class/ClientSimulator
group: docs
---

# ClientSimulator

Implements `ISimulator`

Parameter sweep engine over crowd trading ideas (the "Simulator").

Finds production strategy parameters (hard stop, trailing take,
hold duration, entry consensus threshold) by simulating every idea
against every point of the grid — WITHOUT re-running a backtest per
point. The root iteration is over IDEAS, not candles and not grid
points:

1. Each idea gets ONE asynchronous forward candle pass from the
   minute after its publication, capped by a static horizon
   (IDEA_TRIM_DAYS). The pass produces a per-candle trajectory
   profile (MFE/MAE extremes, whale shakeout depth, aligned-authors
   count). Overlapping and sparse ideas are both supported: candle
   chunks are fetched lazily through the Exchange (persist cache
   first), gaps between ideas are never requested.
2. The author ban list is TRAINED on the whole range (lookahead
   inside train is deliberate): authors with enough ideas and a hit
   rate worse than a coin are excluded from triggers and votes.
   The list is part of the result — apply it in production as-is.
3. The outcome of every grid point is derived arithmetically from
   the profiles with production slot semantics (one position per
   symbol, busy-slot ideas skipped). Honesty contracts: entry at
   next-minute open, exits by candle wicks (never close-to-close),
   stop wins inside an ambiguous candle, trailing arms only from
   previous-candle peaks, fees and slippage from GLOBAL_CONFIG on
   both legs.
4. Grid winners are picked by four rankings (Sharpe, Sortino, PnL,
   total PnL) with an anti-fluke minimum-trades guard.

Every stage emits an ISimulatorCallbacks hook; the client itself
is stateless between runs — each run() call is independent.

Validation of the chosen parameters MUST be done by a real engine
backtest (Backtest.run): the simulator picks candidates, it does
not replace the engine.

## Constructor

```ts
constructor(params: ISimulatorParams);
```

## Properties

### params

```ts
params: ISimulatorParams
```

### run

```ts
run: (symbol: string, ideas: ISimulatorIdea[]) => Promise<ISimulatorResult>
```

Runs the full simulation pipeline for a symbol.

Steps and emitted callbacks:
1. Filters the input array by symbol, sorts by publication time,
   drops NEUTRAL ideas and flood duplicates (at most one idea
   per author per direction per AUTHOR_DEDUPE_MINUTES)
   -&gt; onIdeas(symbol, total, directional).
2. Builds one trajectory profile per idea (lazy candle fetch
   through the Exchange schema; ideas with no candle data are
   dropped) -&gt; onProfiles(symbol, profiles, truncatedCount).
3. Trains the author ban list on the whole range
   -&gt; onAuthorsTrained(symbol, stats, bannedIdeas).
4. Evaluates the cartesian grid of params.gridAxes over the
   profiles, checking trade invariants on every point
   -> onGridPoint(symbol, report, trades) per point.
5. Ranks all points by Sharpe, Sortino and total PnL
   -> onRanking(symbol, criterion, sorted, best) per criterion.
6. Assembles the final result -> onDone(symbol, result).

The ideas array may contain multiple symbols — foreign ones are
filtered out before any computation, so one shared feed can be
passed for every symbol.

### test

```ts
test: (symbol: string, ideas: ISimulatorIdea[], point: ISimulatorGridPoint, authorStats: ISimulatorAuthorStat[]) => Promise<ISimulatorTestResult>
```

Out-of-sample test: evaluates ONE frozen grid point over fresh
ideas with a FROZEN author track record from a train run.

Steps and emitted callbacks:
1. Filters the input array by symbol, sorts by publication time,
   drops NEUTRAL ideas and flood duplicates (same preprocessing
   as run()) -&gt; onIdeas(symbol, total, directional).
2. Builds one trajectory profile per test idea
   -&gt; onProfiles(symbol, profiles, truncatedCount).
3. FREEZES the author filter: the point's ban rule is applied to
   the given train stats verbatim; authors unseen in the stats
   are banned by default. onAuthorsTrained never fires — nothing
   is trained on the test data.
4. Evaluates the single point with production slot semantics and
   the same metric math as run()
   -&gt; onGridPoint(symbol, report, trades).
5. Assembles the result -> onTestDone(symbol, result).

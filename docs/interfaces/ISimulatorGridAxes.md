---
title: docs/interface/ISimulatorGridAxes
group: docs
---

# ISimulatorGridAxes

Value lists per grid axis. The grid is the cartesian product of
all axes EXCEPT banCriteria (run-level aggregation config, never
swept); windows and author-ban thresholds are swept the same way
as stop and trailing — rules are searched, not hardcoded.

Every field below states what it TUNES and under which conditions
it is IGNORED — no axis is allowed to be a silent no-op without
that being documented here.

## Properties

### hardStopPercent

```ts
hardStopPercent: number[]
```

Hard stop levels to sweep, percent from entry.
Tunes: the catastrophe exit — how deep a position may sink
before a forced loss; the stop WINS when the stop and any profit
floor are reachable inside one candle (pessimism contract). Also
the shakeout bound of the "reach" author metric.
Ignored: never for trading — every trade checks it. For BAN
TRAINING it is ignored under authorMetric "close": only the
"reach" rule grades authors against it (see SimulatorAuthorRule).

### trailingTakePercent

```ts
trailingTakePercent: number[]
```

Trailing take pullback levels to sweep, percent from the peak.
Tunes: how much of a runner's peak is given back. Arms only from
PREVIOUS-candle peaks and only when the locked level is not
worse than entry (peak &gt;= entry/(1 - r)).
Ignored: inert for any trade whose peak never reaches the arm
level — such trades exit by stop, lock, or the hold cap. Never
affects ban training under any metric.

### holdMinutes

```ts
holdMinutes: number[]
```

Maximum position hold durations to sweep, minutes.
Tunes: slot turnover — one position per symbol, and a busy slot
ABSORBS qualified ideas (per-trade absorbedIdeaIds), so longer
holds trade less often; the cap is the worst-case exit
(time_expired) when neither stop nor floor fires.
Ignored: never for trading. Ban training does NOT use it — an
author's hit is graded on the idea's full 5-day profile horizon,
not on the point's hold.

### minIdeasAligned

```ts
minIdeasAligned: number[]
```

Entry thresholds to sweep: minimum unique UNBANNED aligned
authors within the 4h lookback window (the idea's own author
counts, banned authors are invisible to the count).
Tunes: binary crowd consensus required to enter; 1 = one proven
author is enough.
Ignored: never — the gate runs for every candidate entry.

### minAuthorTrack

```ts
minAuthorTrack: number[]
```

Author ban rule to sweep: minimum ideas with a FULLY OBSERVED
outcome an author needs before he can be allowed (fewer -&gt;
banned by default; truncated profiles prove nothing).
Tunes: how much evidence "proven" requires.
Ignored: never — the rule trains under both author metrics;
WHAT counts as a hit is decided by authorMetric.

### minAuthorHitRate

```ts
minAuthorHitRate: number[]
```

Author ban rule to sweep: minimum hit rate (0..1) an author
needs to be allowed. The ban is STRICTLY below the threshold —
an author exactly at it stays allowed.
Tunes: required author quality; on the reference data quality
mattered more than track length on every ranking.
Ignored: never — trains under both metrics; the hit definition
follows authorMetric.

### minAuthorWilson

```ts
minAuthorWilson: number[]
```

Author ban rule to sweep: minimum LOWER BOUND of the Wilson 95%
confidence interval of the author's hit rate. Unlike the
minAuthorTrack x minAuthorHitRate pair, the bound prices the
track length INTO the quality estimate: a 3/3 newcomer (LB ~
0.44) is banned where a 15/15 veteran (LB ~ 0.80) passes — the
pair cannot tell them apart at equal hit rates. An author with
zero known outcomes has LB 0 (default-ban preserved).
Tunes: how much PROVEN quality (not observed quality) an author
needs; sweeping it against the pair lets the grid decide which
ban arithmetic wins.
Ignored: 0 DISABLES the bound entirely — the pair alone decides,
bit-identical to the pre-Wilson behavior; keep 0 in the list to
sweep the baseline. To ban by the bound ALONE, pin the pair to
its inert values: minAuthorTrack: [0], minAuthorHitRate: [0].
Hits inherit authorMetric, like the rest of the ban rule.

### minWeightAligned

```ts
minWeightAligned: number[]
```

Weighted consensus thresholds to sweep. An author's vote weight
is his Laplace-smoothed track record (hits+1)/(ideas+2) — a 2/2
newcomer weighs less than a 15/15 veteran. Entry requires the
SUM of weights of unique aligned unbanned authors in the rolling
window to reach the threshold.
Tunes: quality-weighted consensus on top of (or instead of) the
binary count; weights inherit the authorMetric hit definition.
Ignored: 0 DISABLES the gate entirely (binary minIdeasAligned
counting only) — keep 0 in the list to sweep the unweighted
baseline.

### profitLockPercent

```ts
profitLockPercent: number[]
```

Profit lock levels to sweep, percent from entry. When price
TOUCHES +X% a fixed floor arms at that level and the trade exits
only on a PULLBACK to the floor — unlike a plain fixed take, a
runner keeps running and is later handled by the trailing take
(whose floor rises above the lock once the peak clears it).
Covers the zone where the trailing take is not armed yet (peak
below entry/(1 - r)) and profit would otherwise bleed back.
Tunes: harvesting the crowd-liquidity step without cutting
runners. Also the grading level of the "reach" author metric.
Ignored: 0 DISABLES the mechanism for trading AND degenerates
the "reach" metric into "close". Under authorMetric "close" the
level never affects ban training — trading only.

### authorMetric

```ts
authorMetric: SimulatorAuthorMetric[]
```

Author-hit metrics to sweep for the ban filter — a rule
parameter like the thresholds.
Tunes: which author grading feeds which exit style — "close"
(5-day horizon close) rewards authors whose calls survive a long
hold, "reach" (lock-reachability against THE POINT'S lock/stop)
rewards the authors a lock point actually earns on; the same
author has different hit counts under different metrics.
Ignored: with "close" the point's lock/stop never affect ban
training; "reach" with profitLockPercent = 0 falls back to
"close" (see SimulatorAuthorRule — the fallback is structural).

### banCriteria

```ts
banCriteria: SimulatorRankingCriterion[]
```

NOT a swept axis — run() aggregation config: ranking criteria
whose winners feed the run-level author artifact
(allowedAuthors = union of their whitelists, bannedAuthors =
banned by every one of them).
Tunes: how conservative the run-level whitelist candidate set
is; ["sharpe"] is the backward-compatibility knob making the
run-level lists exactly the Sharpe winner's artifact.
Ignored: by the cartesian product (never a point field); by
test() entirely — a frozen point carries its own single rule;
and a winner elected by a NON-FINITE ranking value (Infinity
sortino/recovery on a drawdown-free curve — a grid-order tie
representative, not a merit pick) is ignored for allowances:
its authors join the pool and stay banned by default.
Per-winner artifacts in best[] are always complete regardless
of this list.

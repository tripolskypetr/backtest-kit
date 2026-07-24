---
title: docs/interface/ISimulatorGridAxes
group: docs
---

# ISimulatorGridAxes

Value lists per grid axis. The grid is the cartesian product of
all axes; author-ban thresholds are swept the same way as stop
and trailing — rules are searched, not hardcoded.

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
TRAINING only the "reach" rule grades authors against it (see
SimulatorAuthorRule).

### trailingTakePercent

```ts
trailingTakePercent: number[]
```

Trailing take pullback levels to sweep, percent from the peak.
Tunes: how much of a runner's peak is given back. Arms only from
PREVIOUS-candle peaks and only when the locked level is not
worse than entry (peak &gt;= entry/(1 - r)). Also the grading
level of the "trail" author metric (arming reachability inside
the point's window).
Ignored: inert for any trade whose peak never reaches the arm
level — such trades exit by stop, lock, or the hold cap. Under
"close"/"reach"/"retain"/"pnl" it never affects ban training;
trail points with a value outside (0, 100) DO NOT EXIST — an
inert trailing has no arming level to grade.

### holdMinutes

```ts
holdMinutes: number[]
```

Maximum position hold durations to sweep, minutes.
Tunes: slot turnover — one position per symbol, and a busy slot
ABSORBS qualified ideas (per-trade absorbedIdeaIds), so longer
holds trade less often; the cap is the worst-case exit
(time_expired) when neither stop nor floor fires.
Ignored: never — the hold serves BOTH layers: it caps the trade
AND is the grading window of the point's ban rule (every author
metric is computed inside the first holdMinutes of the idea's
trajectory — the window the point actually trades). This axis's
MAXIMUM additionally defines the candle fetch depth of every
idea profile (the schema owns the horizon, the engine has no
hidden constant).

### minAuthorTrack

```ts
minAuthorTrack: number[]
```

Author ban rule to sweep: minimum ideas with a FULLY OBSERVED
outcome an author needs before he can be allowed (fewer -&gt;
banned by default; truncated profiles prove nothing).
Tunes: how much evidence "proven" requires.
Ignored: never — the rule trains under every author metric;
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
Ignored: never — trains under every metric; the hit definition
follows authorMetric.

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
runners. Also the grading level of the "reach" and "retain"
author metrics. Ignored: 0 DISABLES the mechanism for trading,
and reach/retain points with lock = 0 DO NOT EXIST — the
combination is excluded from the cartesian product (a rule
without a target is not a rule). Under "close"/"pnl" the level
never affects ban training — trading only.

### authorMetric

```ts
authorMetric: SimulatorAuthorMetric[]
```

Author-hit metrics to sweep for the ban filter — a rule
parameter like the thresholds. Each metric is graded SEPARATELY:
the sweep never glues incomparable hit counts together, it
reports every grading as its own points and its own ban lists.
Tunes: which author grading feeds which exit style — "close"
(window close) rewards authors whose calls survive the hold,
"reach" (lock-reachability against THE POINT'S lock/stop)
rewards the authors a lock point actually earns on, "retain"
(median move above THE POINT'S lock) rewards authors whose
moves HOLD the level, "pnl" (fixed +1% MFE threshold) asks "did
the call ever pay", "trail" (arming reachability of THE POINT'S
trailing take) rewards the authors a trailing point actually
earns on; every grading runs inside THE POINT'S hold window,
and the same author has different hit counts under different
metrics and different windows.
Ignored: with "close"/"pnl" the point's lock/stop never affect
ban training; "retain" ignores only the stop; "reach"/"retain"
require lock &gt; 0 and "trail" requires trailing in (0, 100) —
the inert combinations are excluded from the grid, never
silently regraded.

---
title: docs/interface/ISimulatorGridAxes
group: docs
---

# ISimulatorGridAxes

Value lists per grid axis. The grid is the cartesian product of
all axes; windows and author-ban thresholds are swept the same way
as stop and trailing — rules are searched, not hardcoded.

## Properties

### hardStopPercent

```ts
hardStopPercent: number[]
```

Hard stop levels to sweep, percent from entry.

### trailingTakePercent

```ts
trailingTakePercent: number[]
```

Trailing take pullback levels to sweep, percent from peak.

### holdMinutes

```ts
holdMinutes: number[]
```

Maximum position hold durations to sweep, minutes.

### minIdeasAligned

```ts
minIdeasAligned: number[]
```

Entry thresholds to sweep: minimum unique aligned authors.

### minAuthorTrack

```ts
minAuthorTrack: number[]
```

Author ban rule to sweep: minimum ideas with a known outcome an
author needs before he can be allowed (fewer -&gt; banned by default).

### minAuthorHitRate

```ts
minAuthorHitRate: number[]
```

Author ban rule to sweep: minimum hit rate (0..1) an author needs
to be allowed (worse -&gt; banned).

### minWeightAligned

```ts
minWeightAligned: number[]
```

Weighted consensus thresholds to sweep. An author's vote weight
is his Laplace-smoothed track record (hits+1)/(ideas+2) — a 2/2
newcomer weighs less than a 15/15 veteran. Entry requires the
SUM of weights of unique aligned unbanned authors in the rolling
window to reach the threshold. 0 disables the weighted gate
(binary minIdeasAligned counting only).

### profitLockPercent

```ts
profitLockPercent: number[]
```

Profit lock levels to sweep, percent from entry; 0 disables.
When price TOUCHES +X% a fixed floor arms at that level and the
trade exits only on a PULLBACK to the floor — unlike a plain
fixed take, a runner keeps running and is later handled by the
trailing take (whose floor rises above the lock once the peak
clears it). Covers the zone where the trailing take is not armed
yet (peak below entry/(1 - r)) and profit would otherwise bleed
back to zero.

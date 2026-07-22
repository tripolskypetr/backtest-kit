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

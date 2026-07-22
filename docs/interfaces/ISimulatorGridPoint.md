---
title: docs/interface/ISimulatorGridPoint
group: docs
---

# ISimulatorGridPoint

Single point of the grid (scalar per axis).

## Properties

### hardStopPercent

```ts
hardStopPercent: number
```

Hard stop level, percent from entry.

### trailingTakePercent

```ts
trailingTakePercent: number
```

Trailing take pullback, percent from the running peak.

### holdMinutes

```ts
holdMinutes: number
```

Maximum position hold duration, minutes.

### minIdeasAligned

```ts
minIdeasAligned: number
```

Minimum unique aligned (unbanned) authors required to enter.

### minAuthorTrack

```ts
minAuthorTrack: number
```

Author ban rule: minimum known-outcome ideas to be allowed.

### minAuthorHitRate

```ts
minAuthorHitRate: number
```

Author ban rule: minimum hit rate (0..1) to be allowed.

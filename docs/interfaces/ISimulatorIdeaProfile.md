---
title: docs/interface/ISimulatorIdeaProfile
group: docs
---

# ISimulatorIdeaProfile

Per-candle trajectory profile of a single idea, built to the
grid's longest hold (the candle fetch depth). The outcome of ANY
grid point is computed arithmetically from the profile — candles
are never re-fetched per grid point. The aggregate fields below
(hit, MFE/MAE, shakeout, median) are FULL-HORIZON diagnostics for
the consumer; ban training never reads them — every rule grades
the raw candle trajectory inside its own hold window.

## Properties

### idea

```ts
idea: ISimulatorIdea
```

The idea this profile belongs to.

### entryTimestamp

```ts
entryTimestamp: number
```

Entry minute: the minute FOLLOWING publication (no lookahead).

### entryPrice

```ts
entryPrice: number
```

Open price of the first candle (entry basis before slippage).

### candles

```ts
candles: ICandleData[]
```

Candle trajectory of the idea horizon (shared chunk references).

### hit

```ts
hit: boolean
```

Idea correctness: horizon return in its direction is positive.

### outcomeKnownAt

```ts
outcomeKnownAt: number
```

Timestamp when the idea outcome becomes known (horizon end).

### truncated

```ts
truncated: boolean
```

Trajectory cut by the data edge before the full fetch depth.

### maxMfePercent

```ts
maxMfePercent: number
```

Maximum favorable excursion from entry, percent (by wicks).

### maxMaePercent

```ts
maxMaePercent: number
```

Maximum adverse excursion from entry, percent (by wicks, negative).

### minutesToMfe

```ts
minutesToMfe: number
```

Minutes from entry to the maximum favorable excursion.

### minutesToMae

```ts
minutesToMae: number
```

Minutes from entry to the maximum adverse excursion.

### shakeoutMaePercent

```ts
shakeoutMaePercent: number
```

Worst MAE BEFORE the max-MFE candle — whale shakeout depth.

### medianMovePercent

```ts
medianMovePercent: number
```

MEDIAN of the per-candle close moves from entry over the whole
horizon, percent in the idea's direction: median &gt; X means
price sat ABOVE entry + X% for at least half the observed
trajectory (the 50% share is the median's definition, not a
tunable constant). Full-horizon diagnostic twin of the "retain"
grading — the rule itself recomputes the median inside its own
hold window.

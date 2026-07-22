---
title: docs/interface/ISimulatorIdeaProfile
group: docs
---

# ISimulatorIdeaProfile

Per-candle trajectory profile of a single idea.
The outcome of ANY grid point is computed arithmetically from the
profile — candles are never re-iterated per grid point.

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

### alignedAtEntry

```ts
alignedAtEntry: number
```

Unique aligned authors at entry minute (self included).

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

Horizon was truncated by end of data, not by the trim constant.

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

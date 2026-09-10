---
title: docs/interface/ProgressWalkerContract
group: docs
---

# ProgressWalkerContract

Contract for walker progress events.

Emitted during Walker.background() execution to track progress.
Contains information about total strategies, processed strategies, and completion percentage.

## Properties

### walkerName

```ts
walkerName: string
```

walkerName - Name of the walker being executed

### exchangeName

```ts
exchangeName: string
```

exchangeName - Name of the exchange used in execution

### frameName

```ts
frameName: string
```

frameName - Name of the frame being used

### symbol

```ts
symbol: string
```

symbol - Trading symbol (e.g., "BTCUSDT")

### totalStrategies

```ts
totalStrategies: number
```

totalStrategies - Total number of strategies to process

### processedStrategies

```ts
processedStrategies: number
```

processedStrategies - Number of strategies processed so far

### progress

```ts
progress: number
```

progress - Completion percentage from 0.0 to 1.0

### when

```ts
when: Date
```

Virtual execution time as a `Date` instance: the last processed candle
timestamp of the just-completed strategy backtest from `TimeMetaService`,
falling back to the frame's planned start date. Never wall-clock time.

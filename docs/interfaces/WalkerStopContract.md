---
title: docs/interface/WalkerStopContract
group: docs
---

# WalkerStopContract

Contract for walker stop signal events.

Emitted when Walker.stop() is called to interrupt a running walker.
Contains metadata about which walker and strategy should be stopped.

Supports multiple walkers running on the same symbol simultaneously
by including walkerName for filtering.

## Properties

### symbol

```ts
symbol: string
```

symbol - Trading symbol (e.g., "BTCUSDT")

### strategyName

```ts
strategyName: string
```

strategyName - Name of the strategy to stop

### walkerName

```ts
walkerName: string
```

walkerName - Name of the walker to stop (for filtering)

### when

```ts
when: Date
```

Virtual execution time as a `Date` instance: the last processed candle
timestamp of the strategy being stopped from `TimeMetaService`, falling
back to the frame's planned start date. Never wall-clock time.

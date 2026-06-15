---
title: docs/interface/IStorageSignalRowScheduled
group: docs
---

# IStorageSignalRowScheduled

Storage signal row for scheduled status.

## Properties

### status

```ts
status: "scheduled"
```

Current status of the signal

### currentPrice

```ts
currentPrice: number
```

VWAP price when the scheduled signal was created (mirrors IStrategyTickResultScheduled.currentPrice)

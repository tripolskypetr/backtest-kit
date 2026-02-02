---
title: docs/interface/IStorageSignalRowBase
group: docs
---

# IStorageSignalRowBase

Base storage signal row fields shared by all status variants.
Used for persisting signals with accurate creation time.

## Properties

### createdAt

```ts
createdAt: number
```

Creation timestamp taken from IStrategyTickResult

### updatedAt

```ts
updatedAt: number
```

Creation timestamp taken from IStrategyTickResult

### priority

```ts
priority: number
```

Storage adapter rewrite priority. Equal to Date.now for live and backtest both

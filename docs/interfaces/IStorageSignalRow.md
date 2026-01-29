---
title: docs/interface/IStorageSignalRow
group: docs
---

# IStorageSignalRow

Storage signal row with creation timestamp taken from IStrategyTickResult.
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

### status

```ts
status: "opened" | "scheduled" | "closed" | "cancelled"
```

Current status of the signal

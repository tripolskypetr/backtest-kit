---
title: docs/function/getPositionInvestedCost
group: docs
---

# getPositionInvestedCost

```ts
declare function getPositionInvestedCost(symbol: string): Promise<number | null>;
```

Returns the total invested cost basis in dollars for the current pending signal.

Equal to the sum of all _entry costs (Σ entry.cost).
Each entry cost is set at the time of commitAverageBuy (defaults to CC_POSITION_ENTRY_COST).

Returns null if no pending signal exists.

Automatically detects backtest/live mode from execution context.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |

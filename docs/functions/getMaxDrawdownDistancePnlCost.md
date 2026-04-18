---
title: docs/function/getMaxDrawdownDistancePnlCost
group: docs
---

# getMaxDrawdownDistancePnlCost

```ts
declare function getMaxDrawdownDistancePnlCost(symbol: string): Promise<number>;
```

Returns the peak-to-trough PnL cost distance between the position's highest profit and deepest drawdown.

Computed as: max(0, peakPnlCost - fallPnlCost).
Returns null if no pending signal exists.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |

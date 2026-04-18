---
title: docs/function/getMaxDrawdownDistancePnlPercentage
group: docs
---

# getMaxDrawdownDistancePnlPercentage

```ts
declare function getMaxDrawdownDistancePnlPercentage(symbol: string): Promise<number>;
```

Returns the peak-to-trough PnL percentage distance between the position's highest profit and deepest drawdown.

Computed as: max(0, peakPnlPercentage - fallPnlPercentage).
Returns null if no pending signal exists.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |

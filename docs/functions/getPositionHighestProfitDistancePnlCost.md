---
title: docs/function/getPositionHighestProfitDistancePnlCost
group: docs
---

# getPositionHighestProfitDistancePnlCost

```ts
declare function getPositionHighestProfitDistancePnlCost(symbol: string): Promise<number>;
```

Returns the distance in PnL cost between the current price and the highest profit peak.

Computed as: max(0, peakPnlCost - currentPnlCost).
Returns null if no pending signal exists.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |

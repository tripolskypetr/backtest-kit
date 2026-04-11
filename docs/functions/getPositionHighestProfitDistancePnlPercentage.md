---
title: docs/function/getPositionHighestProfitDistancePnlPercentage
group: docs
---

# getPositionHighestProfitDistancePnlPercentage

```ts
declare function getPositionHighestProfitDistancePnlPercentage(symbol: string): Promise<number>;
```

Returns the distance in PnL percentage between the current price and the highest profit peak.

Computed as: max(0, peakPnlPercentage - currentPnlPercentage).
Returns null if no pending signal exists.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |

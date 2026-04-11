---
title: docs/function/getPositionHighestMaxDrawdownPnlPercentage
group: docs
---

# getPositionHighestMaxDrawdownPnlPercentage

```ts
declare function getPositionHighestMaxDrawdownPnlPercentage(symbol: string): Promise<number>;
```

Returns the distance in PnL percentage between the current price and the worst drawdown trough.

Computed as: max(0, currentPnlPercentage - fallPnlPercentage).
Returns null if no pending signal exists.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |

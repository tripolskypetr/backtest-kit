---
title: docs/function/getPositionHighestMaxDrawdownPnlCost
group: docs
---

# getPositionHighestMaxDrawdownPnlCost

```ts
declare function getPositionHighestMaxDrawdownPnlCost(symbol: string): Promise<number>;
```

Returns the distance in PnL cost between the current price and the worst drawdown trough.

Computed as: max(0, currentPnlCost - fallPnlCost).
Returns null if no pending signal exists.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |

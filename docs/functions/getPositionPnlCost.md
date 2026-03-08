---
title: docs/function/getPositionPnlCost
group: docs
---

# getPositionPnlCost

```ts
declare function getPositionPnlCost(symbol: string): Promise<number | null>;
```

Returns the unrealized PNL in dollars for the current pending signal at current market price.

Calculated as: pnlPercentage / 100 × totalInvestedCost.
Accounts for partial closes, DCA entries, slippage and fees.

Returns null if no pending signal exists.

Automatically detects backtest/live mode from execution context.
Automatically fetches current price via getAveragePrice.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |

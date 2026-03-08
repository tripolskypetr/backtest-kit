---
title: docs/function/getPositionPnlPercent
group: docs
---

# getPositionPnlPercent

```ts
declare function getPositionPnlPercent(symbol: string): Promise<number | null>;
```

Returns the unrealized PNL percentage for the current pending signal at current market price.

Accounts for partial closes, DCA entries, slippage and fees
(delegates to toProfitLossDto).

Returns null if no pending signal exists.

Automatically detects backtest/live mode from execution context.
Automatically fetches current price via getAveragePrice.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |

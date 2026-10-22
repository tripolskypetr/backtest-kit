---
title: docs/function/commitPartialProfitCost
group: docs
---

# commitPartialProfitCost

```ts
declare function commitPartialProfitCost(symbol: string, dto: number | IPartialCostDto): Promise<boolean>;
```

Executes partial close at profit level by absolute dollar amount (moving toward TP).

Convenience wrapper around commitPartialProfit that converts a dollar amount
to a percentage of the invested position cost automatically.
Price must be moving toward take profit (in profit direction).

Automatically detects backtest/live mode from execution context.
Automatically fetches current price via getAveragePrice.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
| `dto` | Dollar value of position to close as a number (e.g. 150 closes $150 worth), or { cost, note } to store a note on the partial row |

---
title: docs/function/commitBreakeven
group: docs
---

# commitBreakeven

```ts
declare function commitBreakeven(symbol: string): Promise<boolean>;
```

Moves stop-loss to breakeven when price reaches threshold.

Moves SL to entry price (zero-risk position) when current price has moved
far enough in profit direction to cover transaction costs.
Threshold is calculated as: (CC_PERCENT_SLIPPAGE + CC_PERCENT_FEE) * 2

Automatically detects backtest/live mode from execution context.
Automatically fetches current price via getAveragePrice.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |

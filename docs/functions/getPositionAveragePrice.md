---
title: docs/function/getPositionAveragePrice
group: docs
---

# getPositionAveragePrice

```ts
declare function getPositionAveragePrice(symbol: string): Promise<number | null>;
```

Returns the effective (DCA-weighted) entry price for the current pending signal.

Uses cost-weighted harmonic mean: Σcost / Σ(cost/price).
When partial closes exist, the price is computed iteratively using
costBasisAtClose snapshots from each partial, then blended with any
DCA entries added after the last partial.
With no DCA entries, equals the original priceOpen.

Returns null if no pending signal exists.

Automatically detects backtest/live mode from execution context.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |

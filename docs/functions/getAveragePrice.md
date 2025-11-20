---
title: docs/api-reference/function/getAveragePrice
group: docs
---

# getAveragePrice

```ts
declare function getAveragePrice(symbol: string): Promise<number>;
```

Calculates VWAP (Volume Weighted Average Price) for a symbol.

Uses the last 5 1-minute candles to calculate:
- Typical Price = (high + low + close) / 3
- VWAP = sum(typical_price * volume) / sum(volume)

If volume is zero, returns simple average of close prices.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol (e.g., "BTCUSDT") |

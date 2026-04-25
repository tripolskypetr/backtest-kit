---
title: docs/function/getClosePrice
group: docs
---

# getClosePrice

```ts
declare function getClosePrice(symbol: string, interval: CandleInterval): Promise<number>;
```

Returns the close price of the last completed candle for the given interval.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol (e.g., "BTCUSDT") |
| `interval` | Candle interval ("1m" &vert; "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h") |

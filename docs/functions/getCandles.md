---
title: docs/api-reference/function/getCandles
group: docs
---

# getCandles

```ts
declare function getCandles(symbol: string, interval: CandleInterval, limit: number): Promise<ICandleData[]>;
```

Fetches historical candle data from the registered exchange.

Candles are fetched backwards from the current execution context time.
Uses the exchange's getCandles implementation.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol (e.g., "BTCUSDT") |
| `interval` | Candle interval ("1m" &vert; "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h") |
| `limit` | Number of candles to fetch |

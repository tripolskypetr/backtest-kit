---
title: docs/function/getNextCandles
group: docs
---

# getNextCandles

```ts
declare function getNextCandles(symbol: string, interval: CandleInterval, limit: number): Promise<ICandleData[]>;
```

Fetches the set of candles after current time based on execution context.

Uses the exchange's getNextCandles implementation to retrieve candles
that occur after the current context time.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol (e.g., "BTCUSDT") |
| `interval` | Candle interval ("1m" &vert; "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h" | "12h" | "1d") |
| `limit` | Number of candles to fetch |

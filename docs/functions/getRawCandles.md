---
title: docs/function/getRawCandles
group: docs
---

# getRawCandles

```ts
declare function getRawCandles(symbol: string, interval: CandleInterval, limit?: number, sDate?: number, eDate?: number): Promise<ICandleData[]>;
```

Fetches raw candles with flexible date/limit parameters.

All modes respect execution context and prevent look-ahead bias.

Parameter combinations:
1. sDate + eDate + limit: fetches with explicit parameters, validates eDate &lt;= when
2. sDate + eDate: calculates limit from date range, validates eDate &lt;= when
3. eDate + limit: calculates sDate backward, validates eDate &lt;= when
4. sDate + limit: fetches forward, validates calculated endTimestamp <= when
5. Only limit: uses execution.context.when as reference (backward)

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol (e.g., "BTCUSDT") |
| `interval` | Candle interval ("1m" &vert; "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h") |
| `limit` | Optional number of candles to fetch |
| `sDate` | Optional start date in milliseconds |
| `eDate` | Optional end date in milliseconds |

---
title: docs/api-reference/function/addExchange
group: docs
---

# addExchange

```ts
declare function addExchange(exchangeSchema: IExchangeSchema): void;
```

Registers an exchange data source in the framework.

The exchange provides:
- Historical candle data via getCandles
- Price/quantity formatting for the exchange
- VWAP calculation from last 5 1m candles

## Parameters

| Parameter | Description |
|-----------|-------------|
| `exchangeSchema` | Exchange configuration object |

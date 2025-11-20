---
title: docs/api-reference/interface/IExchangeSchema
group: docs
---

# IExchangeSchema

Exchange schema registered via addExchange().
Defines candle data source and formatting logic.

## Properties

### exchangeName

```ts
exchangeName: string
```

### getCandles

```ts
getCandles: (symbol: string, interval: CandleInterval, since: Date, limit: number) => Promise<ICandleData[]>
```

### formatQuantity

```ts
formatQuantity: (symbol: string, quantity: number) => Promise<string>
```

### formatPrice

```ts
formatPrice: (symbol: string, price: number) => Promise<string>
```

### callbacks

```ts
callbacks: Partial<IExchangeCallbacks>
```

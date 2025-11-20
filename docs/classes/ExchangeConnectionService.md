---
title: docs/api-reference/class/ExchangeConnectionService
group: docs
---

# ExchangeConnectionService

Implements `IExchange`

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### executionContextService

```ts
executionContextService: any
```

### exchangeSchemaService

```ts
exchangeSchemaService: any
```

### methodContextService

```ts
methodContextService: any
```

### getExchange

```ts
getExchange: ((exchangeName: string) => ClientExchange) & IClearableMemoize<string> & IControlMemoize<string, ClientExchange>
```

### getCandles

```ts
getCandles: (symbol: string, interval: CandleInterval, limit: number) => Promise<ICandleData[]>
```

### getAveragePrice

```ts
getAveragePrice: (symbol: string) => Promise<number>
```

### formatPrice

```ts
formatPrice: (symbol: string, price: number) => Promise<string>
```

### formatQuantity

```ts
formatQuantity: (symbol: string, quantity: number) => Promise<string>
```

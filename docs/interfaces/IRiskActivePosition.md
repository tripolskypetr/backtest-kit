---
title: docs/interface/IRiskActivePosition
group: docs
---

# IRiskActivePosition

Active position tracked by ClientRisk for cross-strategy analysis.

## Properties

### strategyName

```ts
strategyName: string
```

Strategy name owning the position

### exchangeName

```ts
exchangeName: string
```

Exchange name

### frameName

```ts
frameName: string
```

Frame name

### symbol

```ts
symbol: string
```

Trading pair symbol (e.g., "BTCUSDT")

### position

```ts
position: "long" | "short"
```

Position direction ("long" or "short")

### priceOpen

```ts
priceOpen: number
```

Entry price

### priceStopLoss

```ts
priceStopLoss: number
```

Stop loss price

### priceTakeProfit

```ts
priceTakeProfit: number
```

Take profit price

### minuteEstimatedTime

```ts
minuteEstimatedTime: number
```

Estimated time in minutes

### openTimestamp

```ts
openTimestamp: number
```

Timestamp when the position was opened

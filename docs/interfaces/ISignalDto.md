---
title: docs/api-reference/interface/ISignalDto
group: docs
---

# ISignalDto

Signal data transfer object returned by getSignal.
Will be validated and augmented with auto-generated id.

## Properties

### id

```ts
id: string
```

### position

```ts
position: "long" | "short"
```

### note

```ts
note: string
```

### priceOpen

```ts
priceOpen: number
```

### priceTakeProfit

```ts
priceTakeProfit: number
```

### priceStopLoss

```ts
priceStopLoss: number
```

### minuteEstimatedTime

```ts
minuteEstimatedTime: number
```

### timestamp

```ts
timestamp: number
```

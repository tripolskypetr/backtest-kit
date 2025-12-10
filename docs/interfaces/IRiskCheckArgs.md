---
title: docs/api-reference/interface/IRiskCheckArgs
group: docs
---

# IRiskCheckArgs

Risk check arguments for evaluating whether to allow opening a new position.
Called BEFORE signal creation to validate if conditions allow new signals.
Contains only passthrough arguments from ClientStrategy context.

## Properties

### symbol

```ts
symbol: string
```

Trading pair symbol (e.g., "BTCUSDT")

### pendingSignal

```ts
pendingSignal: ISignalDto
```

Pending signal to apply

### strategyName

```ts
strategyName: string
```

Strategy name requesting to open a position

### exchangeName

```ts
exchangeName: string
```

Exchange name

### currentPrice

```ts
currentPrice: number
```

Current VWAP price

### timestamp

```ts
timestamp: number
```

Current timestamp

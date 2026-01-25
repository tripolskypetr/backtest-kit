---
title: docs/interface/RiskRejectionNotification
group: docs
---

# RiskRejectionNotification

Risk rejection notification.
Emitted when a signal is rejected due to risk management rules.

## Properties

### type

```ts
type: "risk.rejection"
```

Discriminator for type-safe union

### id

```ts
id: string
```

Unique notification identifier

### timestamp

```ts
timestamp: number
```

Unix timestamp in milliseconds when signal was rejected

### backtest

```ts
backtest: boolean
```

Whether this notification is from backtest mode (true) or live mode (false)

### symbol

```ts
symbol: string
```

Trading pair symbol (e.g., "BTCUSDT")

### strategyName

```ts
strategyName: string
```

Strategy name that attempted to create signal

### exchangeName

```ts
exchangeName: string
```

Exchange name where signal was rejected

### rejectionNote

```ts
rejectionNote: string
```

Human-readable reason for rejection

### rejectionId

```ts
rejectionId: string
```

Optional unique rejection identifier for tracking

### activePositionCount

```ts
activePositionCount: number
```

Number of currently active positions at rejection time

### currentPrice

```ts
currentPrice: number
```

Current market price when rejection occurred

### pendingSignal

```ts
pendingSignal: ISignalDto
```

The signal that was rejected

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

### signalId

```ts
signalId: string
```

Unique signal identifier from pending signal (may be undefined if not provided)

### position

```ts
position: "long" | "short"
```

Trade direction: "long" (buy) or "short" (sell)

### priceOpen

```ts
priceOpen: number
```

Entry price for the position (may be undefined if not provided)

### priceTakeProfit

```ts
priceTakeProfit: number
```

Take profit target price

### priceStopLoss

```ts
priceStopLoss: number
```

Stop loss exit price

### minuteEstimatedTime

```ts
minuteEstimatedTime: number
```

Expected duration in minutes before time_expired

### multiplier

```ts
multiplier: number
```

PNL multiplier (leverage) applied to pnlPercentage. Default: GLOBAL_CONFIG.CC_SIGNAL_LEVERAGE_MULTIPLIER

### signalNote

```ts
signalNote: string
```

Optional human-readable description of signal reason

### createdAt

```ts
createdAt: number
```

Unix timestamp in milliseconds when the notification was created

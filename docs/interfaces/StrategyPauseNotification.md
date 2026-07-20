---
title: docs/interface/StrategyPauseNotification
group: docs
---

# StrategyPauseNotification

Strategy pause state change notification.
Emitted when setPaused actually flips the pause flag of a strategy: while paused
the strategy opens nothing new (getSignal is not called and a queued createSignal
DTO is held until resume); existing pending/scheduled signals keep being monitored
and close normally.

## Properties

### type

```ts
type: "strategy.pause"
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

Unix timestamp in milliseconds when the pause state changed

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

Strategy name whose pause state changed

### exchangeName

```ts
exchangeName: string
```

Exchange name for context

### frameName

```ts
frameName: string
```

Frame name for context (empty string for live)

### paused

```ts
paused: boolean
```

New pause state: true — new position opening suspended, false — resumed

### createdAt

```ts
createdAt: number
```

Unix timestamp in milliseconds when the notification was created

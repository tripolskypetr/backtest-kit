---
title: docs/interface/OrderSyncBase
group: docs
---

# OrderSyncBase

Base fields shared by all order sync events.

## Properties

### type

```ts
type: "schedule" | "active"
```

Which order the sync gate is about:
- "active" — the position order: immediate open, activation fill of a resting
  order, and every close.
- "schedule" — the resting entry order being PLACED when a scheduled signal is
  created (action "signal-open" only).

Listener throw semantics (resolved into IBrokerOrderVerdict): a plain Error or
OrderTransientError = "transient" — the open rolls back and retries
identity-stably (same signalId, `attempt` increments) up to
CC_ORDER_OPEN_RETRY_ATTEMPTS, the close is skipped and retries up to
CC_ORDER_CLOSE_RETRY_ATTEMPTS (then force-close); OrderRejectedError =
"rejected", terminal at once (open dropped without retry / close force-closed);
OrderDeletedError here is a protocol violation and degrades to "transient".

### symbol

```ts
symbol: string
```

Trading pair symbol (e.g., "BTCUSDT")

### strategyName

```ts
strategyName: string
```

Strategy name that generated this signal

### exchangeName

```ts
exchangeName: string
```

Exchange name where signal was executed

### frameName

```ts
frameName: string
```

Timeframe name (used in backtest mode, empty string in live mode)

### backtest

```ts
backtest: boolean
```

Whether this event is from backtest mode (true) or live mode (false)

### signalId

```ts
signalId: string
```

Unique signal identifier (UUID v4)

### timestamp

```ts
timestamp: number
```

Timestamp from execution context (tick's when or backtest candle timestamp)

### signal

```ts
signal: IPublicSignalRow
```

Complete public signal row at the moment of this event

### attempt

```ts
attempt: number
```

Number of CONSECUTIVE prior failures of this gate for this signal (0 = first
attempt / healthy). Managed by the framework: a rejected gate increments the
counter carried by the next attempt; a confirmed gate resets it to 0. Bounded by
CC_ORDER_OPEN_RETRY_ATTEMPTS (signal-open) / CC_ORDER_CLOSE_RETRY_ATTEMPTS
(signal-close).

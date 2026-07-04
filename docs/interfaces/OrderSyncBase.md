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
  order, and every close. Reject (false/throw) skips the open/close; a rejected
  fresh open rolls back the interval throttle and retries on the next tick.
- "schedule" — the resting entry order being PLACED when a scheduled signal is
  created (action "signal-open" only). Reject means the exchange did not accept
  the resting order: the scheduled signal is NOT registered, the risk
  reservation is released and the placement retries on the next tick.

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

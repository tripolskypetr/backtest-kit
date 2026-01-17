---
title: docs/interface/SchedulePingContract
group: docs
---

# SchedulePingContract

Contract for schedule ping events during scheduled signal monitoring.

Emitted by schedulePingSubject every minute when a scheduled signal is being monitored.
Used for tracking scheduled signal lifecycle and custom monitoring logic.

Events are emitted only when scheduled signal is active (not cancelled, not activated).
Allows users to implement custom cancellation logic via onSchedulePing callback.

Consumers:
- User callbacks via listenSchedulePing() / listenSchedulePingOnce()

## Properties

### symbol

```ts
symbol: string
```

Trading pair symbol (e.g., "BTCUSDT").
Identifies which market this ping event belongs to.

### strategyName

```ts
strategyName: string
```

Strategy name that is monitoring this scheduled signal.
Identifies which strategy execution this ping event belongs to.

### exchangeName

```ts
exchangeName: string
```

Exchange name where this scheduled signal is being monitored.
Identifies which exchange this ping event belongs to.

### data

```ts
data: IScheduledSignalRow
```

Complete scheduled signal row data.
Contains all signal information: id, position, priceOpen, priceTakeProfit, priceStopLoss, etc.

### backtest

```ts
backtest: boolean
```

Execution mode flag.
- true: Event from backtest execution (historical candle data)
- false: Event from live trading (real-time tick)

### timestamp

```ts
timestamp: number
```

Event timestamp in milliseconds since Unix epoch.

Timing semantics:
- Live mode: when.getTime() at the moment of ping
- Backtest mode: candle.timestamp of the candle being processed

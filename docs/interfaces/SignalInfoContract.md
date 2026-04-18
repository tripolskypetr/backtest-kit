---
title: docs/interface/SignalInfoContract
group: docs
---

# SignalInfoContract

Contract for signal info notification events.

Emitted by signalNotifySubject when a strategy calls commitSignalInfo() to broadcast
a user-defined informational message for an open position.
Used for custom strategy annotations, debug output, and external notification routing.

Consumers:
- User callbacks via listenSignalNotify() / listenSignalNotifyOnce()

## Properties

### symbol

```ts
symbol: string
```

Trading pair symbol (e.g., "BTCUSDT").
Identifies which market this info event belongs to.

### strategyName

```ts
strategyName: string
```

Strategy name that generated this signal.
Identifies which strategy execution this info event belongs to.

### exchangeName

```ts
exchangeName: string
```

Exchange name where this signal is being executed.
Identifies which exchange this info event belongs to.

### frameName

```ts
frameName: string
```

Frame name where this signal is being executed.
Identifies which frame this info event belongs to (empty string for live mode).

### data

```ts
data: IPublicSignalRow
```

Complete signal row data with original prices.
Contains all signal information including originalPriceStopLoss, originalPriceTakeProfit, and partialExecuted.

### currentPrice

```ts
currentPrice: number
```

Current market price at the moment the info event was emitted.

### note

```ts
note: string
```

User-defined informational note attached to this event.
Provided by the strategy when calling commitSignalInfo().

### notificationId

```ts
notificationId: string
```

Optional user-defined identifier for correlating this event with external systems.
Provided by the strategy when calling commitSignalInfo().

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
- Live mode: when.getTime() at the moment the info event was emitted
- Backtest mode: candle.timestamp of the candle that triggered the event

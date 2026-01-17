---
title: docs/interface/ActivePingContract
group: docs
---

# ActivePingContract

Contract for active ping events during active pending signal monitoring.

Emitted by activePingSubject every minute when an active pending signal is being monitored.
Used for tracking active signal lifecycle and custom dynamic management logic.

Events are emitted only when pending signal is active (not closed yet).
Allows users to implement custom management logic via onActivePing callback.

Consumers:
- User callbacks via listenActivePing() / listenActivePingOnce()

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

Strategy name that is monitoring this active pending signal.
Identifies which strategy execution this ping event belongs to.

### exchangeName

```ts
exchangeName: string
```

Exchange name where this active pending signal is being monitored.
Identifies which exchange this ping event belongs to.

### data

```ts
data: ISignalRow
```

Complete pending signal row data.
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

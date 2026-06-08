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

### frameName

```ts
frameName: string
```

Frame name (timeframe / date range) for the run. Empty string in live
mode, where frames are not used. Same value as the monitored signal's
`frameName` (`data.frameName`).

### data

```ts
data: IPublicSignalRow
```

Complete pending signal row data.
Contains all signal information: id, position, priceOpen, priceTakeProfit, priceStopLoss, etc.

### currentPrice

```ts
currentPrice: number
```

Current market price of the symbol at the time of the ping.
Useful for users to implement custom management logic based on price conditions.
For example, users can choose to close the pending signal if the price moves too far from priceOpen.
Note: This is the current price at the time of the ping, not necessarily the priceOpen of the signal.

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

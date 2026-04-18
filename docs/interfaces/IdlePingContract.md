---
title: docs/interface/IdlePingContract
group: docs
---

# IdlePingContract

Contract for idle ping events when no signal is active.

Emitted by idlePingSubject every tick/minute when there is no pending
or scheduled signal being monitored.
Used for tracking idle strategy lifecycle.

Consumers:
- User callbacks via listenIdlePing() / listenIdlePingOnce()

## Properties

### symbol

```ts
symbol: string
```

Trading pair symbol (e.g., "BTCUSDT").

### strategyName

```ts
strategyName: string
```

Strategy name that is in idle state.

### exchangeName

```ts
exchangeName: string
```

Exchange name where this strategy is running.

### frameName

```ts
frameName: string
```

Frame name (if backtest)

### currentPrice

```ts
currentPrice: number
```

Current market price of the symbol at the time of the ping.

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

---
title: docs/interface/MaxDrawdownContract
group: docs
---

# MaxDrawdownContract

Contract for max drawdown updates emitted by the framework.
This contract defines the structure of the data emitted when a new maximum drawdown is reached for an open position.
It includes contextual information about the strategy, exchange, frame, and the associated signal.
Consumers can use this information to implement custom logic based on drawdown milestones (e.g. dynamic stop-loss adjustments, risk management).
The backtest flag allows consumers to differentiate between live and backtest updates for appropriate handling.
Max drawdown events are crucial for monitoring and managing risk, as they indicate the largest peak-to-trough decline in the position's value.
By tracking max drawdown, traders can make informed decisions to protect capital and optimize position management strategies.
The framework emits max drawdown updates whenever a new drawdown level is reached, allowing consumers to react in real-time to changing market conditions and position performance.

## Properties

### symbol

```ts
symbol: string
```

Trading symbol (e.g. "BTC/USDT")

### currentPrice

```ts
currentPrice: number
```

Current price at the time of the max drawdown update

### timestamp

```ts
timestamp: number
```

Timestamp of the max drawdown update (milliseconds since epoch)

### when

```ts
when: Date
```

Event time as a `Date` instance. Backtest mode: virtual execution time
(candle.timestamp of the processed candle); live mode: wall-clock time.
Always equal to `new Date(timestamp)`.

### strategyName

```ts
strategyName: string
```

Strategy name for context

### exchangeName

```ts
exchangeName: string
```

Exchange name for context

### frameName

```ts
frameName: string
```

Frame name for context (e.g. "1m", "5m")

### signal

```ts
signal: IPublicSignalRow
```

Public signal data for the position associated with this max drawdown update

### backtest

```ts
backtest: boolean
```

Indicates if the update is from a backtest or live trading (true for backtest, false for live)

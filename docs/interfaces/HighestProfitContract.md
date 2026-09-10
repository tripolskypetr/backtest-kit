---
title: docs/interface/HighestProfitContract
group: docs
---

# HighestProfitContract

Contract for highest profit updates emitted by the framework.
This contract defines the structure of the data emitted when a new highest profit is achieved for an open position.
It includes contextual information about the strategy, exchange, frame, and the associated signal.
Consumers can use this information to implement custom logic based on profit milestones (e.g. trailing stops, partial profit-taking).
The backtest flag allows consumers to differentiate between live and backtest updates for appropriate handling.

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

Current price at the time of the highest profit update

### timestamp

```ts
timestamp: number
```

Timestamp of the highest profit update (milliseconds since epoch)

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

Public signal data for the position associated with this highest profit update

### backtest

```ts
backtest: boolean
```

Indicates if the update is from a backtest or live trading (true for backtest, false for live)

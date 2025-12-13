---
title: docs/api-reference/interface/PartialLossContract
group: docs
---

# PartialLossContract

Contract for partial loss level events.

Emitted by partialLossSubject when a signal reaches a loss level milestone (-10%, -20%, -30%, etc).
Used for tracking partial stop-loss execution and monitoring strategy drawdown.

Events are emitted only once per level per signal (Set-based deduplication in ClientPartial).
Multiple levels can be emitted in a single tick if price drops significantly.

Consumers:
- PartialMarkdownService: Accumulates events for report generation
- User callbacks via listenPartialLoss() / listenPartialLossOnce()

## Properties

### symbol

```ts
symbol: string
```

Trading pair symbol (e.g., "BTCUSDT").
Identifies which market this loss event belongs to.

### strategyName

```ts
strategyName: string
```

Strategy name that generated this signal.
Identifies which strategy execution this loss event belongs to.

### exchangeName

```ts
exchangeName: string
```

Exchange name where this signal is being executed.
Identifies which exchange this loss event belongs to.

### data

```ts
data: ISignalRow
```

Complete signal row data.
Contains all signal information: id, position, priceOpen, priceTakeProfit, priceStopLoss, etc.

### currentPrice

```ts
currentPrice: number
```

Current market price at which this loss level was reached.
Used to calculate actual loss percentage.

### level

```ts
level: PartialLevel
```

Loss level milestone reached (10, 20, 30, 40, 50, 60, 70, 80, 90, or 100).
Represents percentage loss relative to entry price (absolute value).

Note: Stored as positive number, but represents negative loss.
level=20 means -20% loss from entry price.

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
- Live mode: when.getTime() at the moment loss level was detected
- Backtest mode: candle.timestamp of the candle that triggered the level

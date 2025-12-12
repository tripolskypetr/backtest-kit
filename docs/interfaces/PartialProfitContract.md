---
title: docs/api-reference/interface/PartialProfitContract
group: docs
---

# PartialProfitContract

Contract for partial profit level events.

Emitted by partialProfitSubject when a signal reaches a profit level milestone (10%, 20%, 30%, etc).
Used for tracking partial take-profit execution and monitoring strategy performance.

Events are emitted only once per level per signal (Set-based deduplication in ClientPartial).
Multiple levels can be emitted in a single tick if price jumps significantly.

Consumers:
- PartialMarkdownService: Accumulates events for report generation
- User callbacks via listenPartialProfit() / listenPartialProfitOnce()

## Properties

### symbol

```ts
symbol: string
```

Trading pair symbol (e.g., "BTCUSDT").
Identifies which market this profit event belongs to.

### strategyName

```ts
strategyName: string
```

Strategy name that generated this signal.
Identifies which strategy execution this profit event belongs to.

### exchangeName

```ts
exchangeName: string
```

Exchange name where this signal is being executed.
Identifies which exchange this profit event belongs to.

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

Current market price at which this profit level was reached.
Used to calculate actual profit percentage.

### level

```ts
level: PartialLevel
```

Profit level milestone reached (10, 20, 30, 40, 50, 60, 70, 80, 90, or 100).
Represents percentage profit relative to entry price.

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
- Live mode: when.getTime() at the moment profit level was detected
- Backtest mode: candle.timestamp of the candle that triggered the level

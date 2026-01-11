---
title: docs/interface/BreakevenContract
group: docs
---

# BreakevenContract

Contract for breakeven events.

Emitted by breakevenSubject when a signal's stop-loss is moved to breakeven (entry price).
Used for tracking risk reduction milestones and monitoring strategy safety.

Events are emitted only once per signal (idempotent - protected by ClientBreakeven state).
Breakeven is triggered when price moves far enough in profit direction to cover transaction costs.

Consumers:
- BreakevenMarkdownService: Accumulates events for report generation
- User callbacks via listenBreakeven() / listenBreakevenOnce()

## Properties

### symbol

```ts
symbol: string
```

Trading pair symbol (e.g., "BTCUSDT").
Identifies which market this breakeven event belongs to.

### strategyName

```ts
strategyName: string
```

Strategy name that generated this signal.
Identifies which strategy execution this breakeven event belongs to.

### exchangeName

```ts
exchangeName: string
```

Exchange name where this signal is being executed.
Identifies which exchange this breakeven event belongs to.

### frameName

```ts
frameName: string
```

Frame name where this signal is being executed.
Identifies which frame this breakeven event belongs to (empty string for live mode).

### data

```ts
data: IPublicSignalRow
```

Complete signal row data with original prices.
Contains all signal information including originalPriceStopLoss, originalPriceTakeProfit, and totalExecuted.

### currentPrice

```ts
currentPrice: number
```

Current market price at which breakeven was triggered.
Used to verify threshold calculation.

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
- Live mode: when.getTime() at the moment breakeven was set
- Backtest mode: candle.timestamp of the candle that triggered breakeven

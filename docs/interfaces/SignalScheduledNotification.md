---
title: docs/interface/SignalScheduledNotification
group: docs
---

# SignalScheduledNotification

Scheduled signal notification.
Emitted when a signal is scheduled for future execution.

## Properties

### type

```ts
type: "signal.scheduled"
```

Discriminator for type-safe union

### id

```ts
id: string
```

Unique notification identifier

### timestamp

```ts
timestamp: number
```

Unix timestamp in milliseconds when signal was scheduled (scheduledAt)

### backtest

```ts
backtest: boolean
```

Whether this notification is from backtest mode (true) or live mode (false)

### symbol

```ts
symbol: string
```

Trading pair symbol (e.g., "BTCUSDT")

### strategyName

```ts
strategyName: string
```

Strategy name that generated this signal

### exchangeName

```ts
exchangeName: string
```

Exchange name where signal will be executed

### signalId

```ts
signalId: string
```

Unique signal identifier (UUID v4)

### position

```ts
position: "long" | "short"
```

Trade direction: "long" (buy) or "short" (sell)

### priceOpen

```ts
priceOpen: number
```

Target entry price for activation

### priceTakeProfit

```ts
priceTakeProfit: number
```

Take profit target price

### priceStopLoss

```ts
priceStopLoss: number
```

Stop loss exit price

### originalPriceTakeProfit

```ts
originalPriceTakeProfit: number
```

Original take profit price before any trailing adjustments

### originalPriceStopLoss

```ts
originalPriceStopLoss: number
```

Original stop loss price before any trailing adjustments

### originalPriceOpen

```ts
originalPriceOpen: number
```

Original entry price at signal creation (unchanged by DCA averaging)

### totalEntries

```ts
totalEntries: number
```

Total number of DCA entries (_entry.length). 1 = no averaging.

### totalPartials

```ts
totalPartials: number
```

Total number of partial closes executed (_partial.length). 0 = no partial closes done.

### cost

```ts
cost: number
```

Cost of the initial position entry in USD (from signal.cost)

### pnl

```ts
pnl: IStrategyPnL
```

Unrealized PNL at the moment of signal scheduled (from signal.pnl)

### pnlPercentage

```ts
pnlPercentage: number
```

Profit/loss as percentage (e.g., 1.5 for +1.5%, -2.3 for -2.3%)

### pnlPriceOpen

```ts
pnlPriceOpen: number
```

Entry price from PNL calculation (effective price adjusted with slippage and fees)

### pnlPriceClose

```ts
pnlPriceClose: number
```

Exit price from PNL calculation (adjusted with slippage and fees)

### pnlCost

```ts
pnlCost: number
```

Absolute profit/loss in USD

### pnlEntries

```ts
pnlEntries: number
```

Total invested capital in USD

### scheduledAt

```ts
scheduledAt: number
```

Unix timestamp in milliseconds when signal was scheduled

### currentPrice

```ts
currentPrice: number
```

Current market price when signal was scheduled

### note

```ts
note: string
```

Optional human-readable description of signal reason

### createdAt

```ts
createdAt: number
```

Unix timestamp in milliseconds when the tick result was created (from candle timestamp in backtest or execution context when in live)

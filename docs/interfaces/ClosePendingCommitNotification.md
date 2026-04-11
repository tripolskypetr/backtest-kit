---
title: docs/interface/ClosePendingCommitNotification
group: docs
---

# ClosePendingCommitNotification

Close pending commit notification.
Emitted when a pending signal is closed before position activation.

## Properties

### type

```ts
type: "close_pending.commit"
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

Unix timestamp in milliseconds when close was committed

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

Exchange name where signal was executed

### signalId

```ts
signalId: string
```

Unique signal identifier (UUID v4)

### closeId

```ts
closeId: string
```

Optional identifier for the close reason (user-provided)

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

### originalPriceOpen

```ts
originalPriceOpen: number
```

Original entry price at signal creation (unchanged by DCA averaging)

### pnl

```ts
pnl: IStrategyPnL
```

PNL at the moment of close (from data.pnl)

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

### note

```ts
note: string
```

Optional human-readable description of signal reason

### createdAt

```ts
createdAt: number
```

Unix timestamp in milliseconds when the notification was created

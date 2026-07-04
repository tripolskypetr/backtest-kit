---
title: docs/interface/TickEvent
group: docs
---

# TickEvent

Unified tick event data for report generation.
Contains all information about a tick event regardless of action type.

## Properties

### timestamp

```ts
timestamp: number
```

Event timestamp in milliseconds (scheduledAt for scheduled events, pendingAt for opened/closed events)

### action

```ts
action: "scheduled" | "cancelled" | "opened" | "closed" | "active" | "idle" | "waiting"
```

Event action type

### symbol

```ts
symbol: string
```

Trading pair symbol (only for non-idle events)

### signalId

```ts
signalId: string
```

Signal ID (only for scheduled/waiting/opened/active/closed/cancelled)

### position

```ts
position: string
```

Position type (only for scheduled/waiting/opened/active/closed/cancelled)

### note

```ts
note: string
```

Signal note (only for scheduled/waiting/opened/active/closed/cancelled)

### currentPrice

```ts
currentPrice: number
```

Current price

### priceOpen

```ts
priceOpen: number
```

Open price (only for scheduled/waiting/opened/active/closed/cancelled)

### priceTakeProfit

```ts
priceTakeProfit: number
```

Take profit price (only for scheduled/waiting/opened/active/closed/cancelled)

### priceStopLoss

```ts
priceStopLoss: number
```

Stop loss price (only for scheduled/waiting/opened/active/closed/cancelled)

### originalPriceTakeProfit

```ts
originalPriceTakeProfit: number
```

Original take profit price before modifications (only for scheduled/waiting/opened/active/closed/cancelled)

### originalPriceStopLoss

```ts
originalPriceStopLoss: number
```

Original stop loss price before modifications (only for scheduled/waiting/opened/active/closed/cancelled)

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

Total number of partial closes executed (_partial.length)

### partialExecuted

```ts
partialExecuted: number
```

Total executed percentage from partial closes (only for scheduled/waiting/opened/active/closed/cancelled)

### pnlCost

```ts
pnlCost: number
```

Absolute profit/loss in USD (for active/waiting: unrealized, for closed: realized)

### pnlEntries

```ts
pnlEntries: number
```

Total invested capital in USD

### percentTp

```ts
percentTp: number
```

Percentage progress towards take profit (only for active/waiting)

### percentSl

```ts
percentSl: number
```

Percentage progress towards stop loss (only for active/waiting)

### pnl

```ts
pnl: number
```

PNL percentage (for active/waiting: unrealized, for closed: realized)

### closeReason

```ts
closeReason: string
```

Close reason (only for closed)

### cancelReason

```ts
cancelReason: string
```

Cancel reason (only for cancelled)

### duration

```ts
duration: number
```

Duration in minutes (only for closed)

### pendingAt

```ts
pendingAt: number
```

Timestamp when position became active (only for opened/active/closed)

### scheduledAt

```ts
scheduledAt: number
```

Timestamp when signal was created/scheduled (only for scheduled/waiting/opened/active/closed/cancelled)

### peakPnl

```ts
peakPnl: number
```

Peak PNL percentage at best price during position (_peak.pnlPercentage, only for closed)

### fallPnl

```ts
fallPnl: number
```

Fall PNL percentage at worst price during position (_fall.pnlPercentage, only for closed)

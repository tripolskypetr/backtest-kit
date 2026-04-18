---
title: docs/interface/StrategyEvent
group: docs
---

# StrategyEvent

Unified strategy event data for markdown report generation.
Contains all information about strategy management actions.

## Properties

### timestamp

```ts
timestamp: number
```

Event timestamp in milliseconds

### symbol

```ts
symbol: string
```

Trading pair symbol

### strategyName

```ts
strategyName: string
```

Strategy name

### exchangeName

```ts
exchangeName: string
```

Exchange name

### frameName

```ts
frameName: string
```

Frame name (empty for live)

### signalId

```ts
signalId: string
```

Signal ID

### action

```ts
action: StrategyActionType
```

Action type

### currentPrice

```ts
currentPrice: number
```

Current market price when action was executed

### percentToClose

```ts
percentToClose: number
```

Percent to close for partial profit/loss

### percentShift

```ts
percentShift: number
```

Percent shift for trailing stop/take

### cancelId

```ts
cancelId: string
```

Cancel ID for cancel-scheduled action

### closeId

```ts
closeId: string
```

Close ID for close-pending action

### activateId

```ts
activateId: string
```

Activate ID for activate-scheduled action

### createdAt

```ts
createdAt: string
```

ISO timestamp string when action was created

### backtest

```ts
backtest: boolean
```

True if backtest mode, false if live mode

### position

```ts
position: "long" | "short"
```

Trade direction: "long" (buy) or "short" (sell)

### priceOpen

```ts
priceOpen: number
```

Entry price for the position

### priceTakeProfit

```ts
priceTakeProfit: number
```

Effective take profit price (with trailing if set)

### priceStopLoss

```ts
priceStopLoss: number
```

Effective stop loss price (with trailing if set)

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

### scheduledAt

```ts
scheduledAt: number
```

Signal creation timestamp in milliseconds (when signal was first created/scheduled)

### pendingAt

```ts
pendingAt: number
```

Pending timestamp in milliseconds (when position became pending/active at priceOpen)

### effectivePriceOpen

```ts
effectivePriceOpen: number
```

Averaged entry price after DCA addition (average-buy action only)

### totalEntries

```ts
totalEntries: number
```

Total number of DCA entries after this addition (average-buy action only)

### totalPartials

```ts
totalPartials: number
```

Total number of partial closes executed (_partial.length)

### pnl

```ts
pnl: IStrategyPnL
```

PNL at the moment of this action

### cost

```ts
cost: number
```

Cost of this entry in USD (average-buy action only)

### note

```ts
note: string
```

Optional note from commit payload

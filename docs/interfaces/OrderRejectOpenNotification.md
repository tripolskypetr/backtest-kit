---
title: docs/interface/OrderRejectOpenNotification
group: docs
---

# OrderRejectOpenNotification

Order reject notification (TERMINAL open/placement rejection).
Emitted ONLY when the open gate resolved into the "rejected" verdict — the broker
adapter threw OrderRejectedError ("the exchange definitively refused this order,
retrying is pointless"). Exactly once per dropped attempt: the rejected signalId
is consumed by the whipsaw guard, so this cannot repeat per-tick for one signal.
Transient failures never fire here (they retry silently). Live-only.
Source: `orderRejectSubject` (OrderRejectContract).

## Properties

### type

```ts
type: "order_reject.open"
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

Unix timestamp in milliseconds when the gate rejected

### backtest

```ts
backtest: boolean
```

Always false: rejections are live-only (kept for cross-channel filter uniformity)

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

Exchange name that refused the order

### signalId

```ts
signalId: string
```

Unique signal identifier (UUID v4) — equals the adapter's clientOrderId

### orderType

```ts
orderType: "schedule" | "active"
```

Which order was rejected (from OrderRejectContract.type):
- "active" — the position order (immediate open or activation fill)
- "schedule" — the resting entry order being placed at scheduled-signal creation

### attempt

```ts
attempt: number
```

Number of consecutive failed gate attempts that preceded this terminal one (0 = rejected on the first attempt)

### message

```ts
message: string
```

Human-readable rejection reason (the OrderRejectedError message from the broker adapter)

### currentPrice

```ts
currentPrice: number
```

Market price at the moment of rejection (VWAP)

### pnl

```ts
pnl: IStrategyPnL
```

PNL snapshot of the position at the moment of this event

### peakProfit

```ts
peakProfit: IStrategyPnL
```

Peak profit achieved during the life of this position up to the moment this public signal was created

### maxDrawdown

```ts
maxDrawdown: IStrategyPnL
```

Maximum drawdown experienced during the life of this position up to the moment this public signal was created

### pnlPercentage

```ts
pnlPercentage: number
```

Profit/loss as percentage

### pnlPriceOpen

```ts
pnlPriceOpen: number
```

Entry price from PNL calculation

### pnlPriceClose

```ts
pnlPriceClose: number
```

Exit price from PNL calculation

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

### peakProfitPriceOpen

```ts
peakProfitPriceOpen: number
```

Peak price reached in profit direction during the life of this position

### peakProfitPriceClose

```ts
peakProfitPriceClose: number
```

Exit price for PNL calculation at the moment of peak profit

### peakProfitCost

```ts
peakProfitCost: number
```

Absolute profit/loss in USD at the moment the position reached its peak profit during the life of this position

### peakProfitPercentage

```ts
peakProfitPercentage: number
```

Profit/loss as percentage at the moment the position reached its peak profit during the life of this position

### peakProfitEntries

```ts
peakProfitEntries: number
```

Number of entries executed at the moment the position reached its peak profit during the life of this position

### maxDrawdownPriceOpen

```ts
maxDrawdownPriceOpen: number
```

Maximum drawdown price reached in loss direction during the life of this position

### maxDrawdownPriceClose

```ts
maxDrawdownPriceClose: number
```

Exit price for PNL calculation at the moment of max drawdown

### maxDrawdownCost

```ts
maxDrawdownCost: number
```

Absolute profit/loss in USD at the moment the position reached its maximum drawdown during the life of this position

### maxDrawdownPercentage

```ts
maxDrawdownPercentage: number
```

Profit/loss as percentage at the moment the position reached its maximum drawdown during the life of this position

### maxDrawdownEntries

```ts
maxDrawdownEntries: number
```

Number of entries executed at the moment the position reached its maximum drawdown during the life of this position

### cost

```ts
cost: number
```

Cost of the position entry in USD

### position

```ts
position: "long" | "short"
```

Trade direction: "long" (buy) or "short" (sell)

### priceOpen

```ts
priceOpen: number
```

Effective entry price (DCA-averaged when entries exist)

### priceTakeProfit

```ts
priceTakeProfit: number
```

Effective take profit price (trailing-aware)

### priceStopLoss

```ts
priceStopLoss: number
```

Effective stop loss price (trailing-aware)

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

Original entry price before any DCA averaging

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

### scheduledAt

```ts
scheduledAt: number
```

Signal creation timestamp in milliseconds

### pendingAt

```ts
pendingAt: number
```

Position activation timestamp in milliseconds

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

---
title: docs/interface/OrderStopCheckNotification
group: docs
---

# OrderStopCheckNotification

Order-check STOP notification (post-verdict pair of `order_sync.check`).
Emitted exactly once per monitored signal when the check resolved TERMINALLY —
`reason` "deleted" (OrderDeletedError: confirmed order-not-found, bypassing the
tolerance counter) or "exhausted" (CC_ORDER_CHECK_RETRY_ATTEMPTS consecutive
transient failures spent, or the legacy config 0) — right before the teardown:
close "closed" for `orderType` "active", cancel "user" for "schedule". Not
throttled (rare terminal event). Live-only.
Source: `orderStopSubject` (OrderStopContract).

## Properties

### type

```ts
type: "order_stop.check"
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

Unix timestamp in milliseconds when the check decision was made

### backtest

```ts
backtest: boolean
```

Always false: order checks are live-only (kept for cross-channel filter uniformity)

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

### orderType

```ts
orderType: "schedule" | "active"
```

Which order was monitored (from OrderStopContract.type):
- "active" — the order backing an open position; the framework closes it with closeReason "closed"
- "schedule" — the resting entry order; the framework cancels the scheduled signal (reason "user")

### reason

```ts
reason: "deleted" | "exhausted"
```

Which terminal path fired: confirmed not-found ("deleted") or tolerance spent ("exhausted")

### attempt

```ts
attempt: number
```

Consecutive-failure streak at termination (includes the terminating check)

### currentPrice

```ts
currentPrice: number
```

Market price at the moment of the check (VWAP)

### position

```ts
position: "long" | "short"
```

Trade direction: "long" (buy) or "short" (sell)

### priceOpen

```ts
priceOpen: number
```

Effective entry price (may differ from original after DCA averaging)

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

### pnl

```ts
pnl: IStrategyPnL
```

Unrealized PNL of the position at the moment of the check

### peakProfit

```ts
peakProfit: IStrategyPnL
```

Peak profit achieved during the life of this position up to the moment of the check

### maxDrawdown

```ts
maxDrawdown: IStrategyPnL
```

Maximum drawdown experienced during the life of this position up to the moment of the check

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

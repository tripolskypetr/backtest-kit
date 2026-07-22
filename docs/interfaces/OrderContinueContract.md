---
title: docs/interface/OrderContinueContract
group: docs
---

# OrderContinueContract

Post-verdict order-check CONTINUE event.

The pre-verdict OrderCheckContract (syncPendingSubject) is the ping REQUEST —
it fires before the broker adapter answers. This event is its resolved
counterpart for the NON-terminal outcome: the framework decided the order is
still open on the exchange and monitoring CONTINUES. Emitted on every live
tick while the signal survives the check, discriminated by `type`:
- `type: "active"` — the order backing an open position (pending signal);
- `type: "schedule"` — the resting entry order of a scheduled signal.

`attempt` tells which continue-path fired:
- 0 — the check CONFIRMED the order (healthy; the failure streak was reset);
- &gt;0 — the check FAILED transiently and was TOLERATED (order assumed still
  open) — the value is the current consecutive-failure streak, bounded by
  CC_ORDER_CHECK_RETRY_ATTEMPTS before the terminal path fires instead
  (see OrderStopContract).

Live-only: backtest never runs order checks. Notification-only channel:
listener exceptions are swallowed at the emission site (logged + errorEmitter)
and never affect the already-made monitoring decision.

## Properties

### type

```ts
type: "schedule" | "active"
```

Monitored state: "active" — open position order, "schedule" — resting entry order

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

### frameName

```ts
frameName: string
```

Timeframe name (empty string in live mode)

### backtest

```ts
backtest: boolean
```

Always false: order checks are live-only (kept for cross-channel filter uniformity)

### signalId

```ts
signalId: string
```

Unique signal identifier (UUID v4)

### timestamp

```ts
timestamp: number
```

Timestamp from execution context (tick's when)

### signal

```ts
signal: IPublicSignalRow
```

Complete public signal row at the moment of this event

### attempt

```ts
attempt: number
```

Consecutive-failure streak at the moment of this decision: 0 — the check
confirmed the order (healthy), &gt;0 — this many consecutive transient
failures are currently tolerated (order assumed still open).

### currentPrice

```ts
currentPrice: number
```

Market price at the moment of the check (VWAP)

### pnl

```ts
pnl: IStrategyPnL
```

Unrealized PNL of the position at the moment of this event

### peakProfit

```ts
peakProfit: IStrategyPnL
```

Peak profit achieved during the life of this position up to this event

### maxDrawdown

```ts
maxDrawdown: IStrategyPnL
```

Maximum drawdown experienced during the life of this position up to this event

### position

```ts
position: "long" | "short"
```

Trade direction: "long" (buy) or "short" (sell)

### priceOpen

```ts
priceOpen: number
```

Effective entry price (may differ from priceOpen after DCA averaging)

### priceTakeProfit

```ts
priceTakeProfit: number
```

Effective take profit price (may differ from original after trailing)

### priceStopLoss

```ts
priceStopLoss: number
```

Effective stop loss price (may differ from original after trailing)

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

Original entry price before any DCA averaging (initial priceOpen)

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

### totalEntries

```ts
totalEntries: number
```

Total number of DCA entries (_entry.length). 1 = no averaging done.

### totalPartials

```ts
totalPartials: number
```

Total number of partial closes executed (_partial.length). 0 = none.

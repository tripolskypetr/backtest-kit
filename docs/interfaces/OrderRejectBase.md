---
title: docs/interface/OrderRejectBase
group: docs
---

# OrderRejectBase

Base fields shared by all TERMINAL order rejection events.

Emitted by orderRejectSubject strictly when the onOrderSync gate resolved into
the terminal "rejected" verdict — the broker adapter threw OrderRejectedError
("the exchange definitively refused this order, retrying is pointless").
Post-verdict mirror of the rejection branch, the counterpart of the confirmed
OrderFillContract channel.

Exactly once per dropped order attempt:
- action "signal-open": the open is dropped for good and the rejected signalId
  is consumed by the whipsaw guard — the same id is never re-sent, so this
  event cannot repeat per-tick for one signal;
- action "signal-close": the engine force-closes its state with the original
  closeReason; the real exchange position is the adapter's/operator's to
  reconcile.

NOT emitted:
- on transient failures (plain Error / OrderTransientError — those retry
  silently within the bounded budgets);
- in backtest mode (the gate short-circuits to "confirmed" without an exchange).

Listener exceptions are swallowed at the emission site (logged + errorEmitter) —
this is a notification-only channel and must never affect the resolved verdict.

## Properties

### type

```ts
type: "schedule" | "active"
```

Which order was rejected:
- "active" — the position order (immediate open, activation fill, close);
- "schedule" — the resting entry order being PLACED at scheduled-signal
  creation (action "signal-open" only).

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

### frameName

```ts
frameName: string
```

Timeframe name (empty string in live mode)

### backtest

```ts
backtest: boolean
```

Always false: rejections are live-only (kept for cross-channel filter uniformity)

### signalId

```ts
signalId: string
```

Unique signal identifier (UUID v4) — equals the adapter's clientOrderId

### timestamp

```ts
timestamp: number
```

Timestamp from execution context at the moment the gate rejected

### signal

```ts
signal: IPublicSignalRow
```

Complete public signal row at the moment of this event

### attempt

```ts
attempt: number
```

Number of CONSECUTIVE failed gate attempts that preceded this TERMINAL one
(0 = rejected on the first attempt).

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

Peak profit achieved during the life of this position so far

### maxDrawdown

```ts
maxDrawdown: IStrategyPnL
```

Maximum drawdown experienced during the life of this position so far

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

Total number of DCA entries (_entry.length); 1 = no averaging

### totalPartials

```ts
totalPartials: number
```

Total number of partial closes executed (_partial.length)

### message

```ts
message: string
```

Human-readable rejection reason (the OrderRejectedError message from the broker adapter)

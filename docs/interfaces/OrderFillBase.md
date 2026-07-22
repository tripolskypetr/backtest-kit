---
title: docs/interface/OrderFillBase
group: docs
---

# OrderFillBase

Base fields shared by all broker-CONFIRMED order fill events.

A fill event is NOT a sync event: OrderSyncContract is the pre-verdict gate
REQUEST (fired before the broker adapter runs — a rejected or transient attempt
still emits there), while OrderFillContract is built ONLY after the onOrderSync
gate resolved into the "confirmed" IBrokerOrderVerdict — the broker acknowledged
the order really executed/placed on the exchange. This is the channel for
notifications and audit trails that must never fire on a mere attempt.

NOT emitted:
- in backtest mode (the gate short-circuits to "confirmed" without any exchange —
  nothing actually filled);
- on "transient"/"rejected"/"deleted" verdicts;
- on a FORCE-close (close-retry budget exhausted / terminal rejection): the engine
  tears its state down WITHOUT broker confirmation, so no fill exists to report.

Listener exceptions are swallowed at the emission site (logged + errorEmitter) —
this is a notification-only channel and must never affect the resolved verdict.

## Properties

### type

```ts
type: "schedule" | "active"
```

Which order was confirmed:
- "active" — the position order: immediate open, activation fill of a resting
  order, and every close.
- "schedule" — the resting entry order was PLACED on the exchange when a
  scheduled signal was created (action "signal-open" only; a placement is not
  a position fill — filter by type when strict fill semantics matter).

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

Exchange name where the order executed

### frameName

```ts
frameName: string
```

Timeframe name (empty string in live mode)

### backtest

```ts
backtest: boolean
```

Always false: fills are live-only (kept for cross-channel filter uniformity)

### signalId

```ts
signalId: string
```

Unique signal identifier (UUID v4) — equals the adapter's clientOrderId

### timestamp

```ts
timestamp: number
```

Timestamp from execution context at the moment the gate confirmed

### signal

```ts
signal: IPublicSignalRow
```

Complete public signal row at the moment of this event

### attempt

```ts
attempt: number
```

Number of CONSECUTIVE failed gate attempts that preceded this CONFIRMED one
(0 = confirmed on the first attempt).

### currentPrice

```ts
currentPrice: number
```

Market price at the moment of confirmation (VWAP)

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

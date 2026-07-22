---
title: docs/interface/OrderStopContract
group: docs
---

# OrderStopContract

Post-verdict order-check STOP event.

The terminal counterpart of OrderContinueContract: the framework decided the
order behind the monitored signal is NO LONGER open on the exchange and acts
terminally — for `type: "active"` the pending position closes with closeReason
"closed", for `type: "schedule"` the scheduled signal cancels (reason "user").
Emitted exactly once per monitored signal, right BEFORE the teardown runs.

`reason` tells which terminal path fired:
- "deleted" — the adapter threw OrderDeletedError: the CONFIRMED "order not
  found by id" (filled, cancelled or liquidated externally), terminal at once,
  bypassing the tolerance counter;
- "exhausted" — CC_ORDER_CHECK_RETRY_ATTEMPTS consecutive transient failures
  spent (or the config is 0 — legacy: any failure is terminal on the spot).
  For genuine network exhaustion the engine also signals a fatal exit.

Live-only: backtest never runs order checks. Notification-only channel:
listener exceptions are swallowed at the emission site (logged + errorEmitter)
and never affect the already-made terminal decision.

## Properties

### type

```ts
type: "schedule" | "active"
```

Monitored state: "active" — open position order, "schedule" — resting entry order

### reason

```ts
reason: "deleted" | "exhausted"
```

Which terminal path fired: confirmed not-found ("deleted") or tolerance spent ("exhausted")

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

Consecutive-failure streak at termination (0 for an immediate "deleted" verdict)

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

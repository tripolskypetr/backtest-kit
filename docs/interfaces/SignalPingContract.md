---
title: docs/interface/SignalPingContract
group: docs
---

# SignalPingContract

Signal pending-ping sync event.

Emitted on every live tick while a pending signal (open position) is being monitored,
BEFORE the framework evaluates TP/SL/time completion. It asks the external order
management system whether the corresponding order is STILL pending (open) on the exchange.

Listener contract (mirrors syncSubject semantics):
- Return true (or do nothing) — the order is still open on the exchange, keep monitoring.
- Return false OR throw — the order is no longer open on the exchange (filled, cancelled,
  liquidated externally). The framework closes the pending signal with closeReason "closed".

Backtest never emits this event — there is no live exchange to query.

Consumers:
- Broker adapter via `onOrderPing` (syncPendingSubject subscription)
- Registered actions via `orderPing` / `onOrderPing`

## Properties

### action

```ts
action: "signal-ping"
```

Discriminator for pending-ping action

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

Whether this event is from backtest mode (true) or live mode (false) — always false in practice

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

### currentPrice

```ts
currentPrice: number
```

Market price at the moment of the ping (VWAP)

### pnl

```ts
pnl: IStrategyPnL
```

Unrealized PNL of the open position at the moment of the ping

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

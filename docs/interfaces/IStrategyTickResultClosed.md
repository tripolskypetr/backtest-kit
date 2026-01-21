---
title: docs/interface/IStrategyTickResultClosed
group: docs
---

# IStrategyTickResultClosed

Tick result: signal closed with PNL.
Final state with close reason and profit/loss calculation.

## Properties

### action

```ts
action: "closed"
```

Discriminator for type-safe union

### signal

```ts
signal: IPublicSignalRow
```

Completed signal with original parameters

### currentPrice

```ts
currentPrice: number
```

Final VWAP price at close

### closeReason

```ts
closeReason: StrategyCloseReason
```

Why signal closed (time_expired &vert; take_profit | stop_loss | closed)

### closeTimestamp

```ts
closeTimestamp: number
```

Unix timestamp in milliseconds when signal closed

### pnl

```ts
pnl: IStrategyPnL
```

Profit/loss calculation with fees and slippage

### strategyName

```ts
strategyName: string
```

Strategy name for tracking

### exchangeName

```ts
exchangeName: string
```

Exchange name for tracking

### frameName

```ts
frameName: string
```

Time frame name for tracking (e.g., "1m", "5m")

### symbol

```ts
symbol: string
```

Trading pair symbol (e.g., "BTCUSDT")

### backtest

```ts
backtest: boolean
```

Whether this event is from backtest mode (true) or live mode (false)

### closeId

```ts
closeId: string
```

Close ID (only for user-initiated closes with reason "closed")

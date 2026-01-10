---
title: docs/interface/ISignalRow
group: docs
---

# ISignalRow

Complete signal with auto-generated id.
Used throughout the system after validation.

## Properties

### id

```ts
id: string
```

Unique signal identifier (UUID v4 auto-generated)

### priceOpen

```ts
priceOpen: number
```

Entry price for the position

### exchangeName

```ts
exchangeName: string
```

Unique exchange identifier for execution

### strategyName

```ts
strategyName: string
```

Unique strategy identifier for execution

### frameName

```ts
frameName: string
```

Unique frame identifier for execution (empty string for live mode)

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

### symbol

```ts
symbol: string
```

Trading pair symbol (e.g., "BTCUSDT")

### _isScheduled

```ts
_isScheduled: boolean
```

Internal runtime marker for scheduled signals

### _partial

```ts
_partial: { type: "profit" | "loss"; percent: number; price: number; }[]
```

History of partial closes for PNL calculation.
Each entry contains type (profit/loss), percent closed, and price.
Used to calculate weighted PNL: Σ(percent_i × pnl_i) for each partial + (remaining% × final_pnl)

Computed values (derived from this array):
- _tpClosed: Sum of all "profit" type partial close percentages
- _slClosed: Sum of all "loss" type partial close percentages
- _totalClosed: Sum of all partial close percentages (profit + loss)

### _trailingPriceStopLoss

```ts
_trailingPriceStopLoss: number
```

Trailing stop-loss price that overrides priceStopLoss when set.
Updated by trailing() method based on position type and percentage distance.
- For LONG: moves upward as price moves toward TP (never moves down)
- For SHORT: moves downward as price moves toward TP (never moves up)
When _trailingPriceStopLoss is set, it replaces priceStopLoss for TP/SL checks.
Original priceStopLoss is preserved in persistence but ignored during execution.

### _trailingPriceTakeProfit

```ts
_trailingPriceTakeProfit: number
```

Trailing take-profit price that overrides priceTakeProfit when set.
Created and managed by trailingProfit() method for dynamic TP adjustment.
Allows moving TP further from or closer to current price based on strategy.
Updated by trailingProfit() method based on position type and percentage distance.
- For LONG: can move upward (further) or downward (closer) from entry
- For SHORT: can move downward (further) or upward (closer) from entry
When _trailingPriceTakeProfit is set, it replaces priceTakeProfit for TP/SL checks.
Original priceTakeProfit is preserved in persistence but ignored during execution.

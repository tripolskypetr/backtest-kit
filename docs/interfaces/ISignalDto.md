---
title: docs/interface/ISignalDto
group: docs
---

# ISignalDto

Signal data transfer object returned by getSignal.
Will be validated and augmented with auto-generated id.

## Properties

### id

```ts
id: string
```

Optional signal ID (auto-generated if not provided)

### symbol

```ts
symbol: string
```

Symbol of a ticker on exchange

### position

```ts
position: "long" | "short"
```

Trade direction: "long" (buy) or "short" (sell)

### note

```ts
note: string
```

Human-readable description of signal reason

### priceOpen

```ts
priceOpen: number
```

Entry price for the position

### priceTakeProfit

```ts
priceTakeProfit: number
```

Take profit target price (must be &gt; priceOpen for long, &lt; priceOpen for short)

### priceStopLoss

```ts
priceStopLoss: number
```

Stop loss exit price (must be &lt; priceOpen for long, &gt; priceOpen for short)

### minuteEstimatedTime

```ts
minuteEstimatedTime: number
```

Expected duration in minutes before time_expired.
Use `Infinity` for no timeout — position stays open until TP/SL or explicit closePending().
Default: GLOBAL_CONFIG.CC_MAX_SIGNAL_LIFETIME_MINUTES

### cost

```ts
cost: number
```

Cost of this entry in USD. Default: GLOBAL_CONFIG.CC_POSITION_ENTRY_COST

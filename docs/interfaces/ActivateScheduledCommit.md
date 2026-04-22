---
title: docs/interface/ActivateScheduledCommit
group: docs
---

# ActivateScheduledCommit

Activate scheduled signal event.

## Properties

### action

```ts
action: "activate-scheduled"
```

Discriminator for activate-scheduled action

### activateId

```ts
activateId: string
```

Optional identifier for the activation reason (user-provided)

### currentPrice

```ts
currentPrice: number
```

Current market price at time of activation

### pnl

```ts
pnl: IStrategyPnL
```

Total PNL of the closed position (including all entries and partials)

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

### position

```ts
position: "long" | "short"
```

Trade direction: "long" (buy) or "short" (sell)

### priceOpen

```ts
priceOpen: number
```

Entry price for the position

### priceTakeProfit

```ts
priceTakeProfit: number
```

Effective take profit price

### priceStopLoss

```ts
priceStopLoss: number
```

Effective stop loss price

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

### scheduledAt

```ts
scheduledAt: number
```

Signal creation timestamp in milliseconds

### pendingAt

```ts
pendingAt: number
```

Position activation timestamp in milliseconds (set during this activation)

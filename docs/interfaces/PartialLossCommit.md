---
title: docs/interface/PartialLossCommit
group: docs
---

# PartialLossCommit

Partial loss event.

## Properties

### action

```ts
action: "partial-loss"
```

Discriminator for partial-loss action

### percentToClose

```ts
percentToClose: number
```

Percentage of position to close (0-100)

### currentPrice

```ts
currentPrice: number
```

Current market price at time of action

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

### scheduledAt

```ts
scheduledAt: number
```

Signal creation timestamp in milliseconds

### pendingAt

```ts
pendingAt: number
```

Position activation timestamp in milliseconds (when price reached priceOpen)

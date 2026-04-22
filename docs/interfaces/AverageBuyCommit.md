---
title: docs/interface/AverageBuyCommit
group: docs
---

# AverageBuyCommit

Average-buy (DCA) event.
Emitted when a new averaging entry is added to an open position.

## Properties

### action

```ts
action: "average-buy"
```

Discriminator for average-buy action

### currentPrice

```ts
currentPrice: number
```

Price at which the new averaging entry was executed

### cost

```ts
cost: number
```

Cost of this averaging entry in USD

### effectivePriceOpen

```ts
effectivePriceOpen: number
```

Effective (averaged) entry price after this addition

### pnl

```ts
pnl: IStrategyPnL
```

Unrealized PNL at the moment of average-buy (calculated after new entry added)

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

Original entry price (signal.priceOpen, unchanged by averaging)

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

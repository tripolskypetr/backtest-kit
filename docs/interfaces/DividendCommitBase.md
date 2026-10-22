---
title: docs/interface/DividendCommitBase
group: docs
---

# DividendCommitBase

Fields shared by the dividend / staking accrual events.

## Properties

### accrualType

```ts
accrualType: AccrualType
```

"cash" (USD) or "asset" (units of the traded asset)

### amount

```ts
amount: number
```

Signed amount of the accrual (positive = credit, negative = charge): USD for "cash", asset units for "asset"

### currentPrice

```ts
currentPrice: number
```

Market price at the moment of the event (values "asset" accruals)

### pnlDividends

```ts
pnlDividends: number
```

USD value of ALL accruals of the position after this event (pnl.pnlDividends)

### totalAccruals

```ts
totalAccruals: number
```

Total number of accruals on the position after this event

### pnl

```ts
pnl: IStrategyPnL
```

Unrealized PNL at the moment of the event (accruals included)

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

Effective (DCA-averaged) entry price

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

Position activation timestamp in milliseconds

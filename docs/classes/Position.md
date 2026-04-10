---
title: docs/class/Position
group: docs
---

# Position

Utilities for calculating take profit and stop loss price levels.
Automatically inverts direction based on position type (long/short).

## Constructor

```ts
constructor();
```

## Properties

### moonbag

```ts
moonbag: (dto: { position: "long" | "short"; currentPrice: number; percentStopLoss: number; }) => { position: "long" | "short"; priceTakeProfit: number; priceStopLoss: number; }
```

Calculates levels for the "moonbag" strategy — fixed TP at 50% from the current price.

### bracket

```ts
bracket: (dto: { position: "long" | "short"; currentPrice: number; percentStopLoss: number; percentTakeProfit: number; }) => { position: "long" | "short"; priceTakeProfit: number; priceStopLoss: number; }
```

Calculates levels for a bracket order with custom TP and SL.

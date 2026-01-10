---
title: docs/interface/IRiskSignalRow
group: docs
---

# IRiskSignalRow

Risk signal row for internal risk management.
Extends ISignalDto to include priceOpen, originalPriceStopLoss and originalPriceTakeProfit.
Used in risk validation to access entry price and original SL/TP.

## Properties

### priceOpen

```ts
priceOpen: number
```

Entry price for the position.

### originalPriceStopLoss

```ts
originalPriceStopLoss: number
```

Original stop-loss price set at signal creation.

### originalPriceTakeProfit

```ts
originalPriceTakeProfit: number
```

Original take-profit price set at signal creation.

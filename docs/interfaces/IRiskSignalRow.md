---
title: docs/interface/IRiskSignalRow
group: docs
---

# IRiskSignalRow

Risk signal row for internal risk management.
Extends ISignalDto to include priceOpen and originalPriceStopLoss.
Used in risk validation to access entry price and original SL.

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

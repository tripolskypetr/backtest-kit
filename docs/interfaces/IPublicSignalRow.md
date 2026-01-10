---
title: docs/interface/IPublicSignalRow
group: docs
---

# IPublicSignalRow

Public signal row with original stop-loss and take-profit prices.
Extends ISignalRow to include originalPriceStopLoss and originalPriceTakeProfit for external visibility.
Used in public APIs to show user the original SL/TP even if trailing SL/TP are active.
This allows users to see both the current effective SL/TP and the original values set at signal creation.
The original prices remain unchanged even if _trailingPriceStopLoss or _trailingPriceTakeProfit modify the effective values.
Useful for transparency in reporting and user interfaces.
Note: originalPriceStopLoss/originalPriceTakeProfit are identical to priceStopLoss/priceTakeProfit at signal creation time.

## Properties

### originalPriceStopLoss

```ts
originalPriceStopLoss: number
```

Original stop-loss price set at signal creation.
Remains unchanged even if trailing stop-loss modifies effective SL.
Used for user visibility of initial SL parameters.

### originalPriceTakeProfit

```ts
originalPriceTakeProfit: number
```

Original take-profit price set at signal creation.
Remains unchanged even if trailing take-profit modifies effective TP.
Used for user visibility of initial TP parameters.

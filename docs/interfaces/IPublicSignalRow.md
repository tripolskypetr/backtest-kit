---
title: docs/interface/IPublicSignalRow
group: docs
---

# IPublicSignalRow

Public signal row with original stop-loss price.
Extends ISignalRow to include originalPriceStopLoss for external visibility.
Used in public APIs to show user the original SL even if trailing SL is active.
This allows users to see both the current effective SL and the original SL set at signal creation.
The originalPriceStopLoss remains unchanged even if _trailingPriceStopLoss modifies the effective SL.
Useful for transparency in reporting and user interfaces.
Note: originalPriceStopLoss is identical to priceStopLoss at signal creation time.

## Properties

### originalPriceStopLoss

```ts
originalPriceStopLoss: number
```

Original stop-loss price set at signal creation.
Remains unchanged even if trailing stop-loss modifies effective SL.
Used for user visibility of initial SL parameters.

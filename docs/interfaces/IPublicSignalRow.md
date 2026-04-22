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

### cost

```ts
cost: number
```

Cost of the initial position entry in USD (first entry, not DCA).
Inherited from ISignalRow. Explicitly surfaced here for consumer visibility.

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

### partialExecuted

```ts
partialExecuted: number
```

Total executed percentage from partial closes.
Sum of all percent values from _partial array (both profit and loss types).
Represents the total portion of the position that has been closed through partial executions.
Range: 0-100. Value of 0 means no partial closes, 100 means position fully closed through partials.

### totalEntries

```ts
totalEntries: number
```

Total number of entries in the DCA _entry history (_entry.length).
1 = no averaging done (only initial entry). 2+ = averaged positions.

### totalPartials

```ts
totalPartials: number
```

Total number of partial closes executed (_partial.length).
0 = no partial closes done. 1+ = partial closes executed.

### originalPriceOpen

```ts
originalPriceOpen: number
```

Original entry price set at signal creation (unchanged by averaging).
Mirrors signal.priceOpen which is preserved for identity/audit purposes.

### pnl

```ts
pnl: IStrategyPnL
```

Unrealized PNL at the time this public signal was created.
Calculated using toProfitLossDto with the currentPrice at the moment of emission.

### peakProfit

```ts
peakProfit: IStrategyPnL
```

Peak profit achieved during the life of this position up to the moment this public signal was created.
Calculated using the highest favorable price reached (for long: max price above entry, for short: min price below entry) and the original entry price.

### maxDrawdown

```ts
maxDrawdown: IStrategyPnL
```

Maximum drawdown experienced during the life of this position up to the moment this public signal was created.
Calculated using the worst unfavorable price reached (for long: min price below entry, for short: max price above entry) and the original entry price.

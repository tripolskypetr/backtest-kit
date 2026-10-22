---
title: docs/interface/IStrategyPnL
group: docs
---

# IStrategyPnL

Profit and loss calculation result.
Includes adjusted prices with fees (0.1%) and slippage (0.1%).

## Properties

### pnlPercentage

```ts
pnlPercentage: number
```

Profit/loss as percentage (e.g., 1.5 for +1.5%, -2.3 for -2.3%)

### priceOpen

```ts
priceOpen: number
```

Entry price adjusted with slippage and fees

### priceClose

```ts
priceClose: number
```

Exit price adjusted with slippage and fees

### pnlCost

```ts
pnlCost: number
```

Absolute profit/loss in USD: pnlPercentage / 100 * pnlEntries (dividends included)

### pnlEntries

```ts
pnlEntries: number
```

Total invested capital in USD: sum of all entry costs

### pnlDividends

```ts
pnlDividends: number
```

Value of the dividend / staking accruals (ISignalRow._accruals) in USD at
the PNL price: sum of cash amounts + sum of asset amounts × priceClose.
Computed on every PNL calculation, never stored. Already included in
pnlCost and pnlPercentage; published separately so the price component can
be reconstructed as pnlCost - pnlDividends. Not scaled by the multiplier.

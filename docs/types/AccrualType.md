---
title: docs/type/AccrualType
group: docs
---

# AccrualType

```ts
type AccrualType = "cash" | "asset";
```

Kind of a dividend / staking accrual credited to an open position.
- "cash": a fixed amount of quote currency (USD) — stock dividends, bond coupons.
- "asset": a quantity of the traded asset itself — staking rewards (ETH), stock
  dividends paid in shares. Valued at the price used for the PNL calculation
  (the current / close price), so it keeps moving with the position.

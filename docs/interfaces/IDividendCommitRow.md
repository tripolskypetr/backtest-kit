---
title: docs/interface/IDividendCommitRow
group: docs
---

# IDividendCommitRow

Queued dividend / staking accrual commit (commitDividend).

## Properties

### action

```ts
action: "dividend"
```

Discriminator

### accrualType

```ts
accrualType: AccrualType
```

"cash" (USD) or "asset" (units of the traded asset)

### amount

```ts
amount: number
```

Signed amount (positive = credit, negative = charge) in USD or asset units

### currentPrice

```ts
currentPrice: number
```

Price at which the accrual was recorded

### totalAccruals

```ts
totalAccruals: number
```

Total number of accruals in _accruals after this addition

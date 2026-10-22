---
title: docs/interface/IBudgetDepositDto
group: docs
---

# IBudgetDepositDto

`deposit`: add `amount` units of `asset` (dividends in shares, staking rewards)

## Properties

### asset

```ts
asset: string
```

Asset label, e.g. "ETH"

### amount

```ts
amount: number
```

Units to add (&gt; 0)

### note

```ts
note: string
```

Optional human-readable note stored on the row

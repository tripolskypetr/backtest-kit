---
title: docs/interface/IBudgetWithdrawDto
group: docs
---

# IBudgetWithdrawDto

`withdraw`: remove `amount` units of `asset`; more than held is rejected

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

Units to remove (&gt; 0)

### note

```ts
note: string
```

Optional human-readable note stored on the row

---
title: docs/interface/IDividendDto
group: docs
---

# IDividendDto

Dividend / staking accrual DTO accepted by commitDividend.

## Properties

### amount

```ts
amount: number
```

Signed amount (positive = credit, negative = charge): USD for "cash", asset units for "asset"

### type

```ts
type: AccrualType
```

Accrual kind. Default: "cash"

### note

```ts
note: string
```

Optional human-readable description

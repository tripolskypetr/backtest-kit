---
title: docs/interface/IBudgetReserveDto
group: docs
---

# IBudgetReserveDto

`reserve`: move `amount` from free to deployed under the key `id`

## Properties

### id

```ts
id: string
```

Reserve identifier (typically the signal id); must not be open already

### amount

```ts
amount: number
```

Amount to reserve in quote currency (&gt; 0)

### note

```ts
note: string
```

Optional human-readable note stored on the row

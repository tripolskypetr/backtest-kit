---
title: docs/interface/IBudgetRejectRow
group: docs
---

# IBudgetRejectRow

A `reserve` / `withdraw` was refused; the balance is unchanged

## Properties

### type

```ts
type: "reject"
```

### action

```ts
action: "reserve" | "withdraw"
```

### asset

```ts
asset: string
```

"capital" for reserve, the asset label for withdraw

### requested

```ts
requested: number
```

### available

```ts
available: number
```

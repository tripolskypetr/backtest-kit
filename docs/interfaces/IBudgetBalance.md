---
title: docs/interface/IBudgetBalance
group: docs
---

# IBudgetBalance

Balance of a budget at a logical time: the fold of the journal up to `when`

## Properties

### name

```ts
name: string
```

Budget name

### when

```ts
when: Date
```

Logical time the balance is taken at

### capital

```ts
capital: number
```

Capital: initialCapital plus every realized pnl of released reserves

### deployed

```ts
deployed: number
```

Sum of open reserves

### free

```ts
free: number
```

capital − deployed (negative only after an overdraft, see IBudgetReserveRow)

### assets

```ts
assets: Record<string, number>
```

Units held per asset (deposits − withdrawals)

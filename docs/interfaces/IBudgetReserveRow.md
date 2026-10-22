---
title: docs/interface/IBudgetReserveRow
group: docs
---

# IBudgetReserveRow

A reserve took `amount` from free

## Properties

### type

```ts
type: "reserve"
```

### id

```ts
id: string
```

### amount

```ts
amount: number
```

### note

```ts
note: string
```

### overdraft

```ts
overdraft: number
```

Set when a later-inserted earlier row (another symbol whose clock lagged
behind this one) made this reserve exceed the free balance: `-free` after
the row, as of the journal's CURRENT content. Cleared again when a later
insert brings the balance back (an earlier release that arrived after the
reserve it closes): by logical time such a shortfall never existed, the
rows merely arrived out of order, and keeping the mark would make the
journal depend on the arrival order (I3). What the shortfall DID cause
while it stood is on record for good: the `reject` rows of the reserves
refused in that window, and the warning logged at the recompute. The
budget never hides it (see the Budget class notes). Under
`CC_BACKTEST_LOCKSTEP` the clocks of parallel backtests stay within one
timeframe, replays included, so this only arises with the flag off or
with ties inside one timeframe.

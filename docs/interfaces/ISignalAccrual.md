---
title: docs/interface/ISignalAccrual
group: docs
---

# ISignalAccrual

One dividend / staking accrual recorded on a position (ISignalRow._accruals).
Added by commitDividend. The sign of amount is the direction: positive
credits the position (dividend received, staking reward), negative charges
it (dividend owed on a short, cash-out of a reward). The engine never
schedules accruals itself — when and how much is application logic
(ex-dates from a calendar, staking epochs), typically tracked with State.

## Properties

### type

```ts
type: AccrualType
```

"cash" (quote currency) or "asset" (units of the traded asset)

### amount

```ts
amount: number
```

Signed amount (positive = credit, negative = charge): USD for "cash", asset units for "asset"

### currentPrice

```ts
currentPrice: number
```

Market price at the moment the accrual was recorded (same source as
ISignalPartial.currentPrice). Informational: the PNL values "asset"
accruals at the PNL price, not at this one.

### timestamp

```ts
timestamp: number
```

Unix timestamp in milliseconds when the accrual was recorded (execution-context time)

### note

```ts
note: string
```

Optional human-readable description (e.g. "Q3 dividend", "epoch 1234 staking reward")

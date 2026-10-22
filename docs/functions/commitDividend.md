---
title: docs/function/commitDividend
group: docs
---

# commitDividend

```ts
declare function commitDividend(symbol: string, dto: IDividendDto): Promise<boolean>;
```

Records a dividend / staking accrual on the open position.

The engine never schedules dividends itself: WHEN an accrual is due (ex-date
calendar, staking epoch) is application logic — typically tracked with State
inside onActivePing — and this call records the result. From then on every
PNL calculation folds the accrual in: a "cash" accrual (quote currency, the
default) adds its amount, an "asset" accrual (staking rewards paid in the
traded asset) adds amount × price at the PNL price. The total is published
as pnl.pnlDividends and included in pnlCost / pnlPercentage, never scaled by
the leverage multiplier. The position's accrual list is exposed as
IPublicSignalRow.accruals.

The sign of amount is the direction: positive credits the position, negative
charges it — a dividend owed on a SHORT stock position at the ex-date, or a
cash-out of a staking reward. There is no separate removal: record the
opposite amount.

Returns false (without throwing) when no pending signal exists or the DTO is
invalid (amount not a non-zero finite number, unknown type).

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
| `dto` | Accrual: signed amount, type ("cash" default &vert; "asset"), optional note |

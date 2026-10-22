---
title: docs/type/IBudgetHistoryRow
group: docs
---

# IBudgetHistoryRow

```ts
type IBudgetHistoryRow = IBudgetReserveRow | IBudgetReleaseRow | IBudgetRejectRow | IBudgetDepositRow | IBudgetWithdrawRow;
```

Journal row of a budget record, ordered by (timestamp, symbol, seq)

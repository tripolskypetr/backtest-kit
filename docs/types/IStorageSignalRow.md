---
title: docs/type/IStorageSignalRow
group: docs
---

# IStorageSignalRow

```ts
type IStorageSignalRow = IStorageSignalRowOpened | IStorageSignalRowScheduled | IStorageSignalRowClosed | IStorageSignalRowCancelled;
```

Discriminated union of storage signal rows.
Use type guards: `row.status === "closed"` for type-safe access to pnl.

---
title: docs/type/TDumpInstanceCtor
group: docs
---

# TDumpInstanceCtor

```ts
type TDumpInstanceCtor = new (signalId: string, bucketName: string, backtest: boolean) => IDumpInstance;
```

Constructor type for dump instance implementations.
Used for swapping backends via DumpAdapter.useDumpAdapter().

---
title: docs/type/TMemoryInstanceCtor
group: docs
---

# TMemoryInstanceCtor

```ts
type TMemoryInstanceCtor = new (signalId: string, bucketName: string) => IMemoryInstance;
```

Constructor type for memory instance implementations.
Used for swapping backends via MemoryBacktestAdapter / MemoryLiveAdapter.

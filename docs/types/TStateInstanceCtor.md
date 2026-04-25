---
title: docs/type/TStateInstanceCtor
group: docs
---

# TStateInstanceCtor

```ts
type TStateInstanceCtor = new (initialValue: object, signalId: string, bucketName: string) => IStateInstance;
```

Constructor type for state instance implementations.
Used for swapping backends via StateBacktestAdapter / StateLiveAdapter.

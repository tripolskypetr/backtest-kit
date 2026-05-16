---
title: docs/type/MemoryData
group: docs
---

# MemoryData

```ts
type MemoryData = {
    priority: number;
    data: object;
    removed: boolean;
    index: string;
    when: number;
};
```

Type for persisted memory entry data.
Each memory entry is an arbitrary JSON-serializable object.

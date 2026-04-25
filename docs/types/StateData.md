---
title: docs/type/StateData
group: docs
---

# StateData

```ts
type StateData = {
    id: string;
    data: object;
};
```

Type for persisted state entry data.
Wraps an arbitrary JSON-serializable object with a unique id.

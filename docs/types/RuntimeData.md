---
title: docs/type/RuntimeData
group: docs
---

# RuntimeData

```ts
type RuntimeData = Record<string, unknown>;
```

Generic key-value type for strategy runtime data.
Allows strategies to store arbitrary data for custom monitoring, reporting, or external logic.
This is a flexible structure that can hold any additional information a strategy wants to track at runtime.
The content of this object is not defined by the system and can be used freely by strategy implementations.

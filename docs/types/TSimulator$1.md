---
title: docs/type/TSimulator$1
group: docs
---

# TSimulator$1

```ts
type TSimulator$1 = {
    [key in keyof ISimulator]: any;
};
```

Structural mirror of ISimulator: the global service exposes the
same public surface as the client it fronts, with DI-level DTOs.

---
title: docs/type/TSimulator
group: docs
---

# TSimulator

```ts
type TSimulator = {
    [key in keyof ISimulator]: any;
};
```

Structural mirror of ISimulator: the core service exposes the same
public surface as the client it fronts, with DI-level DTOs.

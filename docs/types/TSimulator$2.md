---
title: docs/type/TSimulator$2
group: docs
---

# TSimulator$2

```ts
type TSimulator$2 = {
    [key in keyof ISimulator]: any;
};
```

Structural mirror of ISimulator: the connection service exposes the
same public surface as the client it manages, with DI-level DTOs.

---
title: docs/type/TStrategy
group: docs
---

# TStrategy

```ts
type TStrategy = {
    [key in keyof IStrategy]: any;
};
```

Type definition for strategy methods.
Maps all keys of IStrategy to any type.
Used for dynamic method routing in StrategyConnectionService.

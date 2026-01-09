---
title: docs/type/TBreakeven
group: docs
---

# TBreakeven

```ts
type TBreakeven = {
    [key in keyof IBreakeven]: any;
};
```

Type definition for breakeven methods.
Maps all keys of IBreakeven to any type.
Used for dynamic method routing in BreakevenGlobalService.

---
title: docs/api-reference/function/listWalkers
group: docs
---

# listWalkers

```ts
declare function listWalkers(): Promise<IWalkerSchema[]>;
```

Returns a list of all registered walker schemas.

Retrieves all walkers that have been registered via addWalker().
Useful for debugging, documentation, or building dynamic UIs.

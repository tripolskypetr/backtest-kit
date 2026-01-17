---
title: docs/function/listWalkerSchema
group: docs
---

# listWalkerSchema

```ts
declare function listWalkerSchema(): Promise<IWalkerSchema[]>;
```

Returns a list of all registered walker schemas.

Retrieves all walkers that have been registered via addWalker().
Useful for debugging, documentation, or building dynamic UIs.

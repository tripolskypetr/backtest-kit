---
title: docs/function/listOptimizerSchema
group: docs
---

# listOptimizerSchema

```ts
declare function listOptimizerSchema(): Promise<IOptimizerSchema[]>;
```

Returns a list of all registered optimizer schemas.

Retrieves all optimizers that have been registered via addOptimizer().
Useful for debugging, documentation, or building dynamic UIs.

---
title: docs/type/TOptimizerSchema
group: docs
---

# TOptimizerSchema

```ts
type TOptimizerSchema = {
    optimizerName: IOptimizerSchema["optimizerName"];
} & Partial<IOptimizerSchema>;
```

Partial optimizer schema for override operations.

Requires only the optimizer name identifier, all other fields are optional.
Used by overrideOptimizer() to perform partial updates without replacing entire configuration.

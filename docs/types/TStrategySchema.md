---
title: docs/type/TStrategySchema
group: docs
---

# TStrategySchema

```ts
type TStrategySchema = {
    strategyName: IStrategySchema["strategyName"];
} & Partial<IStrategySchema>;
```

Partial strategy schema for override operations.

Requires only the strategy name identifier, all other fields are optional.
Used by overrideStrategy() to perform partial updates without replacing entire configuration.

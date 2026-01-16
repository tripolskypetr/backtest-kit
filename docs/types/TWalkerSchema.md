---
title: docs/type/TWalkerSchema
group: docs
---

# TWalkerSchema

```ts
type TWalkerSchema = {
    walkerName: IWalkerSchema["walkerName"];
} & Partial<IWalkerSchema>;
```

Partial walker schema for override operations.

Requires only the walker name identifier, all other fields are optional.
Used by overrideWalker() to perform partial updates without replacing entire configuration.

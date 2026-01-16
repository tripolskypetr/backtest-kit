---
title: docs/type/TSizingSchema
group: docs
---

# TSizingSchema

```ts
type TSizingSchema = {
    sizingName: ISizingSchema["sizingName"];
} & Partial<ISizingSchema>;
```

Partial sizing schema for override operations.

Requires only the sizing name identifier, all other fields are optional.
Used by overrideSizing() to perform partial updates without replacing entire configuration.

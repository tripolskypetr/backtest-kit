---
title: docs/type/TActionSchema
group: docs
---

# TActionSchema

```ts
type TActionSchema = {
    actionName: IActionSchema["actionName"];
} & Partial<IActionSchema>;
```

Partial action schema for override operations.

Requires only the action name identifier, all other fields are optional.
Used by overrideAction() to perform partial updates without replacing entire configuration.

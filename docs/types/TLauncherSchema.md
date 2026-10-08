---
title: docs/type/TLauncherSchema
group: docs
---

# TLauncherSchema

```ts
type TLauncherSchema = {
    launcherName: ILauncherSchema["launcherName"];
} & Partial<ILauncherSchema>;
```

Partial launcher schema for override operations.

Requires only the launcher name identifier, all other fields are optional.
Used by overrideLauncherSchema() to perform partial updates without replacing entire configuration.

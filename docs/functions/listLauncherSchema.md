---
title: docs/function/listLauncherSchema
group: docs
---

# listLauncherSchema

```ts
declare function listLauncherSchema(): Promise<ILauncherSchema[]>;
```

Returns a list of all registered launcher schemas.

Retrieves all launchers that have been registered via addLauncherSchema().
Useful for debugging, documentation, or building dynamic UIs.

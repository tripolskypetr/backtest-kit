---
title: docs/function/listSizingSchema
group: docs
---

# listSizingSchema

```ts
declare function listSizingSchema(): Promise<ISizingSchema[]>;
```

Returns a list of all registered sizing schemas.

Retrieves all sizing configurations that have been registered via addSizing().
Useful for debugging, documentation, or building dynamic UIs.

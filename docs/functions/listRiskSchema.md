---
title: docs/function/listRiskSchema
group: docs
---

# listRiskSchema

```ts
declare function listRiskSchema(): Promise<IRiskSchema[]>;
```

Returns a list of all registered risk schemas.

Retrieves all risk configurations that have been registered via addRisk().
Useful for debugging, documentation, or building dynamic UIs.

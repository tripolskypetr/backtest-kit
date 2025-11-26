---
title: docs/api-reference/function/listRisks
group: docs
---

# listRisks

```ts
declare function listRisks(): Promise<IRiskSchema[]>;
```

Returns a list of all registered risk schemas.

Retrieves all risk configurations that have been registered via addRisk().
Useful for debugging, documentation, or building dynamic UIs.

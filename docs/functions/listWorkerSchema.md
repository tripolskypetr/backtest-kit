---
title: docs/function/listWorkerSchema
group: docs
---

# listWorkerSchema

```ts
declare function listWorkerSchema(): Promise<IWorkerSchema[]>;
```

Returns a list of all registered worker schemas.

Retrieves all workers that have been registered via addWorkerSchema().
Useful for debugging, documentation, or building dynamic UIs.

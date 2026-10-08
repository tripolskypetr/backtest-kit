---
title: docs/type/TWorkerSchema
group: docs
---

# TWorkerSchema

```ts
type TWorkerSchema = {
    workerName: IWorkerSchema["workerName"];
} & Partial<IWorkerSchema>;
```

Partial worker schema for override operations.

Requires only the worker name identifier, all other fields are optional.
Used by overrideWorkerSchema() to perform partial updates without replacing entire configuration.

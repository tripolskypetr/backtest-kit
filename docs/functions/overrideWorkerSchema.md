---
title: docs/function/overrideWorkerSchema
group: docs
---

# overrideWorkerSchema

```ts
declare function overrideWorkerSchema(workerSchema: TWorkerSchema): Promise<IWorkerSchema>;
```

Overrides an existing worker configuration in the framework.

This function partially updates a previously registered worker with new configuration.
Only the provided fields will be updated, other fields remain unchanged.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `workerSchema` | Partial worker configuration object |

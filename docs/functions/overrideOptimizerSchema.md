---
title: docs/function/overrideOptimizerSchema
group: docs
---

# overrideOptimizerSchema

```ts
declare function overrideOptimizerSchema(optimizerSchema: TOptimizerSchema): Promise<IOptimizerSchema>;
```

Overrides an existing optimizer configuration in the framework.

This function partially updates a previously registered optimizer with new configuration.
Only the provided fields will be updated, other fields remain unchanged.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `optimizerSchema` | Partial optimizer configuration object |

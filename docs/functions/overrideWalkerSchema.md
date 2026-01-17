---
title: docs/function/overrideWalkerSchema
group: docs
---

# overrideWalkerSchema

```ts
declare function overrideWalkerSchema(walkerSchema: TWalkerSchema): Promise<IWalkerSchema>;
```

Overrides an existing walker configuration for strategy comparison.

This function partially updates a previously registered walker with new configuration.
Only the provided fields will be updated, other fields remain unchanged.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `walkerSchema` | Partial walker configuration object |

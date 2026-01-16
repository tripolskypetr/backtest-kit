---
title: docs/function/overrideWalker
group: docs
---

# overrideWalker

```ts
declare function overrideWalker(walkerSchema: TWalkerSchema): Promise<IWalkerSchema>;
```

Overrides an existing walker configuration for strategy comparison.

This function partially updates a previously registered walker with new configuration.
Only the provided fields will be updated, other fields remain unchanged.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `walkerSchema` | Partial walker configuration object |

---
title: docs/function/overrideFrameSchema
group: docs
---

# overrideFrameSchema

```ts
declare function overrideFrameSchema(frameSchema: TFrameSchema): Promise<IFrameSchema>;
```

Overrides an existing timeframe configuration for backtesting.

This function partially updates a previously registered frame with new configuration.
Only the provided fields will be updated, other fields remain unchanged.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `frameSchema` | Partial frame configuration object |

---
title: docs/function/overrideSizing
group: docs
---

# overrideSizing

```ts
declare function overrideSizing(sizingSchema: TSizingSchema): Promise<ISizingSchema>;
```

Overrides an existing position sizing configuration in the framework.

This function partially updates a previously registered sizing configuration with new settings.
Only the provided fields will be updated, other fields remain unchanged.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `sizingSchema` | Partial sizing configuration object |

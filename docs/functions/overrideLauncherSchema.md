---
title: docs/function/overrideLauncherSchema
group: docs
---

# overrideLauncherSchema

```ts
declare function overrideLauncherSchema(launcherSchema: TLauncherSchema): Promise<ILauncherSchema>;
```

Overrides an existing launcher configuration in the framework.

This function partially updates a previously registered launcher with new configuration.
Only the provided fields will be updated, other fields remain unchanged.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `launcherSchema` | Partial launcher configuration object |

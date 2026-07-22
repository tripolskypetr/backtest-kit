---
title: docs/function/overrideSimulatorSchema
group: docs
---

# overrideSimulatorSchema

```ts
declare function overrideSimulatorSchema(simulatorSchema: TSimulatorSchema): Promise<ISimulatorSchema>;
```

Overrides an existing simulator configuration in the framework.

This function partially updates a previously registered simulator with new configuration.
Only the provided fields will be updated, other fields remain unchanged.

Note: the connection layer memoizes ClientSimulator instances by
simulator name — an override after the first run takes effect for
new instances only (see SimulatorConnectionService.clear).

## Parameters

| Parameter | Description |
|-----------|-------------|
| `simulatorSchema` | Partial simulator configuration object |

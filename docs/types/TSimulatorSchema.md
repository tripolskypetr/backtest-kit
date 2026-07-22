---
title: docs/type/TSimulatorSchema
group: docs
---

# TSimulatorSchema

```ts
type TSimulatorSchema = {
    simulatorName: ISimulatorSchema["simulatorName"];
} & Partial<ISimulatorSchema>;
```

Partial simulator schema for override operations.

Requires only the simulator name identifier, all other fields are optional.
Used by overrideSimulatorSchema() to perform partial updates without replacing entire configuration.

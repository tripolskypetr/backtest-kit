---
title: docs/function/listSimulatorSchema
group: docs
---

# listSimulatorSchema

```ts
declare function listSimulatorSchema(): Promise<ISimulatorSchema[]>;
```

Returns a list of all registered simulator schemas.

Retrieves all simulators that have been registered via addSimulatorSchema().
Useful for debugging, documentation, or building dynamic UIs.

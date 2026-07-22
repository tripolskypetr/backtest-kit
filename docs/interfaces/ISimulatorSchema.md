---
title: docs/interface/ISimulatorSchema
group: docs
---

# ISimulatorSchema

Registration schema of a simulator instance.

## Properties

### simulatorName

```ts
simulatorName: string
```

Unique simulator identifier for the schema registry.

### exchangeName

```ts
exchangeName: string
```

Exchange schema to fetch candles through.

### gridAxes

```ts
gridAxes: Partial<ISimulatorGridAxes>
```

Grid axes override, merged per-axis over the defaults at params
creation — a schema may override only the axes it cares about.

### callbacks

```ts
callbacks: Partial<ISimulatorCallbacks>
```

Lifecycle callbacks (all optional).

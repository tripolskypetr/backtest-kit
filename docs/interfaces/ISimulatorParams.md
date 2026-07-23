---
title: docs/interface/ISimulatorParams
group: docs
---

# ISimulatorParams

Runtime parameters of a simulator client: the schema with defaults
resolved plus injected infrastructure dependencies.

## Properties

### logger

```ts
logger: ILogger
```

Logger instance for debug output.

### gridAxes

```ts
gridAxes: ISimulatorGridAxes
```

Grid axes with defaults applied (no longer optional).

### reportOrder

```ts
reportOrder: SimulatorRankingCriterion
```

Report order with the default applied (no longer optional).

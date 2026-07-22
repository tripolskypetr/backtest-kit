---
title: docs/function/addSimulatorSchema
group: docs
---

# addSimulatorSchema

```ts
declare function addSimulatorSchema(simulatorSchema: ISimulatorSchema): void;
```

Registers a simulator in the framework — a parameter sweep engine
over crowd trading ideas (see Simulator.run).

The simulator profiles every idea with one candle pass through the
referenced exchange, trains the author whitelist/ban list on the
simulated range and evaluates the grid of exit/entry parameters
arithmetically from the profiles. Grid axes are optional — bounded
defaults apply when omitted.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `simulatorSchema` | Simulator configuration object |

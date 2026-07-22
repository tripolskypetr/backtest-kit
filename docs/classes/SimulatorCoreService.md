---
title: docs/class/SimulatorCoreService
group: docs
---

# SimulatorCoreService

Implements `TSimulator`

Core layer of the Simulator entity.

Validates the simulator reference (existence + exchange
dependency) and delegates to the connection layer. Sits between
the global entry point and the memoized ClientSimulator instances
owned by SimulatorConnectionService.

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### simulatorConnectionService

```ts
simulatorConnectionService: any
```

### simulatorValidationService

```ts
simulatorValidationService: any
```

### run

```ts
run: (dto: { symbol: string; simulatorName: string; ideas: ISimulatorIdea[]; }) => Promise<ISimulatorResult>
```

Runs the full simulation for a symbol after validating the
simulator reference: profiles -&gt; author filter -&gt; grid
evaluation -&gt; rankings.

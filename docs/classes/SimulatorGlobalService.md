---
title: docs/class/SimulatorGlobalService
group: docs
---

# SimulatorGlobalService

Implements `TSimulator$1`

Global entry point of the Simulator entity.

The outermost service layer the public API talks to: validates the
referenced simulator (existence + exchange dependency) and
delegates to the connection layer, which owns the memoized
ClientSimulator instances.

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

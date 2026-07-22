---
title: docs/class/SimulatorConnectionService
group: docs
---

# SimulatorConnectionService

Implements `TSimulator$2`

Connection layer of the Simulator entity.

Owns the ClientSimulator lifecycle: resolves the registered schema
by simulatorName, applies grid axes defaults, injects the logger
and memoizes one client instance per simulator name. Public
methods accept flat DTOs and delegate to the memoized client.

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### simulatorSchemaService

```ts
simulatorSchemaService: any
```

### getSimulator

```ts
getSimulator: ((simulatorName: string) => ClientSimulator) & IClearableMemoize<string> & IControlMemoize<string, ClientSimulator>
```

Returns the ClientSimulator for a simulator name, creating it on
first access. Memoized by simulator name — one client instance
per registered simulator; gridAxes fall back to
DEFAULT_GRID_AXES when the schema omits them.

### run

```ts
run: (dto: { symbol: string; simulatorName: string; ideas: ISimulatorIdea[]; }) => Promise<ISimulatorResult>
```

Runs the full simulation for a symbol through the memoized
client: profiles -&gt; author filter -&gt; grid evaluation -&gt; rankings.

### clear

```ts
clear: (simulatorName?: string) => void
```

Drops memoized client instances: a specific one by name or all
of them when called without arguments. The next getSimulator
call re-reads the schema and builds a fresh client.

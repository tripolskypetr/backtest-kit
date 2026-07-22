---
title: docs/class/SimulatorValidationService
group: docs
---

# SimulatorValidationService

Existence and dependency validation of simulators.

Tracks every registered simulator and verifies at use time that a
referenced simulator exists and its exchange dependency is valid.
Registration here is uniqueness-guarded, unlike the schema
registry where re-registering replaces the record.

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### exchangeValidationService

```ts
exchangeValidationService: any
```

### _simulatorMap

```ts
_simulatorMap: any
```

### addSimulator

```ts
addSimulator: (simulatorName: string, simulatorSchema: ISimulatorSchema) => void
```

Tracks a simulator for validation. Called on schema
registration; duplicate names are rejected.

### validate

```ts
validate: (simulatorName: string, source: string) => void
```

Validates that a simulator is registered and its exchange
dependency passes validation. Memoized by simulator name — the
check runs once per name, later calls are no-ops.

### list

```ts
list: () => Promise<ISimulatorSchema[]>
```

Lists every tracked simulator schema.

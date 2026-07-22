---
title: docs/class/SimulatorSchemaService
group: docs
---

# SimulatorSchemaService

Registry of simulator schemas.

Stores ISimulatorSchema records by simulator name with shallow
validation on registration. The connection service reads schemas
from here when building ClientSimulator instances.

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: { readonly methodContextService: { readonly context: IMethodContext; }; readonly executionContextService: { readonly context: IExecutionContext; }; ... 7 more ...; setLogger: (logger: ILogger) => void; }
```

### _registry

```ts
_registry: any
```

### validateShallow

```ts
validateShallow: any
```

Shallow structural validation of a schema: required string
fields only, no deep checks — grid axes and callbacks are
validated by their consumers.

## Methods

### register

```ts
register(key: SimulatorName, value: ISimulatorSchema): void;
```

Registers a simulator schema under its name after shallow
validation. Registering the same key twice replaces the record.

### override

```ts
override(key: SimulatorName, value: Partial<ISimulatorSchema>): ISimulatorSchema;
```

Partially overrides a registered schema and returns the merged
record. Used by overrideSimulatorSchema-style public APIs.

### get

```ts
get(key: SimulatorName): ISimulatorSchema;
```

Returns the registered schema by simulator name.

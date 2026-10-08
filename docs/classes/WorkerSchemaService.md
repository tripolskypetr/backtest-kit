---
title: docs/class/WorkerSchemaService
group: docs
---

# WorkerSchemaService

Registry of worker schemas.

Stores IWorkerSchema records by worker name with shallow validation on
registration. A worker binds a run mode (backtest, paper or live) to
optional strategy, exchange and frame references resolved at run time;
the symbol list is NOT part of the schema — Worker.run receives it and
forks one child process per symbol.

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
fields and the run-mode discriminator only, no deep checks —
strategy, exchange and frame references are validated by
WorkerValidationService at use time. strategyName and
exchangeName are optional but must be strings when present.

## Methods

### register

```ts
register(key: WorkerName, value: IWorkerSchema): void;
```

Registers a worker schema under its name after shallow
validation. Registering the same key twice replaces the record.

### override

```ts
override(key: WorkerName, value: Partial<IWorkerSchema>): IWorkerSchema;
```

Partially overrides a registered schema and returns the merged
record. Used by overrideWorkerSchema-style public APIs.

### get

```ts
get(key: WorkerName): IWorkerSchema;
```

Returns the registered schema by worker name.

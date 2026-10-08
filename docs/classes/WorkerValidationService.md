---
title: docs/class/WorkerValidationService
group: docs
---

# WorkerValidationService

Existence and dependency validation of worker instances.

Tracks every registered worker and verifies at use time that a
referenced worker exists and its optional strategy, exchange and
frame dependencies are valid. Registration here is uniqueness-guarded,
unlike the schema registry where re-registering replaces the record.

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### strategyValidationService

```ts
strategyValidationService: any
```

### exchangeValidationService

```ts
exchangeValidationService: any
```

### frameValidationService

```ts
frameValidationService: any
```

### _workerMap

```ts
_workerMap: any
```

### addWorker

```ts
addWorker: (workerName: string, workerSchema: IWorkerSchema) => void
```

Tracks a worker instance for validation. Called on schema
registration; duplicate names are rejected.

### validate

```ts
validate: (workerName: string, source: string) => void
```

Validates that a worker instance is registered and its strategy,
exchange and frame dependencies pass validation. Memoized by
worker name — the check runs once per name, later calls are no-ops.

### list

```ts
list: () => Promise<IWorkerSchema[]>
```

Lists every tracked worker schema.

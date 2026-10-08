---
title: docs/class/LauncherSchemaService
group: docs
---

# LauncherSchemaService

Registry of launcher schemas.

Stores ILauncherSchema records by launcher name with shallow validation on
registration. A launcher binds a run mode (backtest, paper or live) to
optional strategy, exchange and frame references resolved at launch time.

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
LauncherValidationService at use time. strategyName and
exchangeName are optional but must be strings when present.

## Methods

### register

```ts
register(key: LauncherName, value: ILauncherSchema): void;
```

Registers a launcher schema under its name after shallow
validation. Registering the same key twice replaces the record.

### override

```ts
override(key: LauncherName, value: Partial<ILauncherSchema>): ILauncherSchema;
```

Partially overrides a registered schema and returns the merged
record. Used by overrideLauncherSchema-style public APIs.

### get

```ts
get(key: LauncherName): ILauncherSchema;
```

Returns the registered schema by launcher name.

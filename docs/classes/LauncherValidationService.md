---
title: docs/class/LauncherValidationService
group: docs
---

# LauncherValidationService

Existence and dependency validation of launcher instances.

Tracks every registered launcher and verifies at use time that a
referenced launcher exists and its optional strategy, exchange and
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

### _launcherMap

```ts
_launcherMap: any
```

### addLauncher

```ts
addLauncher: (launcherName: string, launcherSchema: ILauncherSchema) => void
```

Tracks a launcher instance for validation. Called on schema
registration; duplicate names are rejected.

### validate

```ts
validate: (launcherName: string, source: string) => void
```

Validates that a launcher instance is registered, its symbol list is
not empty and its strategy, exchange and frame dependencies pass
validation. Memoized by launcher name — the check runs once per name,
later calls are no-ops.

### list

```ts
list: () => Promise<ILauncherSchema[]>
```

Lists every tracked launcher schema.

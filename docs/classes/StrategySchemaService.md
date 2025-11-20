---
title: docs/api-reference/class/StrategySchemaService
group: docs
---

# StrategySchemaService

Service for managing strategy schema registry.

Uses ToolRegistry from functools-kit for type-safe schema storage.
Strategies are registered via addStrategy() and retrieved by name.

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: LoggerService
```

### _registry

```ts
_registry: any
```

### register

```ts
register: (key: string, value: IStrategySchema) => void
```

Registers a new strategy schema.

### override

```ts
override: (key: string, value: Partial<IStrategySchema>) => IStrategySchema
```

Overrides an existing strategy schema with partial updates.

### get

```ts
get: (key: string) => IStrategySchema
```

Retrieves a strategy schema by name.

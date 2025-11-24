---
title: docs/api-reference/class/WalkerSchemaService
group: docs
---

# WalkerSchemaService

Service for managing walker schema registry.

Uses ToolRegistry from functools-kit for type-safe schema storage.
Walkers are registered via addWalker() and retrieved by name.

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
register: (key: string, value: IWalkerSchema) => void
```

Registers a new walker schema.

### validateShallow

```ts
validateShallow: any
```

Validates walker schema structure for required properties.

Performs shallow validation to ensure all required properties exist
and have correct types before registration in the registry.

### override

```ts
override: (key: string, value: Partial<IWalkerSchema>) => IWalkerSchema
```

Overrides an existing walker schema with partial updates.

### get

```ts
get: (key: string) => IWalkerSchema
```

Retrieves a walker schema by name.

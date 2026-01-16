---
title: docs/class/ActionSchemaService
group: docs
---

# ActionSchemaService

Service for managing action schema registry.

Uses ToolRegistry from functools-kit for type-safe schema storage.
Action handlers are registered via addAction() and retrieved by name.

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
register: (key: string, value: IActionSchema) => void
```

Registers a new action schema.

### validateShallow

```ts
validateShallow: any
```

Validates action schema structure for required properties.

Performs shallow validation to ensure all required properties exist
and have correct types before registration in the registry.

### override

```ts
override: (key: string, value: Partial<IActionSchema>) => IActionSchema
```

Overrides an existing action schema with partial updates.

### get

```ts
get: (key: string) => IActionSchema
```

Retrieves an action schema by name.

---
title: docs/class/ActionSchemaService
group: docs
---

# ActionSchemaService

Service for managing action schema registry.

Manages registration, validation and retrieval of action schemas.
Uses ToolRegistry from functools-kit for type-safe schema storage.
Validates that action handlers only contain allowed public methods
from the IPublicAction interface.

Key features:
- Type-safe action schema registration
- Method name validation for class and object handlers
- Private method support (methods starting with _ or #)
- Schema override capabilities

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

Validates the schema structure and method names before registration.
Throws an error if the action name already exists in the registry.

### validateShallow

```ts
validateShallow: any
```

Validates action schema structure for required properties.

Performs shallow validation to ensure all required properties exist
and have correct types before registration in the registry.
Also validates that all public methods in the handler are allowed.

### override

```ts
override: (key: string, value: Partial<IActionSchema>) => IActionSchema
```

Overrides an existing action schema with partial updates.

Merges provided partial schema updates with the existing schema.
Useful for modifying handler or callbacks without re-registering the entire schema.

### get

```ts
get: (key: string) => IActionSchema
```

Retrieves an action schema by name.

Returns the complete action schema configuration including handler and callbacks.
Used internally by ActionConnectionService to instantiate ClientAction instances.

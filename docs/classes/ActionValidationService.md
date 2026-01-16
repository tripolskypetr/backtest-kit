---
title: docs/class/ActionValidationService
group: docs
---

# ActionValidationService

Service for managing and validating action handler configurations.

Maintains a registry of all configured action handlers and validates
their existence before operations. Uses memoization for performance.

Key features:
- Registry management: addAction() to register new action handlers
- Validation: validate() ensures action handler exists before use
- Memoization: validation results are cached by actionName:source for performance
- Listing: list() returns all registered action handlers

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### _actionMap

```ts
_actionMap: any
```

### addAction

```ts
addAction: (actionName: string, actionSchema: IActionSchema) => void
```

Adds an action schema to the validation service

### validate

```ts
validate: (actionName: string, source: string) => void
```

Validates the existence of an action handler

### list

```ts
list: () => Promise<IActionSchema[]>
```

Returns a list of all registered action schemas

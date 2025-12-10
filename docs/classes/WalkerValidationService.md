---
title: docs/api-reference/class/WalkerValidationService
group: docs
---

# WalkerValidationService

Service for managing and validating walker (parameter sweep) configurations.

Maintains a registry of all configured walkers and validates
their existence before operations. Uses memoization for performance.

Walkers define parameter ranges for optimization and hyperparameter tuning.

Key features:
- Registry management: addWalker() to register new walker configurations
- Validation: validate() ensures walker exists before use
- Memoization: validation results are cached for performance
- Listing: list() returns all registered walkers

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### _walkerMap

```ts
_walkerMap: any
```

### addWalker

```ts
addWalker: (walkerName: string, walkerSchema: IWalkerSchema) => void
```

Adds a walker schema to the validation service

### validate

```ts
validate: (walkerName: string, source: string) => void
```

Validates the existence of a walker

### list

```ts
list: () => Promise<IWalkerSchema[]>
```

Returns a list of all registered walker schemas

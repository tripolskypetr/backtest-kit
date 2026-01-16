---
title: docs/class/StrategyValidationService
group: docs
---

# StrategyValidationService

Service for managing and validating trading strategy configurations.

Maintains a registry of all configured strategies, validates their existence
before operations, and ensures associated risk profiles and actions are valid.
Uses memoization for performance.

Key features:
- Registry management: addStrategy() to register new strategies
- Multi-level validation: validates strategy existence, risk profiles, and actions (if configured)
- Memoization: validation results are cached for performance
- Listing: list() returns all registered strategies

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### riskValidationService

```ts
riskValidationService: any
```

### actionValidationService

```ts
actionValidationService: any
```

### _strategyMap

```ts
_strategyMap: any
```

### addStrategy

```ts
addStrategy: (strategyName: string, strategySchema: IStrategySchema) => void
```

Adds a strategy schema to the validation service

### validate

```ts
validate: (strategyName: string, source: string) => void
```

Validates the existence of a strategy and its associated configurations (risk profiles and actions)

### list

```ts
list: () => Promise<IStrategySchema[]>
```

Returns a list of all registered strategy schemas

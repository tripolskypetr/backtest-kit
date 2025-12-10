---
title: docs/api-reference/class/StrategyValidationService
group: docs
---

# StrategyValidationService

Service for managing and validating trading strategy configurations.

Maintains a registry of all configured strategies, validates their existence
before operations, and ensures associated risk profiles are valid.
Uses memoization for performance.

Key features:
- Registry management: addStrategy() to register new strategies
- Dual validation: validates both strategy existence and risk profile (if configured)
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

Validates the existence of a strategy and its risk profile (if configured)

### list

```ts
list: () => Promise<IStrategySchema[]>
```

Returns a list of all registered strategy schemas

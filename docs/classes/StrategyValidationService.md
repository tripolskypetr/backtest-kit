---
title: docs/api-reference/class/StrategyValidationService
group: docs
---

# StrategyValidationService

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
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

Validates the existence of a strategy

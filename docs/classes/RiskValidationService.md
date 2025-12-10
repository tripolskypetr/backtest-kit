---
title: docs/api-reference/class/RiskValidationService
group: docs
---

# RiskValidationService

Service for managing and validating risk management configurations.

Maintains a registry of all configured risk profiles and validates
their existence before operations. Uses memoization for performance.

Key features:
- Registry management: addRisk() to register new risk profiles
- Validation: validate() ensures risk profile exists before use
- Memoization: validation results are cached by riskName:source for performance
- Listing: list() returns all registered risk profiles

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### _riskMap

```ts
_riskMap: any
```

### addRisk

```ts
addRisk: (riskName: string, riskSchema: IRiskSchema) => void
```

Adds a risk schema to the validation service

### validate

```ts
validate: (riskName: string, source: string) => void
```

Validates the existence of a risk profile

### list

```ts
list: () => Promise<IRiskSchema[]>
```

Returns a list of all registered risk schemas

---
title: docs/api-reference/class/RiskValidationService
group: docs
---

# RiskValidationService

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

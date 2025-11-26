---
title: docs/api-reference/interface/IRiskSchema
group: docs
---

# IRiskSchema

Risk schema registered via addRisk().
Defines portfolio-level risk controls via custom validations.

## Properties

### riskName

```ts
riskName: string
```

Unique risk profile identifier

### note

```ts
note: string
```

Optional developer note for documentation

### callbacks

```ts
callbacks: Partial<IRiskCallbacks>
```

Optional lifecycle event callbacks (onRejected, onAllowed)

### validations

```ts
validations: (IRiskValidationFn | IRiskValidation)[]
```

Custom validations array for risk logic

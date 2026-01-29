---
title: docs/interface/ValidationErrorNotification
group: docs
---

# ValidationErrorNotification

Validation error notification.
Emitted when risk validation functions throw errors.

## Properties

### type

```ts
type: "error.validation"
```

Discriminator for type-safe union

### id

```ts
id: string
```

Unique notification identifier

### error

```ts
error: object
```

Serialized error object with stack trace and metadata

### message

```ts
message: string
```

Human-readable validation error message

### backtest

```ts
backtest: boolean
```

Always false for error notifications (errors are from live context)

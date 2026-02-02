---
title: docs/interface/CriticalErrorNotification
group: docs
---

# CriticalErrorNotification

Critical error notification.
Emitted for fatal errors requiring process termination.

## Properties

### type

```ts
type: "error.critical"
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

Human-readable error message

### backtest

```ts
backtest: boolean
```

Always false for error notifications (errors are from live context)

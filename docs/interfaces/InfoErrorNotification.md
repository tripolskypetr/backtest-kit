---
title: docs/interface/InfoErrorNotification
group: docs
---

# InfoErrorNotification

Error notification.
Emitted for recoverable errors in background tasks.

## Properties

### type

```ts
type: "error.info"
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

### timestamp

```ts
timestamp: number
```

Unix timestamp in milliseconds when error occurred

### backtest

```ts
backtest: boolean
```

Always false for error notifications (errors are from live context)

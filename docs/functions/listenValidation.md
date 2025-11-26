---
title: docs/api-reference/function/listenValidation
group: docs
---

# listenValidation

```ts
declare function listenValidation(fn: (error: Error) => void): () => void;
```

Subscribes to risk validation errors with queued async processing.

Emits when risk validation functions throw errors during signal checking.
Useful for debugging and monitoring risk validation failures.
Events are processed sequentially in order received, even if callback is async.
Uses queued wrapper to prevent concurrent execution of the callback.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback function to handle validation errors |

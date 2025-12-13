---
title: docs/api-reference/interface/IRiskParams
group: docs
---

# IRiskParams

Risk parameters passed to ClientRisk constructor.
Combines schema with runtime dependencies and emission callbacks.

## Properties

### logger

```ts
logger: ILogger
```

Logger service for debug output

### onRejected

```ts
onRejected: (symbol: string, params: IRiskCheckArgs, activePositionCount: number, comment: string, timestamp: number) => void | Promise<void>
```

Callback invoked when a signal is rejected due to risk limits.
Called before emitting to riskSubject.
Used for event emission to riskSubject (separate from schema callbacks).

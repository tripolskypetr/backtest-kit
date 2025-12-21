---
title: docs/interface/IRiskParams
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

### backtest

```ts
backtest: boolean
```

True if backtest mode, false if live mode

### onRejected

```ts
onRejected: (symbol: string, params: IRiskCheckArgs, activePositionCount: number, comment: string, timestamp: number, backtest: boolean) => void | Promise<void>
```

Callback invoked when a signal is rejected due to risk limits.
Called before emitting to riskSubject.
Used for event emission to riskSubject (separate from schema callbacks).

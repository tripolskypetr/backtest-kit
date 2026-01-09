---
title: docs/interface/IRiskParams
group: docs
---

# IRiskParams

Risk parameters passed to ClientRisk constructor.
Combines schema with runtime dependencies and emission callbacks.

## Properties

### exchangeName

```ts
exchangeName: string
```

Exchange name (e.g., "binance")

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
onRejected: (symbol: string, params: IRiskCheckArgs, activePositionCount: number, rejectionResult: IRiskRejectionResult, timestamp: number, backtest: boolean) => void | Promise<...>
```

Callback invoked when a signal is rejected due to risk limits.
Called before emitting to riskSubject.
Used for event emission to riskSubject (separate from schema callbacks).

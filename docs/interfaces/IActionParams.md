---
title: docs/interface/IActionParams
group: docs
---

# IActionParams

Action parameters passed to ClientAction constructor.
Combines schema with runtime dependencies and execution context.

Extended from IActionSchema with:
- Logger instance for debugging and monitoring
- Strategy context (strategyName, frameName)
- Runtime environment flags

## Properties

### logger

```ts
logger: ILogger
```

Logger service for debugging and monitoring action execution

### strategyName

```ts
strategyName: string
```

Strategy identifier this action is attached to

### exchangeName

```ts
exchangeName: string
```

Exchange name (e.g., "binance")

### frameName

```ts
frameName: string
```

Timeframe identifier this action is attached to

### backtest

```ts
backtest: boolean
```

Whether running in backtest mode

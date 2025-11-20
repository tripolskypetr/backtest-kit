---
title: docs/api-reference/interface/IExecutionContext
group: docs
---

# IExecutionContext

Execution context containing runtime parameters for strategy/exchange operations.

Propagated through ExecutionContextService to provide implicit context
for getCandles(), tick(), backtest() and other operations.

## Properties

### symbol

```ts
symbol: string
```

Trading pair symbol (e.g., "BTCUSDT")

### when

```ts
when: Date
```

Current timestamp for operation

### backtest

```ts
backtest: boolean
```

Whether running in backtest mode (true) or live mode (false)

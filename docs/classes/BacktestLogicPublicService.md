---
title: docs/api-reference/class/BacktestLogicPublicService
group: docs
---

# BacktestLogicPublicService

Public service for backtest orchestration with context management.

Wraps BacktestLogicPrivateService with MethodContextService to provide
implicit context propagation for strategyName, exchangeName, and frameName.

This allows getCandles(), getSignal(), and other functions to work without
explicit context parameters.

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### backtestLogicPrivateService

```ts
backtestLogicPrivateService: any
```

### run

```ts
run: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => AsyncGenerator<IStrategyTickResultClosed, void, unknown>
```

Runs backtest for a symbol with context propagation.

Streams closed signals as async generator. Context is automatically
injected into all framework functions called during iteration.

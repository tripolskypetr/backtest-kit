---
title: docs/api-reference/class/BacktestGlobalService
group: docs
---

# BacktestGlobalService

Global service providing access to backtest functionality.

Simple wrapper around BacktestLogicPublicService for dependency injection.
Used by public API exports.

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### backtestLogicPublicService

```ts
backtestLogicPublicService: any
```

### run

```ts
run: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => AsyncGenerator<IStrategyTickResultClosed, void, unknown>
```

Runs backtest for a symbol with context propagation.

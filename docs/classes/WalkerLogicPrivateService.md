---
title: docs/api-reference/class/WalkerLogicPrivateService
group: docs
---

# WalkerLogicPrivateService

Private service for walker orchestration (strategy comparison).

Flow:
1. Yields progress updates as each strategy completes
2. Tracks best metric in real-time
3. Returns final results with all strategies ranked

Uses BacktestLogicPublicService internally for each strategy.

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

### backtestMarkdownService

```ts
backtestMarkdownService: any
```

### walkerSchemaService

```ts
walkerSchemaService: any
```

## Methods

### run

```ts
run(symbol: string, strategies: StrategyName[], metric: WalkerMetric, context: {
    exchangeName: string;
    frameName: string;
    walkerName: string;
}): AsyncGenerator<WalkerContract>;
```

Runs walker comparison for a symbol.

Executes backtest for each strategy sequentially.
Yields WalkerContract after each strategy completes.

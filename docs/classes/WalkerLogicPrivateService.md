---
title: docs/class/WalkerLogicPrivateService
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
loggerService: { readonly methodContextService: { readonly context: IMethodContext; }; readonly executionContextService: { readonly context: IExecutionContext; }; ... 7 more ...; setLogger: (logger: ILogger) => void; }
```

### backtestLogicPublicService

```ts
backtestLogicPublicService: BacktestLogicPublicService
```

### backtestMarkdownService

```ts
backtestMarkdownService: BacktestMarkdownService
```

### walkerSchemaService

```ts
walkerSchemaService: WalkerSchemaService
```

## Methods

### run

```ts
run(symbol: string, strategies: StrategyName[], metric: WalkerMetric, context: {
    exchangeName: ExchangeName;
    frameName: FrameName;
    walkerName: WalkerName;
}): AsyncGenerator<WalkerContract>;
```

Runs walker comparison for a symbol.

Executes backtest for each strategy sequentially.
Yields WalkerContract after each strategy completes.

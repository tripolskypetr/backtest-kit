---
title: docs/class/BacktestLogicPrivateService
group: docs
---

# BacktestLogicPrivateService

Private service for backtest orchestration using async generators.

Flow:
1. Get timeframes from frame service
2. Iterate through timeframes calling tick()
3. When signal opens: fetch candles and call backtest()
4. Skip timeframes until signal closes
5. Yield closed result and continue

Memory efficient: streams results without array accumulation.
Supports early termination via break in consumer.

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: { readonly methodContextService: { readonly context: IMethodContext; }; readonly executionContextService: { readonly context: IExecutionContext; }; ... 7 more ...; setLogger: (logger: ILogger) => void; }
```

### strategyCoreService

```ts
strategyCoreService: StrategyCoreService
```

### exchangeCoreService

```ts
exchangeCoreService: ExchangeCoreService
```

### frameCoreService

```ts
frameCoreService: FrameCoreService
```

### methodContextService

```ts
methodContextService: { readonly context: IMethodContext; }
```

### actionCoreService

```ts
actionCoreService: ActionCoreService
```

## Methods

### run

```ts
run(symbol: string): AsyncGenerator<IStrategyTickResultScheduled | IStrategyTickResultOpened | IStrategyTickResultClosed | IStrategyTickResultCancelled, void, any>;
```

Runs backtest for a symbol, streaming closed signals as async generator.

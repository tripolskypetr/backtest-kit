---
title: docs/api-reference/class/BacktestLogicPrivateService
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
loggerService: any
```

### strategyCoreService

```ts
strategyCoreService: any
```

### exchangeCoreService

```ts
exchangeCoreService: any
```

### frameCoreService

```ts
frameCoreService: any
```

### methodContextService

```ts
methodContextService: any
```

## Methods

### run

```ts
run(symbol: string): AsyncGenerator<IStrategyBacktestResult, void, unknown>;
```

Runs backtest for a symbol, streaming closed signals as async generator.

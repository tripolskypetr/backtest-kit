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

With `CC_BACKTEST_LOCKSTEP` every timeframe iteration runs under the
process-wide `Lockstep` mutex, so parallel backtests advance one
timeframe at a time instead of drifting apart in logical time.

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

### timeMetaService

```ts
timeMetaService: TimeMetaService
```

### priceMetaService

```ts
priceMetaService: PriceMetaService
```

### handoff

```ts
handoff: (symbol: string, timestamp: number, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Lock hand-off inside a candle replay (CC_BACKTEST_LOCKSTEP), called by
`StrategyConnectionService` from its `onSchedulePing` / `onActivePing`
system callbacks on every replayed candle. See {@link HANDOFF_FN }.

## Methods

### run

```ts
run(symbol: string): AsyncGenerator<IStrategyTickResultScheduled | IStrategyTickResultOpened | IStrategyTickResultClosed | IStrategyTickResultCancelled, void, any>;
```

Runs backtest for a symbol, streaming closed signals as async generator.

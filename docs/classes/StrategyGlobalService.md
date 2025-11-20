---
title: docs/api-reference/class/StrategyGlobalService
group: docs
---

# StrategyGlobalService

Global service for strategy operations with execution context injection.

Wraps StrategyConnectionService with ExecutionContextService to inject
symbol, when, and backtest parameters into the execution context.

Used internally by BacktestLogicPrivateService and LiveLogicPrivateService.

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### strategyConnectionService

```ts
strategyConnectionService: any
```

### tick

```ts
tick: (symbol: string, when: Date, backtest: boolean) => Promise<IStrategyTickResult>
```

Checks signal status at a specific timestamp.

Wraps strategy tick() with execution context containing symbol, timestamp,
and backtest mode flag.

### backtest

```ts
backtest: (symbol: string, candles: ICandleData[], when: Date, backtest: boolean) => Promise<IStrategyTickResultClosed>
```

Runs fast backtest against candle array.

Wraps strategy backtest() with execution context containing symbol,
timestamp, and backtest mode flag.

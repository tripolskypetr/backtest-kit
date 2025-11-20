---
title: docs/api-reference/class/StrategyConnectionService
group: docs
---

# StrategyConnectionService

Implements `IStrategy`

Connection service routing strategy operations to correct ClientStrategy instance.

Routes all IStrategy method calls to the appropriate strategy implementation
based on methodContextService.context.strategyName. Uses memoization to cache
ClientStrategy instances for performance.

Key features:
- Automatic strategy routing via method context
- Memoized ClientStrategy instances by strategyName
- Implements IStrategy interface
- Ensures initialization with waitForInit() before operations
- Handles both tick() (live) and backtest() operations

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### executionContextService

```ts
executionContextService: any
```

### strategySchemaService

```ts
strategySchemaService: any
```

### exchangeConnectionService

```ts
exchangeConnectionService: any
```

### methodContextService

```ts
methodContextService: any
```

### getStrategy

```ts
getStrategy: any
```

Retrieves memoized ClientStrategy instance for given strategy name.

Creates ClientStrategy on first call, returns cached instance on subsequent calls.
Cache key is strategyName string.

### tick

```ts
tick: () => Promise<IStrategyTickResult>
```

Executes live trading tick for current strategy.

Waits for strategy initialization before processing tick.
Evaluates current market conditions and returns signal state.

### backtest

```ts
backtest: (candles: ICandleData[]) => Promise<IStrategyTickResultClosed>
```

Executes backtest for current strategy with provided candles.

Waits for strategy initialization before processing candles.
Evaluates strategy signals against historical data.

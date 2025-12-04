---
title: docs/api-reference/class/BacktestUtils
group: docs
---

# BacktestUtils

Utility class for backtest operations.

Provides simplified access to backtestCommandService.run() with logging.
Exported as singleton instance for convenient usage.

## Constructor

```ts
constructor();
```

## Properties

### run

```ts
run: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => AsyncGenerator<IStrategyBacktestResult, void, unknown>
```

Runs backtest for a symbol with context propagation.

### background

```ts
background: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => () => void
```

Runs backtest in background without yielding results.

Consumes all backtest results internally without exposing them.
Useful for running backtests for side effects only (callbacks, logging).

### getData

```ts
getData: (symbol: string, strategyName: string) => Promise<BacktestStatistics>
```

Gets statistical data from all closed signals for a symbol-strategy pair.

### getReport

```ts
getReport: (symbol: string, strategyName: string) => Promise<string>
```

Generates markdown report with all closed signals for a symbol-strategy pair.

### dump

```ts
dump: (strategyName: string, path?: string) => Promise<void>
```

Saves strategy report to disk.

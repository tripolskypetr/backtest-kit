---
title: docs/api-reference/class/BacktestUtils
group: docs
---

# BacktestUtils

Utility class for backtest operations.

Provides simplified access to backtestGlobalService.run() with logging.
Exported as singleton instance for convenient usage.

## Constructor

```ts
constructor();
```

## Properties

### run

```ts
run: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => AsyncGenerator<IStrategyTickResultClosed, void, unknown>
```

Runs backtest for a symbol with context propagation.

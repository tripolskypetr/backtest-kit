---
title: docs/api-reference/class/LiveUtils
group: docs
---

# LiveUtils

Utility class for live trading operations.

Provides simplified access to liveGlobalService.run() with logging.
Exported as singleton instance for convenient usage.

Features:
- Infinite async generator (never completes)
- Crash recovery via persisted state
- Real-time progression with Date.now()

## Constructor

```ts
constructor();
```

## Properties

### run

```ts
run: (symbol: string, context: { strategyName: string; exchangeName: string; }) => AsyncGenerator<IStrategyTickResultOpened | IStrategyTickResultClosed | IStrategyTickResultCancelled, void, unknown>
```

Runs live trading for a symbol with context propagation.

Infinite async generator with crash recovery support.
Process can crash and restart - state will be recovered from disk.

### background

```ts
background: (symbol: string, context: { strategyName: string; exchangeName: string; }) => () => void
```

Runs live trading in background without yielding results.

Consumes all live trading results internally without exposing them.
Infinite loop - will run until process is stopped or crashes.
Useful for running live trading for side effects only (callbacks, persistence).

### getData

```ts
getData: (strategyName: string) => Promise<LiveStatistics>
```

Gets statistical data from all live trading events for a strategy.

### getReport

```ts
getReport: (strategyName: string) => Promise<string>
```

Generates markdown report with all events for a strategy.

### dump

```ts
dump: (strategyName: string, path?: string) => Promise<void>
```

Saves strategy report to disk.

---
title: docs/api-reference/class/LiveUtils
group: docs
---

# LiveUtils

Utility class for live trading operations.

Provides simplified access to liveCommandService.run() with logging.
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
run: (symbol: string, context: { strategyName: string; exchangeName: string; }) => AsyncGenerator<IStrategyTickResultOpened | IStrategyTickResultClosed, void, unknown>
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

### stop

```ts
stop: (symbol: string, strategyName: string) => Promise<void>
```

Stops the strategy from generating new signals.

Sets internal flag to prevent strategy from opening new signals.
Current active signal (if any) will complete normally.
Live trading will stop at the next safe point (idle/closed state).

### getData

```ts
getData: (symbol: string, strategyName: string) => Promise<LiveStatistics>
```

Gets statistical data from all live trading events for a symbol-strategy pair.

### getReport

```ts
getReport: (symbol: string, strategyName: string) => Promise<string>
```

Generates markdown report with all events for a symbol-strategy pair.

### dump

```ts
dump: (symbol: string, strategyName: string, path?: string) => Promise<void>
```

Saves strategy report to disk.

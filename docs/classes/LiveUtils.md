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
run: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => AsyncGenerator<IStrategyTickResultOpened | IStrategyTickResultClosed, void, unknown>
```

Runs live trading for a symbol with context propagation.

Infinite async generator with crash recovery support.
Process can crash and restart - state will be recovered from disk.

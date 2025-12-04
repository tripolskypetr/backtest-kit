---
title: docs/api-reference/class/LiveLogicPrivateService
group: docs
---

# LiveLogicPrivateService

Private service for live trading orchestration using async generators.

Flow:
1. Infinite while(true) loop for continuous monitoring
2. Create real-time date with new Date()
3. Call tick() to check signal status
4. Yield opened/closed results (skip idle/active)
5. Sleep for TICK_TTL between iterations

Features:
- Crash recovery via ClientStrategy.waitForInit()
- Real-time progression with new Date()
- Memory efficient streaming
- Never completes (infinite generator)

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### strategyGlobalService

```ts
strategyGlobalService: any
```

### methodContextService

```ts
methodContextService: any
```

## Methods

### run

```ts
run(symbol: string): AsyncGenerator<IStrategyTickResultOpened | IStrategyTickResultClosed, void, unknown>;
```

Runs live trading for a symbol, streaming results as async generator.

Infinite generator that yields opened and closed signals.
Process can crash and restart - state will be recovered from disk.

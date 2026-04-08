---
title: docs/interface/IActionStrategy
group: docs
---

# IActionStrategy

Strategy query interface exposed to action handlers via IActionParams.strategy.

Provides read-only access to the current signal state needed for
guard checks inside ActionProxy before invoking user callbacks.

Used by:
- ActionProxy.breakevenAvailable — skips if no pending signal
- ActionProxy.partialProfitAvailable — skips if no pending signal
- ActionProxy.partialLossAvailable — skips if no pending signal
- ActionProxy.pingActive — skips if no pending signal
- ActionProxy.pingScheduled — skips if no scheduled signal

## Methods

### hasPendingSignal

```ts
hasPendingSignal: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Checks if there is an active pending signal (open position) for the symbol.

### hasScheduledSignal

```ts
hasScheduledSignal: (backtest: boolean, symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }) => Promise<boolean>
```

Checks if there is a waiting scheduled signal for the symbol.

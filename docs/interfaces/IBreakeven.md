---
title: docs/interface/IBreakeven
group: docs
---

# IBreakeven

Breakeven tracking interface.
Implemented by ClientBreakeven and BreakevenConnectionService.

Tracks when a signal's stop-loss is moved to breakeven (entry price).
Emits events when threshold is reached (price moves far enough to cover transaction costs).

## Methods

### check

```ts
check: (symbol: string, data: IPublicSignalRow, currentPrice: number, backtest: boolean, when: Date) => Promise<boolean>
```

Checks if breakeven should be triggered and emits event if conditions met.

Called by ClientStrategy during signal monitoring.
Checks if:
1. Breakeven not already reached
2. Price has moved far enough to cover transaction costs
3. Stop-loss can be moved to entry price

If all conditions met:
- Marks breakeven as reached
- Calls onBreakeven callback (emits to breakevenSubject)
- Persists state to disk

### clear

```ts
clear: (symbol: string, data: IPublicSignalRow, priceClose: number, backtest: boolean) => Promise<void>
```

Clears breakeven state when signal closes.

Called by ClientStrategy when signal completes (TP/SL/time_expired).
Removes signal state from memory and persists changes to disk.
Cleans up memoized ClientBreakeven instance in BreakevenConnectionService.

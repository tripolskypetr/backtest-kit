---
title: docs/interface/IPartial
group: docs
---

# IPartial

Partial profit/loss tracking interface.
Implemented by ClientPartial and PartialConnectionService.

Tracks profit/loss level milestones for active trading signals.
Emits events when signals reach 10%, 20%, 30%, etc profit or loss.

## Methods

### profit

```ts
profit: (symbol: string, data: IPublicSignalRow, currentPrice: number, revenuePercent: number, backtest: boolean, when: Date) => Promise<void>
```

Processes profit state and emits events for new profit levels reached.

Called by ClientStrategy during signal monitoring when revenuePercent &gt; 0.
Checks which profit levels (10%, 20%, 30%, etc) have been reached
and emits events for new levels only (Set-based deduplication).

### loss

```ts
loss: (symbol: string, data: IPublicSignalRow, currentPrice: number, lossPercent: number, backtest: boolean, when: Date) => Promise<void>
```

Processes loss state and emits events for new loss levels reached.

Called by ClientStrategy during signal monitoring when revenuePercent &lt; 0.
Checks which loss levels (10%, 20%, 30%, etc) have been reached
and emits events for new levels only (Set-based deduplication).

### clear

```ts
clear: (symbol: string, data: IPublicSignalRow, priceClose: number, backtest: boolean) => Promise<void>
```

Clears partial profit/loss state when signal closes.

Called by ClientStrategy when signal completes (TP/SL/time_expired).
Removes signal state from memory and persists changes to disk.
Cleans up memoized ClientPartial instance in PartialConnectionService.

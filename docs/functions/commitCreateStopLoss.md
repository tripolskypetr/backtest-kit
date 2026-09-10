---
title: docs/function/commitCreateStopLoss
group: docs
---

# commitCreateStopLoss

```ts
declare function commitCreateStopLoss(symbol: string, payload?: Partial<CommitPayload>): Promise<void>;
```

Reports that the pending position's stop-loss order was actually filled on the exchange
(e.g. by candle high/low), forcing a close that bypasses the framework's touch-based SL check (closed-candle granularity).

The exchange and the strategy are parallel states: the framework evaluates SL/liquidation by closed-candle touch and TP by VWAP,
but the real order may fill on high/low. The close is deferred and emitted with closeReason
"stop_loss" on the next tick. No-op if no pending signal exists.

Automatically detects backtest/live mode from execution context.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
| `payload` | Optional commit payload with id and note |

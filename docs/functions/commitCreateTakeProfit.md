---
title: docs/function/commitCreateTakeProfit
group: docs
---

# commitCreateTakeProfit

```ts
declare function commitCreateTakeProfit(symbol: string, payload?: Partial<CommitPayload>): Promise<void>;
```

Reports that the pending position's take-profit order was actually filled on the exchange
(e.g. by candle high/low), forcing a close that bypasses the framework's VWAP-based TP check.

The exchange and the strategy are parallel states: the framework evaluates SL/liquidation by closed-candle touch and TP by VWAP,
but the real order may fill on high/low. The close is deferred and emitted with closeReason
"take_profit" on the next tick. No-op if no pending signal exists.

Automatically detects backtest/live mode from execution context.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
| `payload` | Optional commit payload with id and note |

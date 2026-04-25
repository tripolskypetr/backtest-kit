---
title: docs/function/setSessionData
group: docs
---

# setSessionData

```ts
declare function setSessionData<Value extends object = object>(symbol: string, value: Value | null): Promise<void>;
```

Writes a session value scoped to the current (symbol, strategy, exchange, frame) context.

Session data persists across candles within a single run and can survive process
restarts in live mode — useful for caching LLM inference results, intermediate
indicator state, or any cross-candle accumulator that is not tied to a specific signal.

Pass null to clear the session.

Automatically detects backtest/live mode from execution context.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
| `value` | New value or null to clear |

---
title: docs/function/getSessionData
group: docs
---

# getSessionData

```ts
declare function getSessionData<Value extends object = object>(symbol: string): Promise<Value | null>;
```

Reads the session value scoped to the current (symbol, strategy, exchange, frame) context.

Session data persists across candles within a single run and can survive process
restarts in live mode — useful for caching LLM inference results, intermediate
indicator state, or any cross-candle accumulator that is not tied to a specific signal.

Automatically detects backtest/live mode from execution context.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |

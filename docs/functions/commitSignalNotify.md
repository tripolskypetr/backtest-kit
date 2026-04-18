---
title: docs/function/commitSignalNotify
group: docs
---

# commitSignalNotify

```ts
declare function commitSignalNotify(symbol: string, payload?: Partial<SignalNotificationPayload>): Promise<void>;
```

Emits a `signal.info` notification for the currently active pending signal.

Broadcasts a user-defined informational note without affecting position state.
Useful for annotating strategy decisions, triggering external alerts, or logging
mid-position events (e.g. RSI crossing a threshold, volume spike detected).

Automatically reads backtest/live mode from execution context.
Automatically reads strategyName, exchangeName, frameName from method context.
Automatically fetches current price via getAveragePrice.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol (e.g. "BTCUSDT") |
| `payload` | Optional notification fields |

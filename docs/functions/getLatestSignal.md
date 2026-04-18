---
title: docs/function/getLatestSignal
group: docs
---

# getLatestSignal

```ts
declare function getLatestSignal(symbol: string): Promise<IPublicSignalRow | null>;
```

Returns the latest signal (pending or closed) for the current strategy context.

Does not distinguish between active and closed signals — returns whichever
was recorded last. Useful for cooldown logic: e.g. skip opening a new position
for 4 hours after a stop-loss by checking the timestamp of the latest signal
regardless of its outcome.

Searches backtest storage first, then live storage.
Returns null if no signal exists at all.

Automatically detects backtest/live mode from execution context.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |

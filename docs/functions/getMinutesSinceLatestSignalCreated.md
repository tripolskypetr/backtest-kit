---
title: docs/function/getMinutesSinceLatestSignalCreated
group: docs
---

# getMinutesSinceLatestSignalCreated

```ts
declare function getMinutesSinceLatestSignalCreated(symbol: string): Promise<number | null>;
```

Returns the number of whole minutes elapsed since the latest signal's creation timestamp.

Does not distinguish between active and closed signals — measures time since
whichever signal was recorded last. Useful for cooldown logic after a stop-loss.

Searches backtest storage first, then live storage.
Returns null if no signal exists at all.

Automatically detects backtest/live mode from execution context.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |

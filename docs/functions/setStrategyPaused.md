---
title: docs/function/setStrategyPaused
group: docs
---

# setStrategyPaused

```ts
declare function setStrategyPaused(symbol: string, paused: boolean): Promise<void>;
```

Pauses or resumes new position opening for the strategy.

While paused getSignal is NOT called and a queued createSignal DTO is NOT consumed
(it stays queued and drains after resume); existing pending/scheduled signals keep
being monitored and close normally. The flag is persisted and survives restarts and
signal transitions until an explicit setStrategyPaused(symbol, false). When the flag
actually flips, a PauseContract event is emitted (see listenPause) for notification
generation.

Automatically detects backtest/live mode from execution context.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
| `paused` | New paused state |

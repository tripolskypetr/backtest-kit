---
title: docs/function/getSignalState
group: docs
---

# getSignalState

```ts
declare function getSignalState<Value extends object = object>(symbol: string, dto: {
    bucketName: string;
    initialValue: Value;
}): Promise<Value>;
```

Reads the state value scoped to the current active signal.

Resolves the active pending signal automatically from execution context.
If no pending signal exists, logs a warning and returns the initialValue.

Automatically detects backtest/live mode from execution context.

Intended for LLM-driven capitulation strategies that accumulate per-trade
metrics (e.g. peakPercent, minutesOpen) across onActivePing ticks.
Profitable trades endure -0.5–2.5% drawdown and reach peak 2–3%+.
SL trades show peak &lt; 0.15% (Feb08, Feb13) or never go positive (Feb25).
Rule: if minutesOpen &gt;= N and peakPercent &lt; threshold (e.g. 0.3%) — exit.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
| `dto` | |

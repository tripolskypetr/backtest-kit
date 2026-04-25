---
title: docs/function/createSignalState
group: docs
---

# createSignalState

```ts
declare function createSignalState<Value extends object = object>(params: IStateParams<Value>): SignalStateTuple<Value>;
```

Creates a bound [getState, setState] tuple scoped to a bucket and initial value.

Both returned functions resolve the active pending or scheduled signal and the
backtest/live flag automatically from execution context — no signalId argument required.

Automatically detects backtest/live mode from execution context.

Intended for LLM-driven capitulation strategies that accumulate per-trade
metrics (e.g. peakPercent, minutesOpen) across onActivePing ticks.
Profitable trades endure -0.5–2.5% drawdown and reach peak 2–3%+.
SL trades show peak &lt; 0.15% (Feb08, Feb13) or never go positive (Feb25).
Rule: if minutesOpen &gt;= N and peakPercent &lt; threshold (e.g. 0.3%) — exit.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `params` | |

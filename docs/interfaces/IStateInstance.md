---
title: docs/interface/IStateInstance
group: docs
---

# IStateInstance

Interface for state instance implementations.
Defines the contract for local, persist, and dummy backends.

Intended use: per-signal mutable state for LLM-driven strategies that track
trade confirmation metrics across the position lifetime — e.g. peak unrealised PnL,
minutes since entry, and capitulation thresholds.

Example shape:
```ts
{ peakPercent: number; minutesOpen: number }
```
Profitable trades endure -0.5–2.5% drawdown yet still reach peak 2–3%+.
SL trades either never go positive (Feb25) or show peak &lt; 0.15% (Feb08, Feb13).
Capitulation rule: if position open N minutes and peak &lt; threshold (e.g. 0.3%) —
LLM thesis was not confirmed by market, exit immediately.

## Methods

### waitForInit

```ts
waitForInit: (initial: boolean) => Promise<void>
```

Initialize the state instance.

### getState

```ts
getState: <Value extends object = object>() => Promise<Value>
```

Read the current state value.

### setState

```ts
setState: <Value extends object = object>(dispatch: Value | Dispatch<Value>) => Promise<Value>
```

Update the state value.

### dispose

```ts
dispose: () => Promise<void>
```

Releases any resources held by this instance.

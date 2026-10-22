---
title: docs/interface/IBudgetContext
group: docs
---

# IBudgetContext

Context of a static (context-free) budget call: the record key, the budget
name, the logical time of the action and the symbol that authored it.
Mirrors the dto of `State._getState` / `State._setState` with the record key
in place of `signalId`.

## Properties

### strategyName

```ts
strategyName: string
```

Strategy name of the run (part of the record key)

### exchangeName

```ts
exchangeName: string
```

Exchange name of the run (part of the record key)

### frameName

```ts
frameName: string
```

Frame name of the run (part of the record key; empty string in live mode)

### backtest

```ts
backtest: boolean
```

Backtest or live record (part of the record key)

### name

```ts
name: string
```

Budget name — the bucket inside the record

### when

```ts
when: Date
```

Logical time of the read / the action's `timestamp`

### symbol

```ts
symbol: string
```

Symbol that authors the history row (null for a call without a symbol)

### initialCapital

```ts
initialCapital: number
```

Initial capital of the record when this call is the first one to create it
(static callers outside the strategy module, e.g. listeners). Ignored once
the record exists. A call that would CREATE the record without it is
refused with BudgetMissingError: a record created with a guessed capital
could never be repaired by a later call.
